/**
 * Cloudflare Workers entry point for mondodb
 *
 * This file exports only what's needed for the worker runtime:
 * - Default export: The main Worker handler (MondoEntrypoint)
 * - Named exports: Durable Object classes and WorkerEntrypoint classes
 *
 * For library/package usage, import from './index.ts' instead.
 */

// Export the default Worker handler
export { MondoEntrypoint as default } from './rpc/worker-entrypoint';

// Export named entrypoints for service bindings
export { MondoEntrypoint, WorkerEntrypoint } from './rpc/worker-entrypoint';

// Export Durable Object class for binding
export { MondoDatabase } from './durable-object/mondo-database';
