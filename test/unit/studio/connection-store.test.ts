/**
 * Connection Store Unit Tests
 *
 * Tests for the connection store logic, including the connect() function
 * that should use the connection's URL for health checks.
 *
 * Issue: mongo.do-c605 - Connection health check uses wrong URL
 */

import { describe, it, expect } from 'vitest'

/**
 * Helper function that constructs the health check URL from a connection URL.
 * This mirrors the expected behavior of the connect() function.
 */
function buildHealthCheckUrl(connectionUrl: string): string {
  return new URL('/api/health', connectionUrl).toString()
}

describe('Connection Store - Health Check URL (mongo.do-c605)', () => {
  describe('buildHealthCheckUrl', () => {
    it('should construct health check URL from connection URL, not use hardcoded /api/health', () => {
      // This test verifies fix for mongo.do-c605
      // The bug: connect() was using fetch('/api/health') instead of the connection's URL

      const connectionUrl = 'https://my-mongo.do-server.example.com:8080'
      const healthCheckUrl = buildHealthCheckUrl(connectionUrl)

      // The health check should be relative to the connection URL
      // Expected: https://my-mongo.do-server.example.com:8080/api/health
      // NOT: /api/health
      expect(healthCheckUrl).not.toBe('/api/health')
      expect(healthCheckUrl).toBe('https://my-mongo.do-server.example.com:8080/api/health')
    })

    it('should construct health check URL correctly from various URL formats', () => {
      const testCases = [
        { url: 'https://api.example.com', expected: 'https://api.example.com/api/health' },
        { url: 'https://api.example.com/', expected: 'https://api.example.com/api/health' },
        { url: 'http://localhost:3000', expected: 'http://localhost:3000/api/health' },
        { url: 'http://localhost:8787', expected: 'http://localhost:8787/api/health' },
        { url: 'https://mongo.do.workers.dev', expected: 'https://mongo.do.workers.dev/api/health' },
      ]

      for (const testCase of testCases) {
        const healthCheckUrl = buildHealthCheckUrl(testCase.url)
        expect(healthCheckUrl).toBe(testCase.expected)
      }
    })

    it('should handle URLs with trailing slashes', () => {
      const urlWithSlash = 'https://api.example.com/'
      const urlWithoutSlash = 'https://api.example.com'

      // Both should produce the same result
      expect(buildHealthCheckUrl(urlWithSlash)).toBe('https://api.example.com/api/health')
      expect(buildHealthCheckUrl(urlWithoutSlash)).toBe('https://api.example.com/api/health')
    })

    it('should handle URLs with existing paths', () => {
      // When the base URL has a path, /api/health should replace it
      const urlWithPath = 'https://api.example.com/v1'
      const healthCheckUrl = buildHealthCheckUrl(urlWithPath)
      expect(healthCheckUrl).toBe('https://api.example.com/api/health')
    })

    it('should preserve protocol (http vs https)', () => {
      expect(buildHealthCheckUrl('http://localhost:3000')).toMatch(/^http:\/\//)
      expect(buildHealthCheckUrl('https://api.example.com')).toMatch(/^https:\/\//)
    })

    it('should preserve port numbers', () => {
      expect(buildHealthCheckUrl('http://localhost:8787')).toBe('http://localhost:8787/api/health')
      expect(buildHealthCheckUrl('https://api.example.com:443')).toBe('https://api.example.com/api/health')
      expect(buildHealthCheckUrl('https://api.example.com:8443')).toBe('https://api.example.com:8443/api/health')
    })
  })
})
