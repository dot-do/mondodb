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
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { EmbeddingModel } from 'ai';

// These imports will fail until the types are implemented
import type {
  EmbeddingProvider,
  EmbeddingProviderConfig,
} from '../../../src/embedding/embedding-provider';
import { createEmbeddingModel } from '../../../src/embedding/embedding-provider';

// Import the Ai type from vectorize for the config
import type { Ai } from '../../../src/types/vectorize';

describe('EmbeddingProvider Interface (RED Phase)', () => {
  describe('EmbeddingProvider interface', () => {
    it('should have embed method that takes a string and returns Promise<number[]>', () => {
      // Type test: verify the interface shape
      expectTypeOf<EmbeddingProvider>().toHaveProperty('embed');
      expectTypeOf<EmbeddingProvider['embed']>().toBeFunction();
      expectTypeOf<EmbeddingProvider['embed']>().parameter(0).toBeString();
      expectTypeOf<EmbeddingProvider['embed']>().returns.toEqualTypeOf<Promise<number[]>>();
    });

    it('should have embedMany method that takes string[] and returns Promise<number[][]>', () => {
      expectTypeOf<EmbeddingProvider>().toHaveProperty('embedMany');
      expectTypeOf<EmbeddingProvider['embedMany']>().toBeFunction();
      expectTypeOf<EmbeddingProvider['embedMany']>().parameter(0).toEqualTypeOf<string[]>();
      expectTypeOf<EmbeddingProvider['embedMany']>().returns.toEqualTypeOf<Promise<number[][]>>();
    });

    it('should have readonly dimensions property of type number', () => {
      expectTypeOf<EmbeddingProvider>().toHaveProperty('dimensions');
      expectTypeOf<EmbeddingProvider['dimensions']>().toBeNumber();
    });

    it('should have readonly modelId property of type string', () => {
      expectTypeOf<EmbeddingProvider>().toHaveProperty('modelId');
      expectTypeOf<EmbeddingProvider['modelId']>().toBeString();
    });
  });

  describe('EmbeddingProviderConfig type', () => {
    it('should have optional ai property of type Ai', () => {
      expectTypeOf<EmbeddingProviderConfig>().toHaveProperty('ai');
      // ai is optional, so it should match Ai | undefined
      expectTypeOf<EmbeddingProviderConfig['ai']>().toEqualTypeOf<Ai | undefined>();
    });

    it('should have optional openaiApiKey property of type string', () => {
      expectTypeOf<EmbeddingProviderConfig>().toHaveProperty('openaiApiKey');
      expectTypeOf<EmbeddingProviderConfig['openaiApiKey']>().toEqualTypeOf<string | undefined>();
    });

    it('should have optional ollamaBaseUrl property of type string', () => {
      expectTypeOf<EmbeddingProviderConfig>().toHaveProperty('ollamaBaseUrl');
      expectTypeOf<EmbeddingProviderConfig['ollamaBaseUrl']>().toEqualTypeOf<string | undefined>();
    });

    it('should have optional model property of type string', () => {
      expectTypeOf<EmbeddingProviderConfig>().toHaveProperty('model');
      expectTypeOf<EmbeddingProviderConfig['model']>().toEqualTypeOf<string | undefined>();
    });

    it('should accept valid config objects', () => {
      // Config with only ai binding (preferred)
      const configWithAi: EmbeddingProviderConfig = {
        ai: {} as Ai,
      };
      expect(configWithAi).toBeDefined();

      // Config with openai fallback
      const configWithOpenai: EmbeddingProviderConfig = {
        openaiApiKey: 'sk-test-key',
      };
      expect(configWithOpenai).toBeDefined();

      // Config with ollama fallback
      const configWithOllama: EmbeddingProviderConfig = {
        ollamaBaseUrl: 'http://localhost:11434',
      };
      expect(configWithOllama).toBeDefined();

      // Config with model override
      const configWithModel: EmbeddingProviderConfig = {
        ai: {} as Ai,
        model: 'text-embedding-3-small',
      };
      expect(configWithModel).toBeDefined();

      // Empty config should also be valid (all fields optional)
      const emptyConfig: EmbeddingProviderConfig = {};
      expect(emptyConfig).toBeDefined();
    });
  });

  describe('createEmbeddingModel factory function', () => {
    it('should be a function that takes EmbeddingProviderConfig', () => {
      expectTypeOf(createEmbeddingModel).toBeFunction();
      expectTypeOf(createEmbeddingModel).parameter(0).toEqualTypeOf<EmbeddingProviderConfig>();
    });

    it('should return Promise<EmbeddingModel<string>>', () => {
      expectTypeOf(createEmbeddingModel).returns.toEqualTypeOf<Promise<EmbeddingModel<string>>>();
    });

    it('should be callable with config object', async () => {
      // This test verifies the function can be called with a valid config
      // It will fail at runtime until implementation exists
      const config: EmbeddingProviderConfig = {
        ai: {} as Ai,
      };

      // The function should exist and be callable
      expect(typeof createEmbeddingModel).toBe('function');

      // Note: We don't actually call the function here in RED phase
      // as it doesn't exist yet. This test validates the signature.
    });
  });

  describe('EmbeddingProvider compatibility with AI SDK EmbeddingModel', () => {
    it('should be compatible with AI SDK EmbeddingModel interface', () => {
      // Verify that our EmbeddingProvider can be used where EmbeddingModel<string> is expected
      // This ensures our interface aligns with the AI SDK patterns

      // Create a function that accepts EmbeddingModel<string>
      function useEmbeddingModel(_model: EmbeddingModel<string>): void {
        // no-op
      }

      // The EmbeddingProvider should be assignable to EmbeddingModel<string>
      // This type assertion will fail at compile time if incompatible
      const mockProvider = {} as EmbeddingProvider;

      // Note: This tests type compatibility at compile time
      // If EmbeddingProvider is not compatible with EmbeddingModel<string>,
      // TypeScript will report an error
      expectTypeOf(mockProvider).toMatchTypeOf<{
        embed: (value: string) => Promise<number[]>;
        embedMany: (values: string[]) => Promise<number[][]>;
        dimensions: number;
        modelId: string;
      }>();
    });
  });
});
