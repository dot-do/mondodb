/**
 * Global setup for compatibility tests
 */

import { MongoMemoryServer } from 'mongodb-memory-server'

let mongoServer: MongoMemoryServer | null = null

export async function setup() {
  // Pre-download MongoDB binaries
  console.log('Ensuring MongoDB binaries are available...')
  mongoServer = await MongoMemoryServer.create()
  console.log('MongoDB binaries ready')
  await mongoServer.stop()
  mongoServer = null
}

export async function teardown() {
  if (mongoServer) {
    await mongoServer.stop()
  }
}
