/**
 * Cloudflare Workers environment bindings
 */

import type { DurableObjectNamespace } from '@cloudflare/workers-types'

/**
 * Environment interface for Cloudflare Workers
 */
export interface Env {
  /**
   * Durable Object namespace for MondoDatabase instances
   */
  MONDO_DATABASE: DurableObjectNamespace
}
