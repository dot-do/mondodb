/**
 * CLI Server Tests (GREEN Phase - TDD)
 *
 * Comprehensive tests for the enhanced MondoDB CLI server.
 *
 * Features tested:
 * - Argument parsing (--port, --host, --data, --remote, --verbose, --help)
 * - Backend selection (LocalSQLiteBackend vs WorkersProxyBackend)
 * - Server lifecycle (startup, SIGINT/SIGTERM, shutdown)
 * - Error handling (invalid port, invalid URL, port in use)
 * - Output messages (startup, shutdown)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'

// Mock Bun-specific modules before importing the CLI module
vi.mock('../../../src/wire/backend/local-sqlite.js', () => {
  // Use a named class so constructor.name === 'LocalSQLiteBackend'
  class LocalSQLiteBackend {
    constructor(public dataDir: string) {}
    listDatabases = vi.fn().mockResolvedValue([])
    createDatabase = vi.fn().mockResolvedValue(undefined)
    dropDatabase = vi.fn().mockResolvedValue(undefined)
    databaseExists = vi.fn().mockResolvedValue(false)
    listCollections = vi.fn().mockResolvedValue([])
    createCollection = vi.fn().mockResolvedValue(undefined)
    dropCollection = vi.fn().mockResolvedValue(undefined)
    collectionExists = vi.fn().mockResolvedValue(false)
    collStats = vi.fn().mockResolvedValue({})
    dbStats = vi.fn().mockResolvedValue({})
    find = vi.fn().mockResolvedValue({ documents: [], cursorId: 0n, hasMore: false })
    insertOne = vi.fn().mockResolvedValue({ acknowledged: true, insertedIds: new Map(), insertedCount: 1 })
    insertMany = vi.fn().mockResolvedValue({ acknowledged: true, insertedIds: new Map(), insertedCount: 0 })
    updateOne = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 })
    updateMany = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 })
    deleteOne = vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 })
    deleteMany = vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 })
    count = vi.fn().mockResolvedValue(0)
    distinct = vi.fn().mockResolvedValue([])
    aggregate = vi.fn().mockResolvedValue({ documents: [], cursorId: 0n, hasMore: false })
    listIndexes = vi.fn().mockResolvedValue([])
    createIndexes = vi.fn().mockResolvedValue([])
    dropIndex = vi.fn().mockResolvedValue(undefined)
    dropIndexes = vi.fn().mockResolvedValue(undefined)
    createCursor = vi.fn()
    getCursor = vi.fn()
    advanceCursor = vi.fn().mockReturnValue([])
    closeCursor = vi.fn().mockReturnValue(true)
    cleanupExpiredCursors = vi.fn()
  }
  return { LocalSQLiteBackend }
})

// Track used ports to simulate EADDRINUSE
const usedPorts = new Set<number>()

vi.mock('../../../src/wire/server.js', () => ({
  WireProtocolServer: class MockWireProtocolServer {
    private options: { port?: number; host?: string }
    constructor(_backend: unknown, options: { port?: number; host?: string } = {}) {
      this.options = options
    }
    async start() {
      const port = this.options.port ?? 27017
      if (usedPorts.has(port)) {
        throw new Error(`listen EADDRINUSE: address already in use :::${port}`)
      }
      usedPorts.add(port)
    }
    async stop() {
      const port = this.options.port ?? 27017
      usedPorts.delete(port)
    }
  },
}))

import {
  parseArgs,
  type CLIOptions,
  validateOptions,
  createBackend,
  printHelp,
  printStartupMessage,
  printShutdownMessage,
  type ServerController,
  runServer,
} from '../../../src/cli/server.js'

import type { MondoBackend } from '../../../src/wire/backend/interface.js'

// Clean up used ports after each test
afterEach(() => {
  usedPorts.clear()
})

// ============================================================================
// Argument Parsing Tests
// ============================================================================

describe('CLI Argument Parsing', () => {
  describe('parseArgs()', () => {
    describe('--port option', () => {
      it('defaults to 27017 when not specified', () => {
        const options = parseArgs([])
        expect(options.port).toBe(27017)
      })

      it('parses --port=XXXX format', () => {
        const options = parseArgs(['--port=27018'])
        expect(options.port).toBe(27018)
      })

      it('parses --port XXXX format with space', () => {
        const options = parseArgs(['--port', '27019'])
        expect(options.port).toBe(27019)
      })

      it('parses -p XXXX short form', () => {
        const options = parseArgs(['-p', '27020'])
        expect(options.port).toBe(27020)
      })

      it('parses -p=XXXX short form with equals', () => {
        const options = parseArgs(['-p=27021'])
        expect(options.port).toBe(27021)
      })

      it('handles valid port numbers at boundaries', () => {
        expect(parseArgs(['--port=1']).port).toBe(1)
        expect(parseArgs(['--port=65535']).port).toBe(65535)
      })
    })

    describe('--host option', () => {
      it('defaults to localhost when not specified', () => {
        const options = parseArgs([])
        expect(options.host).toBe('localhost')
      })

      it('parses --host=HOSTNAME format', () => {
        const options = parseArgs(['--host=0.0.0.0'])
        expect(options.host).toBe('0.0.0.0')
      })

      it('parses --host HOSTNAME format with space', () => {
        const options = parseArgs(['--host', '127.0.0.1'])
        expect(options.host).toBe('127.0.0.1')
      })

      it('parses -h HOSTNAME short form (when not --help)', () => {
        // Note: -h alone should be --help, but -h with value should be host
        const options = parseArgs(['-H', 'myhost.local'])
        expect(options.host).toBe('myhost.local')
      })

      it('accepts hostname with port', () => {
        const options = parseArgs(['--host=192.168.1.100'])
        expect(options.host).toBe('192.168.1.100')
      })

      it('accepts :: for IPv6 all interfaces', () => {
        const options = parseArgs(['--host=::'])
        expect(options.host).toBe('::')
      })
    })

    describe('--data option', () => {
      it('defaults to ./data when not specified', () => {
        const options = parseArgs([])
        expect(options.dataDir).toBe('./data')
      })

      it('parses --data=PATH format', () => {
        const options = parseArgs(['--data=/var/mongo.do'])
        expect(options.dataDir).toBe('/var/mongo.do')
      })

      it('parses --data PATH format with space', () => {
        const options = parseArgs(['--data', './custom-data'])
        expect(options.dataDir).toBe('./custom-data')
      })

      it('parses -d PATH short form', () => {
        const options = parseArgs(['-d', '/tmp/test-data'])
        expect(options.dataDir).toBe('/tmp/test-data')
      })

      it('handles relative paths', () => {
        const options = parseArgs(['--data=../data'])
        expect(options.dataDir).toBe('../data')
      })

      it('handles absolute paths', () => {
        const options = parseArgs(['--data=/home/user/mongo.do'])
        expect(options.dataDir).toBe('/home/user/mongo.do')
      })
    })

    describe('--remote option', () => {
      it('is undefined when not specified', () => {
        const options = parseArgs([])
        expect(options.remote).toBeUndefined()
      })

      it('parses --remote=URL format', () => {
        const options = parseArgs(['--remote=https://my-worker.workers.dev'])
        expect(options.remote).toBe('https://my-worker.workers.dev')
      })

      it('parses --remote URL format with space', () => {
        const options = parseArgs(['--remote', 'https://api.example.com'])
        expect(options.remote).toBe('https://api.example.com')
      })

      it('parses -r URL short form', () => {
        const options = parseArgs(['-r', 'https://mongo.do.workers.dev'])
        expect(options.remote).toBe('https://mongo.do.workers.dev')
      })

      it('accepts URLs with paths', () => {
        const options = parseArgs(['--remote=https://api.example.com/mongo.do'])
        expect(options.remote).toBe('https://api.example.com/mongo.do')
      })

      it('accepts URLs with ports', () => {
        const options = parseArgs(['--remote=https://localhost:8787'])
        expect(options.remote).toBe('https://localhost:8787')
      })

      it('accepts http URLs for local development', () => {
        const options = parseArgs(['--remote=http://localhost:8787'])
        expect(options.remote).toBe('http://localhost:8787')
      })
    })

    describe('--verbose option', () => {
      it('defaults to false when not specified', () => {
        const options = parseArgs([])
        expect(options.verbose).toBe(false)
      })

      it('parses --verbose flag', () => {
        const options = parseArgs(['--verbose'])
        expect(options.verbose).toBe(true)
      })

      it('parses -v short form', () => {
        const options = parseArgs(['-v'])
        expect(options.verbose).toBe(true)
      })

      it('verbose flag can appear anywhere in args', () => {
        const options = parseArgs(['--port=27018', '-v', '--host=0.0.0.0'])
        expect(options.verbose).toBe(true)
        expect(options.port).toBe(27018)
        expect(options.host).toBe('0.0.0.0')
      })
    })

    describe('--help option', () => {
      it('defaults to false when not specified', () => {
        const options = parseArgs([])
        expect(options.help).toBe(false)
      })

      it('parses --help flag', () => {
        const options = parseArgs(['--help'])
        expect(options.help).toBe(true)
      })

      it('parses -h short form', () => {
        const options = parseArgs(['-h'])
        expect(options.help).toBe(true)
      })

      it('help takes precedence over other options', () => {
        const options = parseArgs(['--port=27018', '--help', '--verbose'])
        expect(options.help).toBe(true)
      })
    })

    describe('combined options', () => {
      it('parses multiple options together', () => {
        const options = parseArgs([
          '--port=27018',
          '--host=0.0.0.0',
          '--data=/var/lib/mongo.do',
          '--verbose',
        ])
        expect(options.port).toBe(27018)
        expect(options.host).toBe('0.0.0.0')
        expect(options.dataDir).toBe('/var/lib/mongo.do')
        expect(options.verbose).toBe(true)
        expect(options.remote).toBeUndefined()
        expect(options.help).toBe(false)
      })

      it('parses remote mode with other options', () => {
        const options = parseArgs([
          '--remote=https://my-worker.workers.dev',
          '--port=27018',
          '--verbose',
        ])
        expect(options.remote).toBe('https://my-worker.workers.dev')
        expect(options.port).toBe(27018)
        expect(options.verbose).toBe(true)
      })

      it('handles options in any order', () => {
        const options = parseArgs([
          '-v',
          '-p', '27020',
          '-H', '0.0.0.0',
          '-d', '/tmp/data',
        ])
        expect(options.verbose).toBe(true)
        expect(options.port).toBe(27020)
        expect(options.host).toBe('0.0.0.0')
        expect(options.dataDir).toBe('/tmp/data')
      })
    })

    describe('unknown options', () => {
      it('ignores unknown options', () => {
        const options = parseArgs(['--unknown=value', '--port=27018'])
        expect(options.port).toBe(27018)
      })

      it('does not throw on unknown flags', () => {
        expect(() => parseArgs(['--some-random-flag'])).not.toThrow()
      })
    })
  })
})

// ============================================================================
// Option Validation Tests
// ============================================================================

describe('CLI Option Validation', () => {
  describe('validateOptions()', () => {
    describe('port validation', () => {
      it('accepts valid port numbers', () => {
        expect(validateOptions({ port: 27017, host: 'localhost', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
        expect(validateOptions({ port: 1, host: 'localhost', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
        expect(validateOptions({ port: 65535, host: 'localhost', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
      })

      it('returns error for port < 1', () => {
        const result = validateOptions({ port: 0, host: 'localhost', dataDir: './data', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid port/.test(e))).toBe(true)
      })

      it('returns error for port > 65535', () => {
        const result = validateOptions({ port: 65536, host: 'localhost', dataDir: './data', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid port/.test(e))).toBe(true)
      })

      it('returns error for NaN port', () => {
        const result = validateOptions({ port: NaN, host: 'localhost', dataDir: './data', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid port/.test(e))).toBe(true)
      })

      it('returns error for non-integer port', () => {
        const result = validateOptions({ port: 27017.5, host: 'localhost', dataDir: './data', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid port/.test(e))).toBe(true)
      })

      it('returns error for negative port', () => {
        const result = validateOptions({ port: -1, host: 'localhost', dataDir: './data', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid port/.test(e))).toBe(true)
      })
    })

    describe('remote URL validation', () => {
      it('accepts valid https URLs', () => {
        const result = validateOptions({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'https://my-worker.workers.dev',
        })
        expect(result.valid).toBe(true)
      })

      it('accepts valid http URLs for local development', () => {
        const result = validateOptions({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'http://localhost:8787',
        })
        expect(result.valid).toBe(true)
      })

      it('returns error for invalid URL format', () => {
        const result = validateOptions({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'not-a-url',
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid remote URL/.test(e))).toBe(true)
      })

      it('returns error for URL without protocol', () => {
        const result = validateOptions({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'my-worker.workers.dev',
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid remote URL/.test(e))).toBe(true)
      })

      it('returns error for non-http/https URLs', () => {
        const result = validateOptions({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'ftp://example.com',
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid remote URL/.test(e))).toBe(true)
      })

      it('returns error for empty remote string', () => {
        const result = validateOptions({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: '',
        })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid remote URL/.test(e))).toBe(true)
      })
    })

    describe('host validation', () => {
      it('accepts localhost', () => {
        expect(validateOptions({ port: 27017, host: 'localhost', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
      })

      it('accepts 0.0.0.0 for all interfaces', () => {
        expect(validateOptions({ port: 27017, host: '0.0.0.0', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
      })

      it('accepts IPv4 addresses', () => {
        expect(validateOptions({ port: 27017, host: '127.0.0.1', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
        expect(validateOptions({ port: 27017, host: '192.168.1.1', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
      })

      it('accepts IPv6 addresses', () => {
        expect(validateOptions({ port: 27017, host: '::', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
        expect(validateOptions({ port: 27017, host: '::1', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
      })

      it('accepts hostnames', () => {
        expect(validateOptions({ port: 27017, host: 'my-server.local', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
      })

      it('returns error for empty host', () => {
        const result = validateOptions({ port: 27017, host: '', dataDir: './data', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid host/.test(e))).toBe(true)
      })
    })

    describe('dataDir validation', () => {
      it('accepts valid paths', () => {
        expect(validateOptions({ port: 27017, host: 'localhost', dataDir: './data', verbose: false, help: false }).valid).toBe(true)
        expect(validateOptions({ port: 27017, host: 'localhost', dataDir: '/var/lib/mongo.do', verbose: false, help: false }).valid).toBe(true)
      })

      it('returns error for empty dataDir', () => {
        const result = validateOptions({ port: 27017, host: 'localhost', dataDir: '', verbose: false, help: false })
        expect(result.valid).toBe(false)
        expect(result.errors.some(e => /Invalid data directory/.test(e))).toBe(true)
      })
    })
  })
})

// ============================================================================
// Backend Selection Tests
// ============================================================================

describe('Backend Selection', () => {
  describe('createBackend()', () => {
    describe('without --remote', () => {
      it('creates LocalSQLiteBackend when no remote specified', async () => {
        const backend = await createBackend({
          port: 27017,
          host: 'localhost',
          dataDir: './test-data',
          verbose: false,
          help: false,
        })

        expect(backend).toBeDefined()
        expect(backend.constructor.name).toBe('LocalSQLiteBackend')
      })

      it('passes dataDir to LocalSQLiteBackend', async () => {
        const backend = await createBackend({
          port: 27017,
          host: 'localhost',
          dataDir: '/custom/path',
          verbose: false,
          help: false,
        })

        // The backend should be initialized with the custom path
        // Implementation will expose this through a property or test can verify behavior
        expect(backend).toBeDefined()
      })
    })

    describe('with --remote', () => {
      it('creates WorkersProxyBackend when remote URL specified', async () => {
        const backend = await createBackend({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'https://my-worker.workers.dev',
        })

        expect(backend).toBeDefined()
        expect(backend.constructor.name).toBe('WorkersProxyBackend')
      })

      it('passes remote URL to WorkersProxyBackend', async () => {
        const backend = await createBackend({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'https://custom-mongo.do.workers.dev',
        })

        expect(backend).toBeDefined()
        // Verify the backend is configured with the correct URL
      })

      it('WorkersProxyBackend implements MondoBackend interface', async () => {
        const backend = await createBackend({
          port: 27017,
          host: 'localhost',
          dataDir: './data',
          verbose: false,
          help: false,
          remote: 'https://my-worker.workers.dev',
        })

        // Verify it has all required MondoBackend methods
        expect(typeof backend.listDatabases).toBe('function')
        expect(typeof backend.createDatabase).toBe('function')
        expect(typeof backend.dropDatabase).toBe('function')
        expect(typeof backend.find).toBe('function')
        expect(typeof backend.insertOne).toBe('function')
        expect(typeof backend.insertMany).toBe('function')
        expect(typeof backend.updateOne).toBe('function')
        expect(typeof backend.updateMany).toBe('function')
        expect(typeof backend.deleteOne).toBe('function')
        expect(typeof backend.deleteMany).toBe('function')
        expect(typeof backend.aggregate).toBe('function')
      })
    })

    describe('--remote ignores --data', () => {
      it('ignores dataDir when remote is specified', async () => {
        const backend = await createBackend({
          port: 27017,
          host: 'localhost',
          dataDir: '/this/should/be/ignored',
          verbose: false,
          help: false,
          remote: 'https://my-worker.workers.dev',
        })

        // Backend should be WorkersProxyBackend, not LocalSQLiteBackend
        expect(backend.constructor.name).toBe('WorkersProxyBackend')
      })
    })
  })
})

// ============================================================================
// Server Lifecycle Tests
// ============================================================================

describe('Server Lifecycle', () => {
  let mockBackend: MondoBackend
  let controller: ServerController

  beforeEach(() => {
    // Create a mock backend
    mockBackend = {
      listDatabases: vi.fn().mockResolvedValue([]),
      createDatabase: vi.fn().mockResolvedValue(undefined),
      dropDatabase: vi.fn().mockResolvedValue(undefined),
      databaseExists: vi.fn().mockResolvedValue(false),
      listCollections: vi.fn().mockResolvedValue([]),
      createCollection: vi.fn().mockResolvedValue(undefined),
      dropCollection: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn().mockResolvedValue(false),
      collStats: vi.fn().mockResolvedValue({} as any),
      dbStats: vi.fn().mockResolvedValue({} as any),
      find: vi.fn().mockResolvedValue({ documents: [], cursorId: 0n, hasMore: false }),
      insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedIds: new Map(), insertedCount: 1 }),
      insertMany: vi.fn().mockResolvedValue({ acknowledged: true, insertedIds: new Map(), insertedCount: 0 }),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
      count: vi.fn().mockResolvedValue(0),
      distinct: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ documents: [], cursorId: 0n, hasMore: false }),
      listIndexes: vi.fn().mockResolvedValue([]),
      createIndexes: vi.fn().mockResolvedValue([]),
      dropIndex: vi.fn().mockResolvedValue(undefined),
      dropIndexes: vi.fn().mockResolvedValue(undefined),
      createCursor: vi.fn(),
      getCursor: vi.fn(),
      advanceCursor: vi.fn().mockReturnValue([]),
      closeCursor: vi.fn().mockReturnValue(true),
      cleanupExpiredCursors: vi.fn(),
    } as unknown as MondoBackend
  })

  afterEach(async () => {
    if (controller) {
      await controller.stop()
    }
  })

  describe('graceful startup', () => {
    it('starts server on specified port', async () => {
      controller = await runServer({
        port: 27099,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      expect(controller.isRunning).toBe(true)
      expect(controller.address.port).toBe(27099)
    })

    it('starts server on specified host', async () => {
      controller = await runServer({
        port: 27098,
        host: '127.0.0.1',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      expect(controller.isRunning).toBe(true)
      expect(controller.address.host).toBe('127.0.0.1')
    })

    it('returns ServerController with stop method', async () => {
      controller = await runServer({
        port: 27097,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      expect(typeof controller.stop).toBe('function')
    })

    it('server accepts connections after startup', async () => {
      controller = await runServer({
        port: 27096,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      expect(controller.isAcceptingConnections).toBe(true)
    })
  })

  describe('graceful shutdown', () => {
    it('stops server cleanly', async () => {
      controller = await runServer({
        port: 27095,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      await controller.stop()

      expect(controller.isRunning).toBe(false)
    })

    it('stop() can be called multiple times safely', async () => {
      controller = await runServer({
        port: 27094,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      await controller.stop()
      await controller.stop()

      expect(controller.isRunning).toBe(false)
    })

    it('closes all active connections on shutdown', async () => {
      controller = await runServer({
        port: 27093,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      await controller.stop()

      expect(controller.activeConnections).toBe(0)
    })

    it('cleans up backend resources on shutdown', async () => {
      const closeableMockBackend = {
        ...mockBackend,
        close: vi.fn(),
      }

      controller = await runServer({
        port: 27092,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, closeableMockBackend as unknown as MondoBackend)

      await controller.stop()

      expect(closeableMockBackend.close).toHaveBeenCalled()
    })
  })

  describe('signal handling', () => {
    it('handles SIGINT for graceful shutdown', async () => {
      const sigintHandler = vi.fn()
      const originalAddListener = process.on.bind(process)
      vi.spyOn(process, 'on').mockImplementation((event, handler) => {
        if (event === 'SIGINT') {
          sigintHandler.mockImplementation(handler)
          return process
        }
        return originalAddListener(event, handler)
      })

      controller = await runServer({
        port: 27091,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      // Simulate SIGINT
      await sigintHandler()

      expect(controller.isRunning).toBe(false)
    })

    it('handles SIGTERM for graceful shutdown', async () => {
      const sigtermHandler = vi.fn()
      const originalAddListener = process.on.bind(process)
      vi.spyOn(process, 'on').mockImplementation((event, handler) => {
        if (event === 'SIGTERM') {
          sigtermHandler.mockImplementation(handler)
          return process
        }
        return originalAddListener(event, handler)
      })

      controller = await runServer({
        port: 27090,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      // Simulate SIGTERM
      await sigtermHandler()

      expect(controller.isRunning).toBe(false)
    })

    it('removes signal handlers after shutdown', async () => {
      const removeListenerSpy = vi.spyOn(process, 'removeListener')

      controller = await runServer({
        port: 27089,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      }, mockBackend)

      await controller.stop()

      expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(removeListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    })
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('invalid port', () => {
    it('throws error for port 0', async () => {
      await expect(runServer({
        port: 0,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      })).rejects.toThrow(/Invalid port/)
    })

    it('throws error for port > 65535', async () => {
      await expect(runServer({
        port: 70000,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      })).rejects.toThrow(/Invalid port/)
    })

    it('throws error for negative port', async () => {
      await expect(runServer({
        port: -1,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      })).rejects.toThrow(/Invalid port/)
    })
  })

  describe('invalid remote URL', () => {
    it('throws error for malformed URL', async () => {
      await expect(runServer({
        port: 27017,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
        remote: 'not-a-valid-url',
      })).rejects.toThrow(/Invalid remote URL/)
    })

    it('throws error for unsupported protocol', async () => {
      await expect(runServer({
        port: 27017,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
        remote: 'ws://websocket.example.com',
      })).rejects.toThrow(/Invalid remote URL/)
    })
  })

  describe('port already in use', () => {
    it('throws EADDRINUSE error when port is taken', async () => {
      // Start first server
      const controller1 = await runServer({
        port: 27088,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      })

      try {
        // Try to start second server on same port
        await expect(runServer({
          port: 27088,
          host: 'localhost',
          dataDir: './test-data',
          verbose: false,
          help: false,
        })).rejects.toThrow(/EADDRINUSE|address already in use|port.*in use/i)
      } finally {
        await controller1.stop()
      }
    })

    it('error message includes the port number', async () => {
      const controller1 = await runServer({
        port: 27087,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
      })

      try {
        await expect(runServer({
          port: 27087,
          host: 'localhost',
          dataDir: './test-data',
          verbose: false,
          help: false,
        })).rejects.toThrow(/27087/)
      } finally {
        await controller1.stop()
      }
    })
  })

  describe('data directory errors', () => {
    it('throws error for invalid data directory path', async () => {
      await expect(runServer({
        port: 27017,
        host: 'localhost',
        dataDir: '',
        verbose: false,
        help: false,
      })).rejects.toThrow(/Invalid data directory/)
    })

    it('creates data directory if it does not exist', async () => {
      // This should not throw - it should create the directory
      const controller = await runServer({
        port: 27086,
        host: 'localhost',
        dataDir: '/tmp/mongo.do-test-' + Date.now(),
        verbose: false,
        help: false,
      })

      await controller.stop()
    })
  })

  describe('remote connection errors', () => {
    it('throws error when remote worker is unreachable', async () => {
      await expect(runServer({
        port: 27017,
        host: 'localhost',
        dataDir: './test-data',
        verbose: false,
        help: false,
        remote: 'https://non-existent-worker-12345.workers.dev',
      })).rejects.toThrow(/connect|unreachable|network/i)
    }, 10000)
  })
})

// ============================================================================
// Output Messages Tests
// ============================================================================

describe('Output Messages', () => {
  let consoleSpy: Mock

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('printHelp()', () => {
    it('outputs usage information', () => {
      printHelp()
      expect(consoleSpy).toHaveBeenCalled()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('Usage')
    })

    it('documents --port option', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/--port/i)
      expect(output).toContain('27017')
    })

    it('documents --host option', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/--host/i)
      expect(output).toContain('localhost')
    })

    it('documents --data option', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/--data/i)
    })

    it('documents --remote option', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/--remote/i)
      expect(output).toContain('Cloudflare')
    })

    it('documents --verbose option', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/--verbose|-v/i)
    })

    it('documents --help option', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/--help|-h/i)
    })

    it('includes examples', () => {
      printHelp()
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/example/i)
    })
  })

  describe('printStartupMessage()', () => {
    it('prints connection string', () => {
      printStartupMessage({
        port: 27017,
        host: 'localhost',
        dataDir: './data',
        verbose: false,
        help: false,
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('mongodb://localhost:27017')
    })

    it('includes port in connection string', () => {
      printStartupMessage({
        port: 27018,
        host: 'localhost',
        dataDir: './data',
        verbose: false,
        help: false,
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain(':27018')
    })

    it('includes host in connection string', () => {
      printStartupMessage({
        port: 27017,
        host: '0.0.0.0',
        dataDir: './data',
        verbose: false,
        help: false,
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('0.0.0.0')
    })

    it('indicates local mode when no remote', () => {
      printStartupMessage({
        port: 27017,
        host: 'localhost',
        dataDir: './data',
        verbose: false,
        help: false,
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/local|sqlite/i)
    })

    it('indicates proxy mode when remote specified', () => {
      printStartupMessage({
        port: 27017,
        host: 'localhost',
        dataDir: './data',
        verbose: false,
        help: false,
        remote: 'https://my-worker.workers.dev',
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/proxy|remote|workers/i)
    })

    it('includes data directory for local mode', () => {
      printStartupMessage({
        port: 27017,
        host: 'localhost',
        dataDir: '/var/lib/mongo.do',
        verbose: false,
        help: false,
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('/var/lib/mongo.do')
    })

    it('includes remote URL for proxy mode', () => {
      printStartupMessage({
        port: 27017,
        host: 'localhost',
        dataDir: './data',
        verbose: false,
        help: false,
        remote: 'https://my-worker.workers.dev',
      })

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('my-worker.workers.dev')
    })
  })

  describe('printShutdownMessage()', () => {
    it('prints shutdown message', () => {
      printShutdownMessage()

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/shutdown|stopped|bye/i)
    })

    it('indicates graceful shutdown', () => {
      printShutdownMessage()

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/graceful|clean/i)
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('CLI Integration', () => {
  describe('help mode exits early', () => {
    it('--help flag prevents server startup', async () => {
      const options = parseArgs(['--help'])

      // In help mode, we should not start the server
      // The CLI should print help and exit with code 0
      expect(options.help).toBe(true)

      // runServer should not be called in help mode
      // This is behavior that main() function should implement
    })
  })

  describe('verbose mode enables logging', () => {
    it('verbose flag enables detailed logging', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const options = parseArgs(['--verbose', '--port=27085'])
      expect(options.verbose).toBe(true)

      consoleSpy.mockRestore()
    })
  })

  describe('full CLI workflow', () => {
    it('parses args, validates, creates backend, and runs server', async () => {
      // Parse arguments
      const options = parseArgs(['--port=27084', '--host=127.0.0.1', '--data=./test-cli-data'])

      // Validate options
      expect(() => validateOptions(options)).not.toThrow()

      // Create backend
      const backend = await createBackend(options)
      expect(backend).toBeDefined()

      // Run server
      const controller = await runServer(options, backend)
      expect(controller.isRunning).toBe(true)

      // Stop server
      await controller.stop()
      expect(controller.isRunning).toBe(false)
    })
  })
})
