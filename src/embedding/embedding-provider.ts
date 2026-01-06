import type { Ai, EmbeddingResult } from '../types/vectorize'

export interface EmbeddingProvider {
  embed(value: string): Promise<number[]>
  embedMany(values: string[]): Promise<number[][]>
  readonly dimensions: number
  readonly modelId: string
}

export interface EmbeddingProviderConfig {
  ai?: Ai  // Cloudflare Workers AI binding (preferred)
  openaiApiKey?: string  // Fallback
  ollamaBaseUrl?: string  // Fallback
  model?: string  // Override model
}

// Default model for Cloudflare Workers AI
const DEFAULT_MODEL = '@cf/baai/bge-m3'
// Default dimensions for bge-m3 model
const DEFAULT_DIMENSIONS = 1024

/**
 * Create an embedding model using AI SDK compatible interface
 * Priority: Workers AI > OpenAI > Ollama
 */
export async function createEmbeddingModel(config: EmbeddingProviderConfig): Promise<EmbeddingProvider> {
  // Workers AI (preferred when ai binding is available)
  if (config.ai) {
    const ai = config.ai
    const modelId = config.model || DEFAULT_MODEL

    // Get initial dimensions by doing a test embed
    const testResult = await ai.run<EmbeddingResult>(modelId, { text: ['test'] })
    const dimensions = testResult.data[0]?.length || DEFAULT_DIMENSIONS

    return {
      modelId,
      dimensions,
      async embed(value: string): Promise<number[]> {
        const result = await ai.run<EmbeddingResult>(modelId, { text: [value] })
        return result.data[0]
      },
      async embedMany(values: string[]): Promise<number[][]> {
        const result = await ai.run<EmbeddingResult>(modelId, { text: values })
        return result.data
      }
    }
  }

  // OpenAI fallback
  if (config.openaiApiKey) {
    // For now, throw until we implement OpenAI provider
    throw new Error('OpenAI embedding provider not yet implemented')
  }

  // Ollama fallback
  if (config.ollamaBaseUrl) {
    // For now, throw until we implement Ollama provider
    throw new Error('Ollama embedding provider not yet implemented')
  }

  throw new Error('No embedding provider configured. Provide ai, openaiApiKey, or ollamaBaseUrl.')
}
