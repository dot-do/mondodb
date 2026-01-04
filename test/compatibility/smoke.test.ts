import { describe, it, expect } from 'vitest'
import { MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'

describe('Compatibility Test Dependencies', () => {
  it('mongodb package loads correctly', () => {
    expect(MongoClient).toBeDefined()
    expect(typeof MongoClient).toBe('function')
  })

  it('mongodb-memory-server package loads correctly', () => {
    expect(MongoMemoryServer).toBeDefined()
    expect(typeof MongoMemoryServer.create).toBe('function')
  })
})
