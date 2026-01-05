/**
 * Cloudflare Workers entry point for mongo.do
 *
 * This file exports only what's needed for the worker runtime:
 * - Default export: The main Worker handler with fetch method
 * - Named exports: Durable Object classes and WorkerEntrypoint classes
 *
 * For library/package usage, import from './index.ts' instead.
 */

import { MondoEntrypoint, MondoEnv, ExecutionContext } from './rpc/worker-entrypoint';

// Export the default Worker handler as a module with fetch method
export default {
  async fetch(request: Request, env: MondoEnv, ctx: ExecutionContext): Promise<Response> {
    const entrypoint = new MondoEntrypoint(ctx, env);
    return entrypoint.fetch(request);
  }
};

// Export named entrypoints for service bindings
export { MondoEntrypoint, WorkerEntrypoint } from './rpc/worker-entrypoint';

// Export Durable Object class for binding
export { MondoDatabase } from './durable-object/mondo-database';
