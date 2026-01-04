import { describe, it, expect } from 'vitest';
import {
  translateRankFusionStage,
  translateScoreFusionStage,
} from '../../../src/translator/stages/fusion-stages';
import type { StageContext } from '../../../src/translator/stages/types';

describe('Fusion Aggregation Stages', () => {
  const createContext = (): StageContext => ({
    collection: 'test_collection',
    cteIndex: 0,
    existingParams: [],
  });

  describe('$rankFusion stage', () => {
    it('should translate $rankFusion with vector and text pipelines', () => {
      const rankFusionSpec = {
        input: {
          pipelines: {
            vector: [
              { $vectorSearch: { queryVector: [0.1, 0.2, 0.3], path: 'embedding', numCandidates: 100, limit: 10 } }
            ],
            text: [
              { $search: { text: { query: 'hello world', path: 'content' } } }
            ]
          }
        },
        limit: 20
      };

      const result = translateRankFusionStage(rankFusionSpec, createContext());

      expect(result).toBeDefined();
      expect(result.fusionType).toBe('rrf');
      expect(result.vectorPipeline).toBeDefined();
      expect(result.textPipeline).toBeDefined();
      expect(result.limit).toBe(20);
    });

    it('should use default RRF k constant of 60', () => {
      const rankFusionSpec = {
        input: {
          pipelines: {
            vector: [{ $vectorSearch: { queryVector: [0.1], path: 'vec', limit: 10 } }],
            text: [{ $search: { text: { query: 'test', path: 'text' } } }]
          }
        }
      };

      const result = translateRankFusionStage(rankFusionSpec, createContext());

      expect(result.rrfK).toBe(60);
    });

    it('should accept custom RRF k constant', () => {
      const rankFusionSpec = {
        input: {
          pipelines: {
            vector: [{ $vectorSearch: { queryVector: [0.1], path: 'vec', limit: 10 } }],
            text: [{ $search: { text: { query: 'test', path: 'text' } } }]
          }
        },
        combination: {
          ranker: 'rrf',
          k: 100
        }
      };

      const result = translateRankFusionStage(rankFusionSpec, createContext());

      expect(result.rrfK).toBe(100);
    });
  });

  describe('$scoreFusion stage', () => {
    it('should translate $scoreFusion with default weights', () => {
      const scoreFusionSpec = {
        input: {
          pipelines: {
            vector: [{ $vectorSearch: { queryVector: [0.1], path: 'vec', limit: 10 } }],
            text: [{ $search: { text: { query: 'test', path: 'text' } } }]
          }
        }
      };

      const result = translateScoreFusionStage(scoreFusionSpec, createContext());

      expect(result).toBeDefined();
      expect(result.fusionType).toBe('score');
      expect(result.weights.vector).toBe(0.5);
      expect(result.weights.text).toBe(0.5);
    });

    it('should accept custom weights', () => {
      const scoreFusionSpec = {
        input: {
          pipelines: {
            vector: [{ $vectorSearch: { queryVector: [0.1], path: 'vec', limit: 10 } }],
            text: [{ $search: { text: { query: 'test', path: 'text' } } }]
          }
        },
        combination: {
          weights: {
            vector: 0.7,
            text: 0.3
          }
        }
      };

      const result = translateScoreFusionStage(scoreFusionSpec, createContext());

      expect(result.weights.vector).toBe(0.7);
      expect(result.weights.text).toBe(0.3);
    });

    it('should normalize weights if they do not sum to 1', () => {
      const scoreFusionSpec = {
        input: {
          pipelines: {
            vector: [{ $vectorSearch: { queryVector: [0.1], path: 'vec', limit: 10 } }],
            text: [{ $search: { text: { query: 'test', path: 'text' } } }]
          }
        },
        combination: {
          weights: {
            vector: 7,
            text: 3
          }
        }
      };

      const result = translateScoreFusionStage(scoreFusionSpec, createContext());

      expect(result.weights.vector).toBeCloseTo(0.7, 2);
      expect(result.weights.text).toBeCloseTo(0.3, 2);
    });

    it('should include score normalization option', () => {
      const scoreFusionSpec = {
        input: {
          pipelines: {
            vector: [{ $vectorSearch: { queryVector: [0.1], path: 'vec', limit: 10 } }],
            text: [{ $search: { text: { query: 'test', path: 'text' } } }]
          }
        },
        combination: {
          normalizeScores: true
        }
      };

      const result = translateScoreFusionStage(scoreFusionSpec, createContext());

      expect(result.normalizeScores).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw error for $rankFusion without pipelines', () => {
      const invalidSpec = {
        input: {}
      };

      expect(() => translateRankFusionStage(invalidSpec as any, createContext())).toThrow();
    });

    it('should throw error for $scoreFusion without pipelines', () => {
      const invalidSpec = {
        input: {}
      };

      expect(() => translateScoreFusionStage(invalidSpec as any, createContext())).toThrow();
    });
  });
});
