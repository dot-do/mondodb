/**
 * Sandbox Code Template
 *
 * Generates sandboxed worker code that wraps user code with:
 * 1. db API that routes through DB_PROXY binding
 * 2. console.log/error/warn/info capture
 * 3. Error handling with source map support
 * 4. Timeout handling for infinite loop protection
 * 5. Utility functions (sleep, ObjectId, ISODate)
 */

/**
 * Console log entry with level information
 */
export interface ConsoleLogEntry {
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp?: number;
}

/**
 * Options for sandbox code generation
 */
export interface SandboxOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Include timestamp in log entries */
  includeTimestamps?: boolean;
  /** Line offset for source map error reporting */
  sourceLineOffset?: number;
}

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/** Line offset where user code starts in the generated template */
const USER_CODE_LINE_OFFSET = 45;

/**
 * Format console arguments for logging
 */
function formatConsoleArgs(): string {
  return `
        function formatArgs(args) {
          return args.map(a => {
            if (a === null) return 'null';
            if (a === undefined) return 'undefined';
            if (typeof a === 'object') {
              try {
                return JSON.stringify(a, null, 2);
              } catch (e) {
                return String(a);
              }
            }
            return String(a);
          }).join(' ');
        }`;
}

/**
 * Generate sandboxed worker code that wraps user code with:
 * 1. db API that routes through DB_PROXY binding
 * 2. console.log/error/warn/info capture
 * 3. Error handling with source map support
 * 4. Timeout handling
 * 5. Utility functions
 */
export function generateSandboxCode(userCode: string, options: SandboxOptions = {}): string {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const includeTimestamps = options.includeTimestamps ?? false;
  const sourceLineOffset = options.sourceLineOffset ?? USER_CODE_LINE_OFFSET;

  return `
    export default {
      async evaluate(env) {
        // Capture console output with level support
        const logs = [];
        const originalConsole = {
          log: console.log,
          error: console.error,
          warn: console.warn,
          info: console.info
        };

        ${formatConsoleArgs()}

        const createLogger = (level) => (...args) => {
          const entry = {
            level,
            message: formatArgs(args)${includeTimestamps ? ',\n            timestamp: Date.now()' : ''}
          };
          logs.push(entry);
        };

        console.log = createLogger('log');
        console.error = createLogger('error');
        console.warn = createLogger('warn');
        console.info = createLogger('info');

        // Expose db API that routes through DB_PROXY
        const db = {
          collection: (name) => ({
            find: (filter) => env.DB_PROXY.find(name, filter || {}),
            findOne: (filter) => env.DB_PROXY.findOne(name, filter || {}),
            insertOne: (doc) => env.DB_PROXY.insertOne(name, doc),
            insertMany: (docs) => env.DB_PROXY.insertMany(name, docs),
            updateOne: (filter, update) => env.DB_PROXY.updateOne(name, filter, update),
            updateMany: (filter, update) => env.DB_PROXY.updateMany(name, filter, update),
            deleteOne: (filter) => env.DB_PROXY.deleteOne(name, filter),
            deleteMany: (filter) => env.DB_PROXY.deleteMany(name, filter),
            aggregate: (pipeline) => env.DB_PROXY.aggregate(name, pipeline),
            countDocuments: (filter) => env.DB_PROXY.countDocuments(name, filter || {})
          }),
          listCollections: () => env.DB_PROXY.listCollections(),
          listDatabases: () => env.DB_PROXY.listDatabases()
        };

        // Utility functions exposed to sandbox
        const utils = {
          sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
          ObjectId: (id) => ({ $oid: id || generateObjectId() }),
          ISODate: (date) => ({ $date: date ? new Date(date).toISOString() : new Date().toISOString() }),
          UUID: () => crypto.randomUUID()
        };

        // Helper to generate ObjectId-like string
        function generateObjectId() {
          const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
          const random = Array.from({ length: 16 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join('');
          return timestamp + random;
        }

        // Source line offset for error reporting
        const SOURCE_LINE_OFFSET = ${sourceLineOffset};

        // Format error with adjusted line numbers
        function formatError(error) {
          if (!error.stack) return error.message || String(error);

          const lines = error.stack.split('\\n');
          const adjusted = lines.map(line => {
            // Match patterns like "at eval (sandbox.js:50:10)"
            const match = line.match(/sandbox\\.js:(\\d+):(\\d+)/);
            if (match) {
              const originalLine = parseInt(match[1], 10);
              const adjustedLine = Math.max(1, originalLine - SOURCE_LINE_OFFSET);
              return line.replace(
                /sandbox\\.js:(\\d+):(\\d+)/,
                \`user-code:\${adjustedLine}:\${match[2]}\`
              );
            }
            return line;
          });
          return adjusted.join('\\n');
        }

        // Restore console methods
        function restoreConsole() {
          console.log = originalConsole.log;
          console.error = originalConsole.error;
          console.warn = originalConsole.warn;
          console.info = originalConsole.info;
        }

        // Timeout promise for execution protection
        const timeoutMs = ${timeout};
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(\`Execution timeout after \${timeoutMs}ms\`)), timeoutMs);
        });

        // Main execution promise
        const executionPromise = (async () => {
          // User code starts here (line ${sourceLineOffset})
          ${userCode}
        })();

        try {
          const result = await Promise.race([executionPromise, timeoutPromise]);
          restoreConsole();
          return { success: true, value: result, logs };
        } catch (error) {
          restoreConsole();
          return {
            success: false,
            error: formatError(error),
            logs
          };
        }
      }
    };
  `;
}

/**
 * Type definitions exposed to sandbox for TypeScript support
 */
export const SANDBOX_TYPE_DEFINITIONS = `
declare const db: {
  collection(name: string): {
    find(filter?: object): Promise<Document[]>;
    findOne(filter?: object): Promise<Document | null>;
    insertOne(doc: object): Promise<{ insertedId: string }>;
    insertMany(docs: object[]): Promise<{ insertedIds: string[] }>;
    updateOne(filter: object, update: object): Promise<{ modifiedCount: number }>;
    updateMany(filter: object, update: object): Promise<{ modifiedCount: number }>;
    deleteOne(filter: object): Promise<{ deletedCount: number }>;
    deleteMany(filter: object): Promise<{ deletedCount: number }>;
    aggregate(pipeline: object[]): Promise<Document[]>;
    countDocuments(filter?: object): Promise<number>;
  };
  listCollections(): Promise<string[]>;
  listDatabases(): Promise<string[]>;
};

declare const utils: {
  /** Sleep for specified milliseconds */
  sleep(ms: number): Promise<void>;
  /** Create MongoDB ObjectId representation */
  ObjectId(id?: string): { $oid: string };
  /** Create MongoDB ISODate representation */
  ISODate(date?: string | Date): { $date: string };
  /** Generate a random UUID */
  UUID(): string;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
};

type Document = Record<string, unknown>;
`;

/**
 * Sandbox execution result interface (with enhanced log support)
 */
export interface SandboxResult {
  success: boolean;
  value?: unknown;
  error?: string;
  /** Log entries (can be strings for backward compatibility or ConsoleLogEntry objects) */
  logs: (string | ConsoleLogEntry)[];
}

/**
 * Validates that user code doesn't contain dangerous patterns
 * that could escape the sandbox
 */
export function validateUserCode(userCode: string): { valid: boolean; error?: string } {
  // Check for attempts to access dangerous globals
  const dangerousPatterns = [
    /\bprocess\b/,           // Node.js process object
    /\brequire\b/,           // CommonJS require
    /\bimport\s*\(/,         // Dynamic import
    /\b__dirname\b/,         // Node.js path globals
    /\b__filename\b/,
    /\beval\b\s*\(/,         // Direct eval calls
    /\bFunction\b\s*\(/,     // Function constructor
    /\bglobalThis\b/,        // Global object access
    /\bself\b\./,            // Worker global access
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(userCode)) {
      return {
        valid: false,
        error: `Code contains potentially dangerous pattern: ${pattern.source}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Escapes user code for safe embedding in template
 */
export function escapeUserCode(userCode: string): string {
  // Replace template literal delimiters that could break the template
  return userCode
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * Generate a complete sandboxed module with validation and escaping
 */
export function generateSafeSandboxCode(userCode: string): { code: string; error?: string } {
  const validation = validateUserCode(userCode);
  if (!validation.valid) {
    const result: { code: string; error?: string } = { code: '' };
    if (validation.error) {
      result.error = validation.error;
    }
    return result;
  }

  const escapedCode = escapeUserCode(userCode);
  const code = generateSandboxCode(escapedCode);

  return { code };
}
