#!/usr/bin/env bun
/**
 * mongo.do Wire Protocol Server
 *
 * Local server for MongoDB Compass and driver compatibility.
 *
 * Usage:
 *   bun run src/server.ts [options]
 *
 * Options:
 *   --port=PORT      Port to listen on (default: 27017)
 *   --host=HOST      Host to bind to (default: localhost)
 *   --data=DIR       Data directory (default: .mongo.do)
 *   --verbose        Enable verbose logging
 *   --help           Show this help
 */

import { createServer } from './wire/index.js'
import { LocalSQLiteBackend } from './wire/backend/local-sqlite.js'

interface CLIOptions {
  port: number
  host: string
  dataDir: string
  verbose: boolean
  help: boolean
}

function parseArgs(): CLIOptions {
  const options: CLIOptions = {
    port: 27017,
    host: 'localhost',
    dataDir: '.mongo.do',
    verbose: false,
    help: false,
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true
    } else if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--host=')) {
      options.host = arg.split('=')[1]
    } else if (arg.startsWith('--data=')) {
      options.dataDir = arg.split('=')[1]
    }
  }

  return options
}

function printHelp(): void {
  console.log(`
mongo.do Wire Protocol Server

A MongoDB-compatible database backed by SQLite.

Usage:
  bun run src/server.ts [options]

Options:
  --port=PORT      Port to listen on (default: 27017)
  --host=HOST      Host to bind to (default: localhost)
  --data=DIR       Data directory (default: .mongo.do)
  --verbose, -v    Enable verbose logging
  --help, -h       Show this help

Examples:
  # Start with defaults
  bun run src/server.ts

  # Start on custom port with verbose logging
  bun run src/server.ts --port=27018 --verbose

  # Use custom data directory
  bun run src/server.ts --data=/path/to/data

Connect with:
  mongosh mongodb://localhost:27017
  MongoDB Compass → mongodb://localhost:27017
`)
}

async function main(): Promise<void> {
  const options = parseArgs()

  if (options.help) {
    printHelp()
    process.exit(0)
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ███╗   ███╗ ██████╗ ███╗   ██╗██████╗  ██████╗ ██████╗    ║
║   ████╗ ████║██╔═══██╗████╗  ██║██╔══██╗██╔═══██╗██╔══██╗   ║
║   ██╔████╔██║██║   ██║██╔██╗ ██║██║  ██║██║   ██║██████╔╝   ║
║   ██║╚██╔╝██║██║   ██║██║╚██╗██║██║  ██║██║   ██║██╔══██╗   ║
║   ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██████╔╝╚██████╔╝██████╔╝   ║
║   ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═════╝    ║
║                                                              ║
║   MongoDB-compatible database backed by SQLite               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`)

  console.log(`Starting server...`)
  console.log(`  Data directory: ${options.dataDir}`)
  console.log(`  Verbose: ${options.verbose}`)
  console.log('')

  // Create backend
  const backend = new LocalSQLiteBackend(options.dataDir)

  // Create and start server
  const server = await createServer(backend, {
    port: options.port,
    host: options.host,
    verbose: options.verbose,
  })

  console.log('')
  console.log(`Connect with:`)
  console.log(`  mongosh mongodb://${options.host}:${options.port}`)
  console.log(`  MongoDB Compass → mongodb://${options.host}:${options.port}`)
  console.log('')
  console.log(`Press Ctrl+C to stop`)

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...')
    await server.stop()
    backend.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
