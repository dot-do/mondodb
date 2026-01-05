/**
 * HybridSearchTranslator - Combines vector and text search results using fusion algorithms
 *
 * Supports:
 * - Reciprocal Rank Fusion (RRF): Combines results based on rank positions
 * - Score Fusion: Combines normalized scores with configurable weights
 *
 * Used for hybrid search combining vector similarity and full-text search results
 */

// ============================================================
// Types
// ============================================================

export interface SearchResult {
  docId: string;
  score: number;
}

export interface FusedResult {
  docId: string;
  fusedScore: number;
  vectorRank?: number;
  textRank?: number;
  vectorScore?: number;
  textScore?: number;
}

export interface FusionWeights {
  vector: number;
  text: number;
}

// ============================================================
// HybridSearchTranslator Class
// ============================================================

export class HybridSearchTranslator {
  // RRF constant k - controls how much weight is given to lower-ranked results
  // Higher k values give more weight to items ranked lower in the list
  private readonly RRF_K = 60;

  constructor() {}

  // ============================================================
  // Reciprocal Rank Fusion (RRF)
  // ============================================================

  /**
   * Combine vector and text search results using Reciprocal Rank Fusion
   *
   * RRF score = sum(1 / (k + rank)) for each result list where the doc appears
   *
   * For vector results: higher score = better match (e.g., 0.95 > 0.87)
   * For text results (FTS5): more negative = better match (e.g., -1.5 > -3.0)
   *
   * @param vectorResults - Results from vector similarity search (higher score = better)
   * @param textResults - Results from FTS5 text search (more negative = better)
   * @returns Combined results sorted by fused score (descending)
   */
  rankFusion(
    vectorResults: SearchResult[],
    textResults: SearchResult[]
  ): FusedResult[] {
    const docScores = new Map<string, FusedResult>();

    // Process vector results - already sorted by score descending (higher = better)
    const sortedVectorResults = [...vectorResults].sort(
      (a, b) => b.score - a.score
    );
    sortedVectorResults.forEach((result, index) => {
      const rank = index + 1; // 1-indexed rank
      const rrfScore = 1 / (this.RRF_K + rank);

      const existing = docScores.get(result.docId);
      if (existing) {
        existing.fusedScore += rrfScore;
        existing.vectorRank = rank;
        existing.vectorScore = result.score;
      } else {
        docScores.set(result.docId, {
          docId: result.docId,
          fusedScore: rrfScore,
          vectorRank: rank,
          vectorScore: result.score,
        });
      }
    });

    // Process text results - sort by score descending (less negative = better for FTS5)
    // FTS5 returns negative scores where closer to 0 is better
    const sortedTextResults = [...textResults].sort(
      (a, b) => b.score - a.score
    );
    sortedTextResults.forEach((result, index) => {
      const rank = index + 1; // 1-indexed rank
      const rrfScore = 1 / (this.RRF_K + rank);

      const existing = docScores.get(result.docId);
      if (existing) {
        existing.fusedScore += rrfScore;
        existing.textRank = rank;
        existing.textScore = result.score;
      } else {
        docScores.set(result.docId, {
          docId: result.docId,
          fusedScore: rrfScore,
          textRank: rank,
          textScore: result.score,
        });
      }
    });

    // Sort by fused score descending
    return Array.from(docScores.values()).sort(
      (a, b) => b.fusedScore - a.fusedScore
    );
  }

  // ============================================================
  // Score Fusion
  // ============================================================

  /**
   * Combine vector and text search results using weighted score fusion
   *
   * Normalizes scores to [0, 1] range before combining with weights
   *
   * For vector results: assumed to be in [0, 1] range (cosine similarity)
   * For text results (FTS5): normalized where more negative = lower normalized score
   *
   * @param vectorResults - Results from vector similarity search
   * @param textResults - Results from FTS5 text search
   * @param weights - Optional weights for vector and text scores (default: 0.5, 0.5)
   * @returns Combined results sorted by fused score (descending)
   */
  scoreFusion(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    weights: FusionWeights = { vector: 0.5, text: 0.5 }
  ): FusedResult[] {
    const docScores = new Map<string, FusedResult>();

    // Normalize vector scores (assuming already in reasonable range)
    const normalizedVectorResults = this.normalizeScores(vectorResults);

    // Normalize text scores (FTS5 negative scores)
    const normalizedTextResults = this.normalizeTextScores(textResults);

    // Create lookup maps for normalized scores
    const vectorScoreMap = new Map<string, number>();
    normalizedVectorResults.forEach((r) => vectorScoreMap.set(r.docId, r.score));

    const textScoreMap = new Map<string, number>();
    normalizedTextResults.forEach((r) => textScoreMap.set(r.docId, r.score));

    // Collect all unique document IDs
    const allDocIds = new Set<string>([
      ...vectorResults.map((r) => r.docId),
      ...textResults.map((r) => r.docId),
    ]);

    // Calculate fused scores
    for (const docId of allDocIds) {
      const vectorScore = vectorScoreMap.get(docId) ?? 0;
      const textScore = textScoreMap.get(docId) ?? 0;

      const fusedScore =
        weights.vector * vectorScore + weights.text * textScore;

      const vectorOriginal = vectorResults.find((r) => r.docId === docId);
      const textOriginal = textResults.find((r) => r.docId === docId);

      const result: FusedResult = {
        docId,
        fusedScore,
      };
      if (vectorOriginal !== undefined) {
        result.vectorScore = vectorOriginal.score;
      }
      if (textOriginal !== undefined) {
        result.textScore = textOriginal.score;
      }

      docScores.set(docId, result);
    }

    // Sort by fused score descending
    return Array.from(docScores.values()).sort(
      (a, b) => b.fusedScore - a.fusedScore
    );
  }

  // ============================================================
  // Score Normalization
  // ============================================================

  /**
   * Normalize scores to [0, 1] range using min-max normalization
   * For single results, preserve the original score (assumed to be in [0, 1] range)
   */
  private normalizeScores(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return [];
    // For single result, keep original score (vector scores assumed to be in [0, 1])
    const first = results[0];
    if (results.length === 1 && first) return [{ docId: first.docId, score: first.score }];

    const scores = results.map((r) => r.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore;

    if (range === 0) {
      // All scores are the same - keep original scores
      return results.map((r) => ({ ...r }));
    }

    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / range,
    }));
  }

  /**
   * Normalize FTS5 text scores (negative values where closer to 0 is better)
   * Converts to [0, 1] range where 1 is the best match
   * For single results, preserve the original score if it's positive (e.g., already normalized)
   * or return 1 for single negative score results
   */
  private normalizeTextScores(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return [];
    // For single result, keep original score if non-negative, otherwise use 1
    const first = results[0];
    if (results.length === 1 && first) {
      const score = first.score;
      // If score is non-negative, assume it's already normalized or in valid range
      return [{ docId: first.docId, score: score >= 0 ? score : 1 }];
    }

    const scores = results.map((r) => r.score);
    const minScore = Math.min(...scores); // Most negative (worst)
    const maxScore = Math.max(...scores); // Least negative (best)
    const range = maxScore - minScore;

    if (range === 0) {
      // All scores are the same - return 1 for all
      return results.map((r) => ({ ...r, score: 1 }));
    }

    // Normalize so that the highest (least negative) score becomes 1
    // and the lowest (most negative) score becomes 0
    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / range,
    }));
  }
}

export default HybridSearchTranslator;
