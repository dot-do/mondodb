/**
 * Sandbox Code Template
 *
 * Generates sandboxed worker code that wraps user code with:
 * 1. db API that routes through DB_PROXY binding
 * 2. console.log capture
 * 3. Error handling
 */

/**
 * Generate sandboxed worker code that wraps user code with:
 * 1. db API that routes through DB_PROXY binding
 * 2. console.log capture
 * 3. Error handling
 */
export function generateSandboxCode(userCode: string): string {
  return `
    export default {
      async evaluate(env) {
        // Capture console output
        const logs = [];
        const originalLog = console.log;
        console.log = (...args) => {
          logs.push(
            args.map(a =>
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ')
          );
        };

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

        try {
          const result = await (async function() {
            ${userCode}
          })();

          // Restore console.log
          console.log = originalLog;

          return { success: true, value: result, logs };
        } catch (error) {
          // Restore console.log
          console.log = originalLog;

          return {
            success: false,
            error: error.message || String(error),
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

type Document = Record<string, unknown>;
`;

/**
 * Sandbox execution result interface
 */
export interface SandboxResult {
  success: boolean;
  value?: unknown;
  error?: string;
  logs: string[];
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
    return { code: '', error: validation.error };
  }

  const escapedCode = escapeUserCode(userCode);
  const code = generateSandboxCode(escapedCode);

  return { code };
}
