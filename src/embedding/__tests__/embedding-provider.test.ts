/**
 * RED Phase: EmbeddingProvider interface tests
 *
 * Issue: mondodb-qm2u
 * "RED: Define EmbeddingProvider interface for pluggable embeddings"
 *
 * These tests verify the EmbeddingProvider interface exists with methods
 * based on AI SDK's EmbeddingModel interface.
 *
 * Tests will FAIL until the interface is implemented (TDD RED phase).
 *
 * Run with: npx vitest run src/embedding/__tests__/embedding-provider.test.ts
 */
import { describe, it, expect, expectTypeOf } from 'vitest';

// Import the Ai type from vectorize for the config
import type { Ai } from '../../types/vectorize';

/**
 * Expected interface for EmbeddingProvider based on AI SDK's EmbeddingModel<string>
 *
 * This mirrors the AI SDK interface:
 * - embed(value: string): Promise<number[]>
 * - embedMany(values: string[]): Promise<number[][]>
 * - readonly dimensions: number
 * - readonly modelId: string
 */
interface ExpectedEmbeddingProvider {
  embed(value: string): Promise<number[]>;
  embedMany(values: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly modelId: string;
}

/**
 * Expected interface for EmbeddingProviderConfig
 */
interface ExpectedEmbeddingProviderConfig {
  ai?: Ai;  // Cloudflare Workers AI binding (preferred)
  openaiApiKey?: string;  // Fallback
  ollamaBaseUrl?: string;  // Fallback
  model?: string;  // Override model
}

/**
 * Expected signature for createEmbeddingModel factory function
 * Returns AI SDK compatible EmbeddingModel<string>
 */
type ExpectedCreateEmbeddingModel = (config: ExpectedEmbeddingProviderConfig) => Promise<ExpectedEmbeddingProvider>;

describe('EmbeddingProvider Interface (RED Phase)', () => {
  describe('Module exports', () => {
    it('should export EmbeddingProvider interface', async () => {
      // This test will fail until the module and interface are created
      const embeddingProviderModule = await import('../embedding-provider');

      // Verify the module exports exist (will fail with module not found)
      expect(embeddingProviderModule).toBeDefined();
    });

    it('should export EmbeddingProviderConfig type', async () => {
      // This test will fail until the module and type are created
      const embeddingProviderModule = await import('../embedding-provider');

      expect(embeddingProviderModule).toBeDefined();
    });

    it('should export createEmbeddingModel function', async () => {
      // This test will fail until the module and function are created
      const { createEmbeddingModel } = await import('../embedding-provider');

      expect(createEmbeddingModel).toBeDefined();
      expect(typeof createEmbeddingModel).toBe('function');
    });
  });

  describe('EmbeddingProvider interface shape', () => {
    it('should have embed method that takes a string and returns Promise<number[]>', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      // Create a mock config to get a provider instance
      const mockConfig: ExpectedEmbeddingProviderConfig = {
        ai: {
          run: async () => ({ data: [[0.1, 0.2, 0.3]] })
        } as unknown as Ai,
      };

      // Get a provider instance
      const provider = await createEmbeddingModel(mockConfig);

      // Verify embed method exists and has correct signature
      expect(typeof provider.embed).toBe('function');

      // Type test: verify the interface matches expected shape
      expectTypeOf(provider.embed).toBeFunction();
      expectTypeOf(provider.embed).parameter(0).toBeString();
      expectTypeOf(provider.embed).returns.toMatchTypeOf<Promise<number[]>>();
    });

    it('should have embedMany method that takes string[] and returns Promise<number[][]>', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      const mockConfig: ExpectedEmbeddingProviderConfig = {
        ai: {
          run: async () => ({ data: [[0.1, 0.2], [0.3, 0.4]] })
        } as unknown as Ai,
      };

      const provider = await createEmbeddingModel(mockConfig);

      // Verify embedMany method exists
      expect(typeof provider.embedMany).toBe('function');

      // Type test
      expectTypeOf(provider.embedMany).toBeFunction();
      expectTypeOf(provider.embedMany).parameter(0).toMatchTypeOf<string[]>();
      expectTypeOf(provider.embedMany).returns.toMatchTypeOf<Promise<number[][]>>();
    });

    it('should have readonly dimensions property of type number', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      const mockConfig: ExpectedEmbeddingProviderConfig = {
        ai: {
          run: async () => ({ data: [[0.1, 0.2, 0.3]] })
        } as unknown as Ai,
      };

      const provider = await createEmbeddingModel(mockConfig);

      // Verify dimensions property exists and is a number
      expect(typeof provider.dimensions).toBe('number');
      expect(provider.dimensions).toBeGreaterThan(0);

      // Type test
      expectTypeOf(provider.dimensions).toBeNumber();
    });

    it('should have readonly modelId property of type string', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      const mockConfig: ExpectedEmbeddingProviderConfig = {
        ai: {
          run: async () => ({ data: [[0.1, 0.2, 0.3]] })
        } as unknown as Ai,
      };

      const provider = await createEmbeddingModel(mockConfig);

      // Verify modelId property exists and is a string
      expect(typeof provider.modelId).toBe('string');
      expect(provider.modelId.length).toBeGreaterThan(0);

      // Type test
      expectTypeOf(provider.modelId).toBeString();
    });
  });

  describe('EmbeddingProviderConfig type', () => {
    it('should have optional ai property of type Ai (Cloudflare Workers AI binding)', async () => {
      // Import to verify the module loads
      await import('../embedding-provider');

      // Config with only ai binding (preferred)
      const configWithAi: ExpectedEmbeddingProviderConfig = {
        ai: {} as Ai,
      };
      expect(configWithAi.ai).toBeDefined();
      expectTypeOf(configWithAi.ai).toMatchTypeOf<Ai | undefined>();
    });

    it('should have optional openaiApiKey property of type string (fallback)', async () => {
      await import('../embedding-provider');

      const configWithOpenai: ExpectedEmbeddingProviderConfig = {
        openaiApiKey: 'sk-test-key',
      };
      expect(configWithOpenai.openaiApiKey).toBe('sk-test-key');
      expectTypeOf(configWithOpenai.openaiApiKey).toMatchTypeOf<string | undefined>();
    });

    it('should have optional ollamaBaseUrl property of type string (fallback)', async () => {
      await import('../embedding-provider');

      const configWithOllama: ExpectedEmbeddingProviderConfig = {
        ollamaBaseUrl: 'http://localhost:11434',
      };
      expect(configWithOllama.ollamaBaseUrl).toBe('http://localhost:11434');
      expectTypeOf(configWithOllama.ollamaBaseUrl).toMatchTypeOf<string | undefined>();
    });

    it('should have optional model property of type string (override model)', async () => {
      await import('../embedding-provider');

      const configWithModel: ExpectedEmbeddingProviderConfig = {
        ai: {} as Ai,
        model: 'text-embedding-3-small',
      };
      expect(configWithModel.model).toBe('text-embedding-3-small');
      expectTypeOf(configWithModel.model).toMatchTypeOf<string | undefined>();
    });

    it('should accept empty config (all fields optional)', async () => {
      await import('../embedding-provider');

      const emptyConfig: ExpectedEmbeddingProviderConfig = {};
      expect(emptyConfig).toBeDefined();
      expect(Object.keys(emptyConfig).length).toBe(0);
    });
  });

  describe('createEmbeddingModel factory function', () => {
    it('should be a function that takes EmbeddingProviderConfig', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      expect(typeof createEmbeddingModel).toBe('function');
      expectTypeOf(createEmbeddingModel).toBeFunction();
      expectTypeOf(createEmbeddingModel).parameter(0).toMatchTypeOf<ExpectedEmbeddingProviderConfig>();
    });

    it('should return Promise<EmbeddingProvider>', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      const mockConfig: ExpectedEmbeddingProviderConfig = {
        ai: {
          run: async () => ({ data: [[0.1, 0.2, 0.3]] })
        } as unknown as Ai,
      };

      const result = createEmbeddingModel(mockConfig);

      // Verify it returns a Promise
      expect(result).toBeInstanceOf(Promise);

      // Verify the resolved value has the expected shape
      const provider = await result;
      expect(provider).toHaveProperty('embed');
      expect(provider).toHaveProperty('embedMany');
      expect(provider).toHaveProperty('dimensions');
      expect(provider).toHaveProperty('modelId');
    });

    it('should work with Cloudflare AI binding (preferred)', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      const mockAi: Ai = {
        run: async () => ({ data: [[0.1, 0.2, 0.3, 0.4, 0.5]] })
      };

      const config: ExpectedEmbeddingProviderConfig = { ai: mockAi };
      const provider = await createEmbeddingModel(config);

      expect(provider).toBeDefined();
      expect(typeof provider.embed).toBe('function');
    });
  });

  describe('EmbeddingProvider compatibility with AI SDK EmbeddingModel', () => {
    it('should match AI SDK EmbeddingModel<string> interface shape', async () => {
      const { createEmbeddingModel } = await import('../embedding-provider');

      const mockConfig: ExpectedEmbeddingProviderConfig = {
        ai: {
          run: async () => ({ data: [[0.1, 0.2, 0.3]] })
        } as unknown as Ai,
      };

      const provider = await createEmbeddingModel(mockConfig);

      // AI SDK EmbeddingModel<string> interface has:
      // - embed(value: string): Promise<number[]>
      // - embedMany(values: string[]): Promise<number[][]>
      // - dimensions: number
      // - modelId: string

      expectTypeOf(provider).toMatchTypeOf<{
        embed: (value: string) => Promise<number[]>;
        embedMany: (values: string[]) => Promise<number[][]>;
        dimensions: number;
        modelId: string;
      }>();

      // Verify runtime shape matches
      expect(provider).toHaveProperty('embed');
      expect(provider).toHaveProperty('embedMany');
      expect(provider).toHaveProperty('dimensions');
      expect(provider).toHaveProperty('modelId');
      expect(typeof provider.embed).toBe('function');
      expect(typeof provider.embedMany).toBe('function');
      expect(typeof provider.dimensions).toBe('number');
      expect(typeof provider.modelId).toBe('string');
    });
  });
});
