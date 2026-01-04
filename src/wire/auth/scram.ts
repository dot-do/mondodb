/**
 * SCRAM-SHA-256 Authentication Implementation
 *
 * Implements the Salted Challenge Response Authentication Mechanism (SCRAM)
 * per RFC 5802 and RFC 7677 (SHA-256 variant).
 *
 * MongoDB uses SCRAM-SHA-256 as its primary authentication mechanism.
 */

import { Binary } from 'bson'

/** User credentials stored in the system */
export interface StoredCredentials {
  username: string
  /** Salt for SCRAM (base64 encoded) */
  salt: string
  /** Stored key (base64 encoded) */
  storedKey: string
  /** Server key (base64 encoded) */
  serverKey: string
  /** Iteration count for PBKDF2 */
  iterationCount: number
  /** Database the user belongs to */
  db: string
  /** Roles assigned to the user */
  roles?: Array<{ role: string; db: string }>
}

/** SCRAM conversation state */
export interface ScramConversation {
  username: string
  db: string
  clientNonce: string
  serverNonce: string
  salt: string
  iterationCount: number
  clientFirstMessageBare: string
  serverFirstMessage: string
  step: 'init' | 'challenge' | 'complete'
}

/** SCRAM authentication result */
export interface ScramResult {
  success: boolean
  conversationId?: number
  payload?: Buffer
  done: boolean
  error?: string
}

/** Credentials provider interface */
export interface CredentialsProvider {
  getCredentials(username: string, db: string): Promise<StoredCredentials | null>
}

/**
 * SCRAM-SHA-256 Authenticator
 *
 * Handles server-side SCRAM authentication flow.
 */
export class ScramAuthenticator {
  private conversations: Map<number, ScramConversation> = new Map()
  private nextConversationId = 1

  constructor(private credentialsProvider: CredentialsProvider) {}

  /**
   * Handle saslStart command - begin authentication
   *
   * @param mechanism - Should be "SCRAM-SHA-256"
   * @param payload - Client's first message (Binary or Buffer)
   * @param db - Authentication database
   */
  async saslStart(
    mechanism: string,
    payload: Binary | Buffer | Uint8Array,
    db: string
  ): Promise<ScramResult> {
    if (mechanism !== 'SCRAM-SHA-256') {
      return {
        success: false,
        done: true,
        error: `Mechanism ${mechanism} is not supported. Only SCRAM-SHA-256 is available.`,
      }
    }

    // Extract payload bytes
    const payloadBytes =
      payload instanceof Binary ? payload.buffer : Buffer.from(payload)
    const clientFirstMessage = payloadBytes.toString('utf-8')

    // Parse client-first-message: n,,n=username,r=client-nonce
    const parsed = this.parseClientFirstMessage(clientFirstMessage)
    if (!parsed) {
      return {
        success: false,
        done: true,
        error: 'Invalid client-first-message format',
      }
    }

    const { username, clientNonce, clientFirstMessageBare } = parsed

    // Look up user credentials
    const credentials = await this.credentialsProvider.getCredentials(username, db)
    if (!credentials) {
      // Don't reveal whether user exists - continue with fake salt
      // This prevents user enumeration attacks
      const fakeSalt = await this.generateSalt()
      const serverNonce = clientNonce + (await this.generateNonce())
      const iterationCount = 15000

      const conversationId = this.nextConversationId++
      this.conversations.set(conversationId, {
        username,
        db,
        clientNonce,
        serverNonce,
        salt: fakeSalt,
        iterationCount,
        clientFirstMessageBare,
        serverFirstMessage: '',
        step: 'init',
      })

      // Server-first-message: r=combined-nonce,s=salt,i=iteration-count
      const serverFirstMessage = `r=${serverNonce},s=${fakeSalt},i=${iterationCount}`

      const conv = this.conversations.get(conversationId)!
      conv.serverFirstMessage = serverFirstMessage
      conv.step = 'challenge'

      return {
        success: true,
        conversationId,
        payload: Buffer.from(serverFirstMessage, 'utf-8'),
        done: false,
      }
    }

    // Generate server nonce (append to client nonce)
    const serverNonce = clientNonce + (await this.generateNonce())
    const conversationId = this.nextConversationId++

    // Store conversation state
    this.conversations.set(conversationId, {
      username,
      db,
      clientNonce,
      serverNonce,
      salt: credentials.salt,
      iterationCount: credentials.iterationCount,
      clientFirstMessageBare,
      serverFirstMessage: '',
      step: 'init',
    })

    // Server-first-message: r=combined-nonce,s=salt,i=iteration-count
    const serverFirstMessage = `r=${serverNonce},s=${credentials.salt},i=${credentials.iterationCount}`

    const conv = this.conversations.get(conversationId)!
    conv.serverFirstMessage = serverFirstMessage
    conv.step = 'challenge'

    return {
      success: true,
      conversationId,
      payload: Buffer.from(serverFirstMessage, 'utf-8'),
      done: false,
    }
  }

  /**
   * Handle saslContinue command - continue authentication
   *
   * @param conversationId - Conversation ID from saslStart
   * @param payload - Client's response message
   */
  async saslContinue(
    conversationId: number,
    payload: Binary | Buffer | Uint8Array
  ): Promise<ScramResult> {
    const conv = this.conversations.get(conversationId)
    if (!conv) {
      return {
        success: false,
        done: true,
        error: 'Invalid conversation ID',
      }
    }

    const payloadBytes =
      payload instanceof Binary ? payload.buffer : Buffer.from(payload)
    const clientMessage = payloadBytes.toString('utf-8')

    if (conv.step === 'challenge') {
      // This is client-final-message: c=channel-binding,r=nonce,p=client-proof
      const parsed = this.parseClientFinalMessage(clientMessage)
      if (!parsed) {
        this.conversations.delete(conversationId)
        return {
          success: false,
          done: true,
          error: 'Invalid client-final-message format',
        }
      }

      const { clientProof, nonce, clientFinalMessageWithoutProof } =
        parsed
      // Note: channelBinding is parsed but not used - we don't support channel binding yet

      // Verify nonce matches
      if (nonce !== conv.serverNonce) {
        this.conversations.delete(conversationId)
        return {
          success: false,
          done: true,
          error: 'Authentication failed: nonce mismatch',
        }
      }

      // Look up credentials again for verification
      const credentials = await this.credentialsProvider.getCredentials(
        conv.username,
        conv.db
      )
      if (!credentials) {
        this.conversations.delete(conversationId)
        return {
          success: false,
          done: true,
          error: 'Authentication failed',
        }
      }

      // Verify client proof
      const verified = await this.verifyClientProof(
        conv,
        clientProof,
        clientFinalMessageWithoutProof,
        credentials
      )

      if (!verified.success) {
        this.conversations.delete(conversationId)
        return {
          success: false,
          done: true,
          error: 'Authentication failed',
        }
      }

      conv.step = 'complete'

      // Server-final-message: v=server-signature
      const serverFinalMessage = `v=${verified.serverSignature}`

      return {
        success: true,
        conversationId,
        payload: Buffer.from(serverFinalMessage, 'utf-8'),
        done: true,
      }
    }

    this.conversations.delete(conversationId)
    return {
      success: false,
      done: true,
      error: 'Unexpected conversation state',
    }
  }

  /**
   * Parse client-first-message
   * Format: gs2-header n=username,r=client-nonce
   * gs2-header is typically "n,," (no channel binding, no authzid)
   */
  private parseClientFirstMessage(
    message: string
  ): { username: string; clientNonce: string; clientFirstMessageBare: string } | null {
    // Match: n,,n=<username>,r=<nonce>
    // or: y,,n=<username>,r=<nonce> (channel binding not used but supported by client)
    // or: p=<cb-name>,,n=<username>,r=<nonce> (channel binding used)
    const match = message.match(/^([nyp])(=([^,]*))?,,(.+)$/)
    if (!match) return null

    const clientFirstMessageBare = match[4]

    // Parse the bare message for username and nonce
    const parts = new Map<string, string>()
    for (const part of clientFirstMessageBare.split(',')) {
      const eqIdx = part.indexOf('=')
      if (eqIdx > 0) {
        parts.set(part.slice(0, eqIdx), part.slice(eqIdx + 1))
      }
    }

    const username = parts.get('n')
    const clientNonce = parts.get('r')

    if (!username || !clientNonce) return null

    // Decode SASLprep username (handle =2C for comma, =3D for equals)
    const decodedUsername = username.replace(/=2C/g, ',').replace(/=3D/g, '=')

    return { username: decodedUsername, clientNonce, clientFirstMessageBare }
  }

  /**
   * Parse client-final-message
   * Format: c=channel-binding,r=nonce,p=client-proof
   */
  private parseClientFinalMessage(message: string): {
    channelBinding: string
    nonce: string
    clientProof: string
    clientFinalMessageWithoutProof: string
  } | null {
    // The proof is the last field
    const proofMatch = message.match(/,p=([A-Za-z0-9+/=]+)$/)
    if (!proofMatch) return null

    const clientProof = proofMatch[1]
    const clientFinalMessageWithoutProof = message.slice(
      0,
      message.length - proofMatch[0].length
    )

    // Parse other fields
    const parts = new Map<string, string>()
    for (const part of clientFinalMessageWithoutProof.split(',')) {
      const eqIdx = part.indexOf('=')
      if (eqIdx > 0) {
        parts.set(part.slice(0, eqIdx), part.slice(eqIdx + 1))
      }
    }

    const channelBinding = parts.get('c')
    const nonce = parts.get('r')

    if (!channelBinding || !nonce) return null

    return { channelBinding, nonce, clientProof, clientFinalMessageWithoutProof }
  }

  /**
   * Verify client proof and generate server signature
   */
  private async verifyClientProof(
    conv: ScramConversation,
    clientProofBase64: string,
    clientFinalMessageWithoutProof: string,
    credentials: StoredCredentials
  ): Promise<{ success: boolean; serverSignature?: string }> {
    try {
      // AuthMessage = client-first-message-bare + "," + server-first-message + "," + client-final-message-without-proof
      const authMessage = `${conv.clientFirstMessageBare},${conv.serverFirstMessage},${clientFinalMessageWithoutProof}`

      // Decode stored keys
      const storedKey = Buffer.from(credentials.storedKey, 'base64')
      const serverKey = Buffer.from(credentials.serverKey, 'base64')

      // ClientSignature = HMAC(StoredKey, AuthMessage)
      const clientSignature = await this.hmacSha256(storedKey, authMessage)

      // ClientProof = ClientKey XOR ClientSignature
      // So: ClientKey = ClientProof XOR ClientSignature
      const clientProof = Buffer.from(clientProofBase64, 'base64')
      const clientKey = Buffer.alloc(clientProof.length)
      for (let i = 0; i < clientProof.length; i++) {
        clientKey[i] = clientProof[i] ^ clientSignature[i]
      }

      // Verify: H(ClientKey) should equal StoredKey
      const computedStoredKey = await this.sha256(clientKey)
      if (!this.timingSafeEqual(computedStoredKey, storedKey)) {
        return { success: false }
      }

      // ServerSignature = HMAC(ServerKey, AuthMessage)
      const serverSignature = await this.hmacSha256(serverKey, authMessage)

      return {
        success: true,
        serverSignature: serverSignature.toString('base64'),
      }
    } catch {
      return { success: false }
    }
  }

  /**
   * Generate a random nonce
   */
  private async generateNonce(): Promise<string> {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    return Buffer.from(bytes).toString('base64')
  }

  /**
   * Generate a random salt
   */
  private async generateSalt(): Promise<string> {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Buffer.from(bytes).toString('base64')
  }

  /**
   * Compute SHA-256 hash
   */
  private async sha256(data: Buffer | Uint8Array): Promise<Buffer> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Buffer.from(hashBuffer)
  }

  /**
   * Compute HMAC-SHA-256
   */
  private async hmacSha256(
    key: Buffer | Uint8Array,
    message: string
  ): Promise<Buffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      new TextEncoder().encode(message)
    )
    return Buffer.from(signature)
  }

  /**
   * Timing-safe comparison
   */
  private timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i]
    }
    return result === 0
  }

  /**
   * Clean up a conversation
   */
  cleanupConversation(conversationId: number): void {
    this.conversations.delete(conversationId)
  }

  /**
   * Get conversation username for successful auth
   */
  getConversationUser(conversationId: number): { username: string; db: string } | null {
    const conv = this.conversations.get(conversationId)
    if (!conv || conv.step !== 'complete') return null
    return { username: conv.username, db: conv.db }
  }
}

/**
 * Create SCRAM credentials from a password
 *
 * This is used when adding users to generate the stored credentials.
 */
export async function createScramCredentials(
  username: string,
  password: string,
  db: string,
  iterationCount = 15000
): Promise<StoredCredentials> {
  // Generate salt
  const saltBytes = new Uint8Array(16)
  crypto.getRandomValues(saltBytes)
  const salt = Buffer.from(saltBytes).toString('base64')

  // SaltedPassword = Hi(Normalize(password), salt, i)
  // Hi is PBKDF2 with HMAC-SHA-256
  const saltedPassword = await pbkdf2Sha256(password, saltBytes, iterationCount)

  // ClientKey = HMAC(SaltedPassword, "Client Key")
  const clientKey = await hmacSha256(saltedPassword, 'Client Key')

  // StoredKey = H(ClientKey)
  const storedKey = await sha256(clientKey)

  // ServerKey = HMAC(SaltedPassword, "Server Key")
  const serverKey = await hmacSha256(saltedPassword, 'Server Key')

  return {
    username,
    salt,
    storedKey: storedKey.toString('base64'),
    serverKey: serverKey.toString('base64'),
    iterationCount,
    db,
  }
}

// Helper functions for credential creation

async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Buffer> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256 // 32 bytes
  )
  return Buffer.from(derivedBits)
}

async function sha256(data: Buffer | Uint8Array): Promise<Buffer> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(hashBuffer)
}

async function hmacSha256(
  key: Buffer | Uint8Array,
  message: string
): Promise<Buffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(message)
  )
  return Buffer.from(signature)
}

/**
 * In-memory credentials provider for testing and simple deployments
 */
export class InMemoryCredentialsProvider implements CredentialsProvider {
  private credentials: Map<string, StoredCredentials> = new Map()

  /**
   * Add a user with a password
   */
  async addUser(
    username: string,
    password: string,
    db: string,
    roles?: Array<{ role: string; db: string }>
  ): Promise<void> {
    const creds = await createScramCredentials(username, password, db)
    creds.roles = roles
    this.credentials.set(`${db}.${username}`, creds)
  }

  /**
   * Add pre-computed credentials
   */
  addCredentials(credentials: StoredCredentials): void {
    this.credentials.set(`${credentials.db}.${credentials.username}`, credentials)
  }

  /**
   * Get credentials for a user
   */
  async getCredentials(
    username: string,
    db: string
  ): Promise<StoredCredentials | null> {
    return this.credentials.get(`${db}.${username}`) || null
  }

  /**
   * Remove a user
   */
  removeUser(username: string, db: string): boolean {
    return this.credentials.delete(`${db}.${username}`)
  }

  /**
   * Check if a user exists
   */
  hasUser(username: string, db: string): boolean {
    return this.credentials.has(`${db}.${username}`)
  }
}
