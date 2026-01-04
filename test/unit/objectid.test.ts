import { describe, it, expect, beforeEach } from 'vitest'
import { ObjectId } from '../../src/types/objectid'

describe('ObjectId', () => {
  describe('generation', () => {
    it('generates a 24 hex character string', () => {
      const oid = new ObjectId()
      const hex = oid.toHexString()

      expect(hex).toHaveLength(24)
      expect(hex).toMatch(/^[0-9a-f]{24}$/)
    })

    it('is unique across calls', () => {
      const ids = new Set<string>()
      const count = 1000

      for (let i = 0; i < count; i++) {
        ids.add(new ObjectId().toHexString())
      }

      expect(ids.size).toBe(count)
    })

    it('includes timestamp component', () => {
      const before = Math.floor(Date.now() / 1000)
      const oid = new ObjectId()
      const after = Math.floor(Date.now() / 1000)

      const timestamp = oid.getTimestamp()
      const timestampSeconds = Math.floor(timestamp.getTime() / 1000)

      expect(timestampSeconds).toBeGreaterThanOrEqual(before)
      expect(timestampSeconds).toBeLessThanOrEqual(after)
    })
  })

  describe('createFromHexString', () => {
    it('can be created from a valid hex string', () => {
      const hexString = '507f1f77bcf86cd799439011'
      const oid = ObjectId.createFromHexString(hexString)

      expect(oid.toHexString()).toBe(hexString)
    })

    it('throws error for invalid hex string length', () => {
      expect(() => ObjectId.createFromHexString('507f1f77')).toThrow()
    })

    it('throws error for invalid hex characters', () => {
      expect(() => ObjectId.createFromHexString('507f1f77bcf86cd79943901g')).toThrow()
    })

    it('preserves timestamp from hex string', () => {
      // Timestamp: 1350508407 (2012-10-17T21:13:27.000Z)
      // First 4 bytes of '507f1f77...' = 0x507f1f77 = 1350508407
      const hexString = '507f1f77bcf86cd799439011'
      const oid = ObjectId.createFromHexString(hexString)

      const timestamp = oid.getTimestamp()
      expect(timestamp.getTime()).toBe(1350508407 * 1000)
    })
  })

  describe('comparison', () => {
    it('equals another ObjectId with the same value', () => {
      const hex = '507f1f77bcf86cd799439011'
      const oid1 = ObjectId.createFromHexString(hex)
      const oid2 = ObjectId.createFromHexString(hex)

      expect(oid1.equals(oid2)).toBe(true)
    })

    it('does not equal an ObjectId with a different value', () => {
      const oid1 = new ObjectId()
      const oid2 = new ObjectId()

      expect(oid1.equals(oid2)).toBe(false)
    })

    it('can compare with hex string', () => {
      const hex = '507f1f77bcf86cd799439011'
      const oid = ObjectId.createFromHexString(hex)

      expect(oid.equals(hex)).toBe(true)
      expect(oid.equals('000000000000000000000000')).toBe(false)
    })

    it('supports toString for comparison', () => {
      const hex = '507f1f77bcf86cd799439011'
      const oid = ObjectId.createFromHexString(hex)

      expect(oid.toString()).toBe(hex)
      expect(String(oid)).toBe(hex)
    })
  })

  describe('validation', () => {
    it('validates correct ObjectId strings', () => {
      expect(ObjectId.isValid('507f1f77bcf86cd799439011')).toBe(true)
      expect(ObjectId.isValid('000000000000000000000000')).toBe(true)
      expect(ObjectId.isValid('ffffffffffffffffffffffff')).toBe(true)
    })

    it('rejects invalid ObjectId strings', () => {
      expect(ObjectId.isValid('507f1f77')).toBe(false)
      expect(ObjectId.isValid('507f1f77bcf86cd79943901g')).toBe(false)
      expect(ObjectId.isValid('')).toBe(false)
      expect(ObjectId.isValid('not-an-objectid')).toBe(false)
    })

    it('validates ObjectId instances', () => {
      const oid = new ObjectId()
      expect(ObjectId.isValid(oid)).toBe(true)
    })
  })

  describe('BSON compatibility', () => {
    it('has correct _bsontype', () => {
      const oid = new ObjectId()
      expect(oid._bsontype).toBe('ObjectId')
    })

    it('exposes id as Buffer-like (Uint8Array)', () => {
      const oid = new ObjectId()
      expect(oid.id).toBeInstanceOf(Uint8Array)
      expect(oid.id.length).toBe(12)
    })

    it('can create from Uint8Array', () => {
      const bytes = new Uint8Array([
        0x50, 0x7f, 0x1f, 0x77, 0xbc, 0xf8, 0x6c, 0xd7, 0x99, 0x43, 0x90, 0x11
      ])
      const oid = new ObjectId(bytes)

      expect(oid.toHexString()).toBe('507f1f77bcf86cd799439011')
    })
  })

  describe('JSON serialization', () => {
    it('serializes to JSON as hex string', () => {
      const hex = '507f1f77bcf86cd799439011'
      const oid = ObjectId.createFromHexString(hex)

      expect(JSON.stringify(oid)).toBe(`"${hex}"`)
    })

    it('can be used in object JSON serialization', () => {
      const hex = '507f1f77bcf86cd799439011'
      const oid = ObjectId.createFromHexString(hex)
      const obj = { _id: oid, name: 'test' }

      expect(JSON.stringify(obj)).toBe(`{"_id":"${hex}","name":"test"}`)
    })
  })
})
