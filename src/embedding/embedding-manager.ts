import type { VectorizeIndex, Ai, VectorizeMutationResult, EmbeddingResult, VectorizeMetadata } from '../types/vectorize';
import { serializeForEmbedding, SerializationOptions } from './document-serializer';

/**
 * Default embedding model - Cloudflare's BGE-M3 model
 * Produces 1024-dimensional vectors, supports multiple languages
 */
export const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-m3';

/**
 * Cloudflare Vectorize has a limit of 100 vectors per upsert operation
 */
export const VECTORIZE_BATCH_LIMIT = 100;

/**
 * Configuration for the EmbeddingManager
 */
export interface EmbeddingConfig {
  /**
   * Vectorize index binding for storing embeddings
   */
  vectorize: VectorizeIndex;

  /**
   * Workers AI binding for generating embeddings
   */
  ai: Ai;

  /**
   * Collection name (used as namespace/prefix for vector IDs)
   */
  collection: string;

  /**
   * Embedding model to use (default: '@cf/baai/bge-m3')
   */
  model?: string;

  /**
   * Serialization options for documents
   */
  serialization?: SerializationOptions;
}

/**
 * Default concurrency for parallel chunk processing
 */
export const DEFAULT_UPSERT_CONCURRENCY = 3;

/**
 * Options for embedding a single document
 */
export interface EmbedDocumentOptions {
  /**
   * Additional metadata to store with the vector
   */
  metadata?: VectorizeMetadata;

  /**
   * Override serialization options for this document
   */
  serialization?: SerializationOptions;

  /**
   * Number of parallel upsert operations (default: 3)
   * Higher values increase throughput but may hit rate limits
   */
  concurrency?: number;
}

/**
 * Result from an embedding operation
 */
export interface EmbedResult {
  /**
   * Number of documents embedded
   */
  count: number;

  /**
   * Vector IDs of embedded documents
   */
  ids: string[];
}

/**
 * Manages automatic embedding generation for documents
 *
 * This class handles:
 * - Serializing documents for embedding generation
 * - Calling Workers AI to generate embeddings
 * - Storing embeddings in Vectorize
 * - Managing vector ID format (collection:documentId)
 */
export class EmbeddingManager {
  private vectorize: VectorizeIndex;
  private ai: Ai;
  private collection: string;
  private model: string;
  private serialization: SerializationOptions;

  constructor(config: EmbeddingConfig) {
    this.vectorize = config.vectorize;
    this.ai = config.ai;
    this.collection = config.collection;
    this.model = config.model || DEFAULT_EMBEDDING_MODEL;
    this.serialization = config.serialization || { serializer: 'yaml' };
  }

  /**
   * Get the current configuration
   */
  getConfig(): { model: string; collection: string; serialization: SerializationOptions } {
    return {
      model: this.model,
      collection: this.collection,
      serialization: this.serialization
    };
  }

  /**
   * Generate a vector ID from a document ID
   * Format: collection:documentId
   */
  getVectorId(documentId: string): string {
    return `${this.collection}:${documentId}`;
  }

  /**
   * Parse a vector ID into its components
   */
  parseVectorId(vectorId: string): { collection: string; documentId: string } {
    const colonIndex = vectorId.indexOf(':');
    if (colonIndex === -1) {
      return { collection: '', documentId: vectorId };
    }
    return {
      collection: vectorId.substring(0, colonIndex),
      documentId: vectorId.substring(colonIndex + 1)
    };
  }

  /**
   * Embed a single document
   *
   * @param doc - The document to embed (must have _id field)
   * @param options - Optional embedding options
   * @returns The embedding result
   */
  async embedDocument(
    doc: Record<string, unknown>,
    options: EmbedDocumentOptions = {}
  ): Promise<EmbedResult> {
    const documentId = String(doc._id);
    const vectorId = this.getVectorId(documentId);

    // Serialize document for embedding
    const serializationOptions = options.serialization || this.serialization;
    const text = serializeForEmbedding(doc, serializationOptions);

    // Generate embedding using Workers AI
    const embedding = await this.generateEmbedding(text);

    // Prepare metadata
    const metadata: VectorizeMetadata = {
      collection: this.collection,
      documentId,
      ...options.metadata
    };

    // Upsert to Vectorize
    await this.vectorize.upsert([{
      id: vectorId,
      values: embedding,
      metadata
    }]);

    return {
      count: 1,
      ids: [vectorId]
    };
  }

  /**
   * Embed multiple documents in a batch with parallel chunk processing
   *
   * @param docs - Array of documents to embed (each must have _id field)
   * @param options - Optional embedding options including concurrency
   * @returns The embedding result
   */
  async embedDocuments(
    docs: Record<string, unknown>[],
    options: EmbedDocumentOptions = {}
  ): Promise<EmbedResult> {
    if (docs.length === 0) {
      return { count: 0, ids: [] };
    }

    // Serialize all documents
    const serializationOptions = options.serialization || this.serialization;
    const texts = docs.map(doc => serializeForEmbedding(doc, serializationOptions));

    // Generate embeddings in batch
    const embeddings = await this.generateEmbeddings(texts);

    // Prepare vectors for upsert
    const vectors: { id: string; values: number[]; metadata: VectorizeMetadata }[] = docs.map((doc, index) => {
      const documentId = String(doc._id);
      const vectorId = this.getVectorId(documentId);

      const metadata: VectorizeMetadata = {
        collection: this.collection,
        documentId,
        ...options.metadata
      };

      // Safe access - embeddings array length matches docs array
      const values: number[] = embeddings[index] ?? [];

      return {
        id: vectorId,
        values,
        metadata
      };
    });

    // Split vectors into chunks respecting Vectorize batch limit
    const chunks: typeof vectors[] = [];
    for (let i = 0; i < vectors.length; i += VECTORIZE_BATCH_LIMIT) {
      chunks.push(vectors.slice(i, i + VECTORIZE_BATCH_LIMIT));
    }

    // Process chunks with parallel execution
    const concurrency = options.concurrency ?? DEFAULT_UPSERT_CONCURRENCY;
    await this.processChunksParallel(chunks, concurrency);

    return {
      count: docs.length,
      ids: vectors.map(v => v.id)
    };
  }

  /**
   * Process vector chunks in parallel with controlled concurrency
   *
   * @param chunks - Array of vector chunks to upsert
   * @param concurrency - Maximum parallel operations
   */
  private async processChunksParallel(
    chunks: { id: string; values: number[]; metadata: VectorizeMetadata }[][],
    concurrency: number
  ): Promise<void> {
    if (chunks.length === 0) return;

    // For small chunk counts, just run all in parallel
    if (chunks.length <= concurrency) {
      await Promise.all(chunks.map(chunk => this.vectorize.upsert(chunk)));
      return;
    }

    // Process with controlled concurrency using a semaphore pattern
    const executing: Promise<void>[] = [];
    const queue = [...chunks];

    while (queue.length > 0 || executing.length > 0) {
      // Fill up to concurrency limit
      while (executing.length < concurrency && queue.length > 0) {
        const chunk = queue.shift()!;
        const promise = this.vectorize.upsert(chunk).then(() => {
          // Remove from executing when done
          const idx = executing.indexOf(promise);
          if (idx > -1) executing.splice(idx, 1);
        });
        executing.push(promise);
      }

      // Wait for at least one to complete if we're at capacity
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }

      // Exit if nothing left
      if (queue.length === 0 && executing.length === 0) break;
    }

    // Wait for all remaining
    await Promise.all(executing);
  }

  /**
   * Delete the embedding for a document
   *
   * @param documentId - The document ID
   */
  async deleteDocument(documentId: string): Promise<VectorizeMutationResult> {
    const vectorId = this.getVectorId(documentId);
    return this.vectorize.deleteByIds([vectorId]);
  }

  /**
   * Delete embeddings for multiple documents
   *
   * @param documentIds - Array of document IDs
   */
  async deleteDocuments(documentIds: string[]): Promise<VectorizeMutationResult> {
    const vectorIds = documentIds.map(id => this.getVectorId(id));
    return this.vectorize.deleteByIds(vectorIds);
  }

  /**
   * Generate an embedding for a single text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.ai.run<EmbeddingResult>(this.model, {
      text: [text]
    });
    // Safe access - single text input always returns single embedding
    return result.data[0] ?? [];
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const result = await this.ai.run<EmbeddingResult>(this.model, {
      text: texts
    });
    return result.data;
  }
}
