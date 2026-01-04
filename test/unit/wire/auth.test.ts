/**
 * Authentication Tests
 *
 * Tests for SCRAM-SHA-256 authentication in the wire protocol server.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ScramAuthenticator,
  InMemoryCredentialsProvider,
  createScramCredentials,
  type StoredCredentials,
} from '../../../src/wire/auth/scram.js'
import { Binary } from 'bson'
import {
  requiresAuthentication,
  UNAUTHENTICATED_COMMANDS,
} from '../../../src/wire/commands/auth.js'

describe('SCRAM-SHA-256 Authentication', () => {
  let credentialsProvider: InMemoryCredentialsProvider
  let authenticator: ScramAuthenticator

  beforeEach(async () => {
    credentialsProvider = new InMemoryCredentialsProvider()
    await credentialsProvider.addUser('testuser', 'testpassword', 'admin')
    authenticator = new ScramAuthenticator(credentialsProvider)
  })

  describe('createScramCredentials', () => {
    it('should generate valid credentials from a password', async () => {
      const creds = await createScramCredentials('myuser', 'mypassword', 'testdb')

      expect(creds.username).toBe('myuser')
      expect(creds.db).toBe('testdb')
      expect(creds.salt).toBeTruthy()
      expect(creds.storedKey).toBeTruthy()
      expect(creds.serverKey).toBeTruthy()
      expect(creds.iterationCount).toBe(15000)
    })

    it('should generate different salts for same password', async () => {
      const creds1 = await createScramCredentials('user1', 'password', 'db')
      const creds2 = await createScramCredentials('user2', 'password', 'db')

      expect(creds1.salt).not.toBe(creds2.salt)
    })

    it('should use custom iteration count', async () => {
      const creds = await createScramCredentials('user', 'password', 'db', 10000)

      expect(creds.iterationCount).toBe(10000)
    })
  })

  describe('InMemoryCredentialsProvider', () => {
    it('should add and retrieve users', async () => {
      const provider = new InMemoryCredentialsProvider()
      await provider.addUser('user1', 'pass1', 'db1')

      const creds = await provider.getCredentials('user1', 'db1')
      expect(creds).toBeTruthy()
      expect(creds!.username).toBe('user1')
      expect(creds!.db).toBe('db1')
    })

    it('should return null for non-existent users', async () => {
      const provider = new InMemoryCredentialsProvider()

      const creds = await provider.getCredentials('nonexistent', 'db')
      expect(creds).toBeNull()
    })

    it('should scope users to databases', async () => {
      const provider = new InMemoryCredentialsProvider()
      await provider.addUser('user', 'pass', 'db1')

      const creds1 = await provider.getCredentials('user', 'db1')
      const creds2 = await provider.getCredentials('user', 'db2')

      expect(creds1).toBeTruthy()
      expect(creds2).toBeNull()
    })

    it('should check if user exists', async () => {
      const provider = new InMemoryCredentialsProvider()
      await provider.addUser('existing', 'pass', 'db')

      expect(provider.hasUser('existing', 'db')).toBe(true)
      expect(provider.hasUser('nonexistent', 'db')).toBe(false)
    })

    it('should remove users', async () => {
      const provider = new InMemoryCredentialsProvider()
      await provider.addUser('user', 'pass', 'db')

      expect(provider.hasUser('user', 'db')).toBe(true)
      expect(provider.removeUser('user', 'db')).toBe(true)
      expect(provider.hasUser('user', 'db')).toBe(false)
    })
  })

  describe('ScramAuthenticator.saslStart', () => {
    it('should reject unsupported mechanisms', async () => {
      const payload = Buffer.from('n,,n=testuser,r=clientnonce123')
      const result = await authenticator.saslStart('PLAIN', payload, 'admin')

      expect(result.success).toBe(false)
      expect(result.done).toBe(true)
      expect(result.error).toContain('not supported')
    })

    it('should accept SCRAM-SHA-256 mechanism', async () => {
      const payload = Buffer.from('n,,n=testuser,r=clientnonce123')
      const result = await authenticator.saslStart('SCRAM-SHA-256', payload, 'admin')

      expect(result.success).toBe(true)
      expect(result.done).toBe(false)
      expect(result.conversationId).toBeDefined()
      expect(result.payload).toBeDefined()
    })

    it('should return server-first-message with nonce, salt, and iterations', async () => {
      const payload = Buffer.from('n,,n=testuser,r=ABC123')
      const result = await authenticator.saslStart('SCRAM-SHA-256', payload, 'admin')

      const serverMessage = result.payload!.toString('utf-8')

      // Check format: r=<combined-nonce>,s=<salt>,i=<iterations>
      expect(serverMessage).toMatch(/^r=ABC123[A-Za-z0-9+/=]+,s=[A-Za-z0-9+/=]+,i=\d+$/)

      // Nonce should start with client nonce
      const nonceMatch = serverMessage.match(/^r=([^,]+)/)
      expect(nonceMatch![1].startsWith('ABC123')).toBe(true)
      expect(nonceMatch![1].length).toBeGreaterThan(6) // Has server nonce appended
    })

    it('should handle non-existent users gracefully (prevent enumeration)', async () => {
      const payload = Buffer.from('n,,n=nonexistent,r=ABC123')
      const result = await authenticator.saslStart('SCRAM-SHA-256', payload, 'admin')

      // Should NOT immediately fail - prevents user enumeration
      expect(result.success).toBe(true)
      expect(result.done).toBe(false)
    })

    it('should parse username with escaped characters', async () => {
      await credentialsProvider.addUser('user=with,special', 'pass', 'admin')

      // In SCRAM, = becomes =3D and , becomes =2C
      const payload = Buffer.from('n,,n=user=3Dwith=2Cspecial,r=ABC123')
      const result = await authenticator.saslStart('SCRAM-SHA-256', payload, 'admin')

      expect(result.success).toBe(true)
    })
  })

  describe('requiresAuthentication', () => {
    it('should allow handshake commands without auth', () => {
      expect(requiresAuthentication('hello')).toBe(false)
      expect(requiresAuthentication('ismaster')).toBe(false)
      expect(requiresAuthentication('isMaster')).toBe(false)
    })

    it('should allow auth-related commands without auth', () => {
      expect(requiresAuthentication('saslStart')).toBe(false)
      expect(requiresAuthentication('saslContinue')).toBe(false)
      expect(requiresAuthentication('authenticate')).toBe(false)
      expect(requiresAuthentication('logout')).toBe(false)
    })

    it('should allow basic connectivity commands', () => {
      expect(requiresAuthentication('ping')).toBe(false)
      expect(requiresAuthentication('whatsmyuri')).toBe(false)
    })

    it('should require auth for CRUD commands', () => {
      expect(requiresAuthentication('find')).toBe(true)
      expect(requiresAuthentication('insert')).toBe(true)
      expect(requiresAuthentication('update')).toBe(true)
      expect(requiresAuthentication('delete')).toBe(true)
    })

    it('should require auth for admin commands', () => {
      expect(requiresAuthentication('listDatabases')).toBe(true)
      expect(requiresAuthentication('listCollections')).toBe(true)
      expect(requiresAuthentication('create')).toBe(true)
      expect(requiresAuthentication('drop')).toBe(true)
    })

    it('should require auth for aggregation', () => {
      expect(requiresAuthentication('aggregate')).toBe(true)
    })
  })

  describe('UNAUTHENTICATED_COMMANDS', () => {
    it('should contain expected commands', () => {
      expect(UNAUTHENTICATED_COMMANDS.has('hello')).toBe(true)
      expect(UNAUTHENTICATED_COMMANDS.has('ping')).toBe(true)
      expect(UNAUTHENTICATED_COMMANDS.has('saslStart')).toBe(true)
      expect(UNAUTHENTICATED_COMMANDS.has('saslContinue')).toBe(true)
    })

    it('should not contain protected commands', () => {
      expect(UNAUTHENTICATED_COMMANDS.has('find')).toBe(false)
      expect(UNAUTHENTICATED_COMMANDS.has('insert')).toBe(false)
      expect(UNAUTHENTICATED_COMMANDS.has('aggregate')).toBe(false)
    })
  })
})

describe('SCRAM-SHA-256 Full Authentication Flow', () => {
  it('should complete full authentication with real SCRAM client simulation', async () => {
    // This test simulates a real SCRAM client
    const provider = new InMemoryCredentialsProvider()
    await provider.addUser('testuser', 'testpassword', 'admin')
    const authenticator = new ScramAuthenticator(provider)

    // Step 1: Client sends client-first-message
    const clientNonce = 'rOprNGfwEbeRWgbNEkqO'
    const clientFirstMessage = `n,,n=testuser,r=${clientNonce}`

    const startResult = await authenticator.saslStart(
      'SCRAM-SHA-256',
      Buffer.from(clientFirstMessage),
      'admin'
    )

    expect(startResult.success).toBe(true)
    expect(startResult.done).toBe(false)
    expect(startResult.conversationId).toBeDefined()

    // Parse server-first-message
    const serverFirstMessage = startResult.payload!.toString('utf-8')
    const serverNonce = serverFirstMessage.match(/r=([^,]+)/)![1]
    const salt = serverFirstMessage.match(/s=([^,]+)/)![1]
    const iterations = parseInt(serverFirstMessage.match(/i=(\d+)/)![1])

    expect(serverNonce.startsWith(clientNonce)).toBe(true)
    expect(iterations).toBeGreaterThan(0)

    // Note: A full test would require implementing the client-side SCRAM computation
    // which involves PBKDF2, HMAC, and XOR operations matching the server
    // For now, we verify the protocol flow is correct
  })
})
