/**
 * Cloudflare Workers environment bindings
 */

import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import type { VectorizeIndex, Ai } from './vectorize'

/**
 * Environment interface for Cloudflare Workers
 */
export interface Env {
  /**
   * Durable Object namespace for MondoDatabase instances
   */
  MONDO_DATABASE: DurableObjectNamespace

  /**
   * Optional Vectorize index binding for vector search
   */
  VECTORIZE?: VectorizeIndex

  /**
   * Optional Workers AI binding for generating embeddings
   */
  AI?: Ai

  /**
   * Optional embedding model to use (e.g., '@cf/baai/bge-m3')
   */
  EMBEDDING_MODEL?: string

  /**
   * Optional flag to enable/disable automatic embedding generation
   */
  EMBEDDING_ENABLED?: string
}
