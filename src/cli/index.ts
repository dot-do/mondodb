#!/usr/bin/env bun
/**
 * MondoDB CLI Entry Point
 *
 * Main entry point for the MondoDB command-line interface.
 * Provides a MongoDB-compatible database backed by SQLite or Cloudflare Workers.
 *
 * Usage:
 *   mondodb [options]
 *   bun run src/cli/index.ts [options]
 *
 * @module cli
 */

import { version } from '../../package.json'
import {
  parseArgs,
  validateOptions,
  printHelp,
  printStartupMessage as _printStartupMessage,
  printShutdownMessage,
  runServer,
  type CLIOptions,
} from './server.js'

// ============================================================================
// ANSI Color Codes (no external dependencies)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

/**
 * Check if stdout supports colors
 */
function supportsColor(): boolean {
  // Check for NO_COLOR environment variable
  if (process.env.NO_COLOR !== undefined) {
    return false
  }

  // Check for FORCE_COLOR environment variable
  if (process.env.FORCE_COLOR !== undefined) {
    return true
  }

  // Check if running in a TTY
  return process.stdout.isTTY ?? false
}

const useColors = supportsColor()

/**
 * Apply color to text if colors are supported
 */
function colorize(text: string, color: keyof typeof colors): string {
  if (!useColors) return text
  return `${colors[color]}${text}${colors.reset}`
}

// ============================================================================
// Output Functions
// ============================================================================

/**
 * Print the ASCII banner for MondoDB
 */
function printBanner(): void {
  const banner = `
${colorize('MondoDB', 'cyan')} ${colorize(`v${version}`, 'dim')}
${colorize('MongoDB-compatible database backed by SQLite', 'dim')}
`
  console.log(banner)
}

/**
 * Print version information
 */
function printVersion(): void {
  console.log(`mondodb version ${version}`)
}

/**
 * Print an error message
 */
function printError(message: string): void {
  console.error(`${colorize('error:', 'red')} ${message}`)
}

/**
 * Print enhanced startup message with colors
 */
function printColoredStartupMessage(options: CLIOptions): void {
  const connectionString = `mongodb://${options.host}:${options.port}`

  console.log('')
  if (options.remote) {
    console.log(`${colorize('Mode:', 'bold')} ${colorize('Proxy/Remote', 'magenta')}`)
    console.log(`${colorize('Connect:', 'bold')} ${colorize(connectionString, 'cyan')}`)
    console.log(`${colorize('Proxying to:', 'bold')} ${colorize(options.remote, 'blue')}`)
  } else {
    console.log(`${colorize('Mode:', 'bold')} ${colorize('Local/SQLite', 'green')}`)
    console.log(`${colorize('Connect:', 'bold')} ${colorize(connectionString, 'cyan')}`)
    console.log(`${colorize('Data directory:', 'bold')} ${options.dataDir}`)
  }

  if (options.verbose) {
    console.log(`${colorize('Verbose logging:', 'bold')} ${colorize('enabled', 'yellow')}`)
  }

  console.log('')
  console.log(`${colorize('Ready to accept connections.', 'green')} Press ${colorize('Ctrl+C', 'bold')} to stop.`)
  console.log('')
}

// ============================================================================
// Argument Parsing Extensions
// ============================================================================

/**
 * Extended CLI options including version flag
 */
interface ExtendedCLIOptions extends CLIOptions {
  version: boolean
}

/**
 * Parse command line arguments with version flag support
 */
function parseArgsExtended(args: string[]): ExtendedCLIOptions {
  const baseOptions = parseArgs(args)

  // Check for version flag
  const hasVersion = args.some(
    (arg) => arg === '--version' || arg === '-V'
  )

  return {
    ...baseOptions,
    version: hasVersion,
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  try {
    // Parse arguments
    const options = parseArgsExtended(process.argv.slice(2))

    // Handle --version flag
    if (options.version) {
      printVersion()
      process.exit(0)
    }

    // Handle --help flag
    if (options.help) {
      printHelp()
      process.exit(0)
    }

    // Validate options
    try {
      validateOptions(options)
    } catch (error) {
      if (error instanceof Error) {
        printError(error.message)
      } else {
        printError('Invalid options')
      }
      console.log('')
      console.log(`Run ${colorize('mondodb --help', 'cyan')} for usage information.`)
      process.exit(1)
    }

    // Print banner
    printBanner()

    // Start the server
    const controller = await runServer(options)

    // Print startup message
    printColoredStartupMessage(options)

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log('')
      console.log(`${colorize(`Received ${signal}, shutting down...`, 'yellow')}`)

      try {
        await controller.stop()
        printShutdownMessage()
        process.exit(0)
      } catch (error) {
        printError(`Error during shutdown: ${error instanceof Error ? error.message : 'Unknown error'}`)
        process.exit(1)
      }
    }

    // Register signal handlers
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      printError(`Uncaught exception: ${error.message}`)
      if (options.verbose) {
        console.error(error.stack)
      }
      process.exit(1)
    })

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      printError(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`)
      if (options.verbose && reason instanceof Error) {
        console.error(reason.stack)
      }
      process.exit(1)
    })

  } catch (error) {
    // Handle startup errors gracefully
    if (error instanceof Error) {
      printError(error.message)

      // Provide helpful hints for common errors
      if (error.message.includes('EADDRINUSE')) {
        console.log('')
        console.log(`${colorize('Hint:', 'yellow')} The port is already in use. Try a different port with ${colorize('--port', 'cyan')}.`)
      } else if (error.message.includes('EACCES')) {
        console.log('')
        console.log(`${colorize('Hint:', 'yellow')} Permission denied. Ports below 1024 require root privileges.`)
        console.log(`      Try using a port number above 1024, e.g., ${colorize('--port=27017', 'cyan')}.`)
      } else if (error.message.includes('Failed to connect to remote')) {
        console.log('')
        console.log(`${colorize('Hint:', 'yellow')} Could not connect to the remote worker.`)
        console.log(`      Check that the URL is correct and the worker is running.`)
      }
    } else {
      printError('An unexpected error occurred')
    }

    process.exit(1)
  }
}

// Run the CLI
main()
