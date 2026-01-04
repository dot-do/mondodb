import { describe, it, expect } from 'vitest';
import { HybridSearchTranslator } from '../../../src/translator/hybrid-translator';

describe('HybridSearchTranslator', () => {
  describe('rankFusion', () => {
    it('should combine results using RRF algorithm', () => {
      const translator = new HybridSearchTranslator();

      const vectorResults = [
        { docId: 'doc1', score: 0.95 },
        { docId: 'doc2', score: 0.87 },
        { docId: 'doc3', score: 0.75 }
      ];

      const textResults = [
        { docId: 'doc2', score: -1.5 },
        { docId: 'doc4', score: -2.1 },
        { docId: 'doc1', score: -3.0 }
      ];

      const fused = translator.rankFusion(vectorResults, textResults);

      expect(fused[0].docId).toBe('doc2');
      expect(fused[1].docId).toBe('doc1');
      expect(fused.map(f => f.docId)).toContain('doc3');
      expect(fused.map(f => f.docId)).toContain('doc4');
    });

    it('should use k=60 constant for RRF', () => {
      const translator = new HybridSearchTranslator();

      const results = translator.rankFusion(
        [{ docId: 'doc1', score: 0.95 }],
        []
      );

      expect(results[0].fusedScore).toBeCloseTo(1/61, 5);
    });
  });

  describe('scoreFusion', () => {
    it('should combine scores with default weights (0.5, 0.5)', () => {
      const translator = new HybridSearchTranslator();

      const vectorResults = [{ docId: 'doc1', score: 0.8 }];
      const textResults = [{ docId: 'doc1', score: 0.6 }];

      const fused = translator.scoreFusion(vectorResults, textResults);

      expect(fused[0].fusedScore).toBeCloseTo(0.7, 2);
    });

    it('should apply custom weights', () => {
      const translator = new HybridSearchTranslator();

      const vectorResults = [{ docId: 'doc1', score: 1.0 }];
      const textResults = [{ docId: 'doc1', score: 0.5 }];

      const fused = translator.scoreFusion(
        vectorResults,
        textResults,
        { vector: 0.7, text: 0.3 }
      );

      expect(fused[0].fusedScore).toBeCloseTo(0.85, 2);
    });

    it('should normalize scores before fusion', () => {
      const translator = new HybridSearchTranslator();

      const vectorResults = [
        { docId: 'doc1', score: 0.9 },
        { docId: 'doc2', score: 0.5 }
      ];
      const textResults = [
        { docId: 'doc1', score: -1.0 },
        { docId: 'doc2', score: -3.0 }
      ];

      const fused = translator.scoreFusion(vectorResults, textResults);

      expect(fused[0].docId).toBe('doc1');
    });
  });
});
