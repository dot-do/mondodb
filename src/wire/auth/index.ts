/**
 * Authentication module exports
 */

export {
  ScramAuthenticator,
  InMemoryCredentialsProvider,
  createScramCredentials,
  type StoredCredentials,
  type ScramConversation,
  type ScramResult,
  type CredentialsProvider,
} from './scram.js'
