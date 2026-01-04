/**
 * Automatic Embedding Pipeline for MondoDB
 *
 * This module provides automatic embedding generation for documents
 * using Cloudflare Workers AI and Vectorize.
 */

export {
  serializeForEmbedding,
  type SerializationOptions,
  type AutoEmbeddingConfig
} from './document-serializer';

export {
  EmbeddingManager,
  DEFAULT_EMBEDDING_MODEL,
  type EmbeddingConfig,
  type EmbedDocumentOptions,
  type EmbedResult
} from './embedding-manager';
