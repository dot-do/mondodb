import type { VectorizeIndex, Ai, VectorizeMutationResult, EmbeddingResult, VectorizeMetadata } from '../types/vectorize';
import { serializeForEmbedding, SerializationOptions } from './document-serializer';

/**
 * Default embedding model - Cloudflare's BGE-M3 model
 * Produces 1024-dimensional vectors, supports multiple languages
 */
export const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-m3';

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
   * Embed multiple documents in a batch
   *
   * @param docs - Array of documents to embed (each must have _id field)
   * @param options - Optional embedding options
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
    const vectors = docs.map((doc, index) => {
      const documentId = String(doc._id);
      const vectorId = this.getVectorId(documentId);

      const metadata: VectorizeMetadata = {
        collection: this.collection,
        documentId,
        ...options.metadata
      };

      return {
        id: vectorId,
        values: embeddings[index],
        metadata
      };
    });

    // Upsert all vectors
    await this.vectorize.upsert(vectors);

    return {
      count: docs.length,
      ids: vectors.map(v => v.id)
    };
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
    return result.data[0];
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
