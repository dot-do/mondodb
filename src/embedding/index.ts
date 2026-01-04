/**
 * Automatic Embedding Pipeline for MondoDB
 *
 * This module provides automatic embedding generation for documents
 * using Cloudflare Workers AI and Vectorize.
 */

export {
  serializeForEmbedding,
  serializeDocument,
  serializeDocuments,
  DocumentSerializer,
  type SerializationOptions,
  type AutoEmbeddingConfig,
  type SerializedDocument,
  type VectorizeMetadata,
  type VectorizeMetadataValue
} from './document-serializer';

export {
  EmbeddingManager,
  DEFAULT_EMBEDDING_MODEL,
  type EmbeddingConfig,
  type EmbedDocumentOptions,
  type EmbedResult
} from './embedding-manager';
