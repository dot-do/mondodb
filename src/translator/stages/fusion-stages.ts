/**
 * Fusion Aggregation Stages
 *
 * Implements $rankFusion and $scoreFusion aggregation stages for hybrid search.
 * These stages combine results from vector search and full-text search pipelines.
 *
 * MongoDB Atlas $rankFusion and $scoreFusion inspired stages:
 * - $rankFusion: Reciprocal Rank Fusion (RRF) algorithm
 * - $scoreFusion: Weighted score combination with normalization
 */

import type { StageResult, StageContext, PipelineStage } from './types';

// ============================================================
// Types
// ============================================================

/**
 * Result from a fusion stage translation
 */
export interface FusionStageResult extends StageResult {
  fusionType: 'rrf' | 'score';
  vectorPipeline: PipelineStage[];
  textPipeline: PipelineStage[];
  limit?: number;
  // RRF specific
  rrfK?: number;
  // Score fusion specific
  weights?: { vector: number; text: number };
  normalizeScores?: boolean;
}

/**
 * Pipeline configuration for fusion stages
 */
export interface FusionPipelines {
  vector: PipelineStage[];
  text: PipelineStage[];
}

/**
 * $rankFusion stage specification
 */
export interface RankFusionStageSpec {
  input: {
    pipelines: FusionPipelines;
  };
  combination?: {
    ranker?: 'rrf';
    k?: number;
  };
  limit?: number;
}

/**
 * $scoreFusion stage specification
 */
export interface ScoreFusionStageSpec {
  input: {
    pipelines: FusionPipelines;
  };
  combination?: {
    weights?: {
      vector: number;
      text: number;
    };
    normalizeScores?: boolean;
  };
  limit?: number;
}

// ============================================================
// Default Constants
// ============================================================

/** Default RRF k constant */
const DEFAULT_RRF_K = 60;

/** Default fusion weights */
const DEFAULT_WEIGHTS = { vector: 0.5, text: 0.5 };

// ============================================================
// $rankFusion Stage Translation
// ============================================================

/**
 * Translate a $rankFusion aggregation stage
 *
 * The $rankFusion stage combines results from multiple search pipelines
 * using Reciprocal Rank Fusion (RRF). This algorithm is particularly
 * effective for combining results from different ranking systems
 * (e.g., vector similarity and BM25 text search).
 *
 * RRF Formula: score = sum(1 / (k + rank)) for each pipeline
 *
 * @param spec The $rankFusion stage specification
 * @param context Stage context including collection name
 * @returns FusionStageResult with pipeline configurations
 */
export function translateRankFusionStage(
  spec: RankFusionStageSpec,
  context: StageContext
): FusionStageResult {
  // Validate input
  if (!spec.input?.pipelines) {
    throw new Error('$rankFusion requires input.pipelines');
  }

  const { pipelines } = spec.input;

  if (!pipelines.vector || !pipelines.text) {
    throw new Error('$rankFusion requires both vector and text pipelines');
  }

  // Extract RRF k constant
  const rrfK = spec.combination?.k ?? DEFAULT_RRF_K;

  return {
    fusionType: 'rrf',
    vectorPipeline: pipelines.vector,
    textPipeline: pipelines.text,
    rrfK,
    limit: spec.limit,
    params: [],
    transformsShape: true,
  };
}

// ============================================================
// $scoreFusion Stage Translation
// ============================================================

/**
 * Translate a $scoreFusion aggregation stage
 *
 * The $scoreFusion stage combines results from multiple search pipelines
 * using weighted score combination. Scores are optionally normalized
 * before combining.
 *
 * Formula: fusedScore = (vectorWeight * normalizedVectorScore) +
 *                       (textWeight * normalizedTextScore)
 *
 * @param spec The $scoreFusion stage specification
 * @param context Stage context including collection name
 * @returns FusionStageResult with pipeline configurations
 */
export function translateScoreFusionStage(
  spec: ScoreFusionStageSpec,
  context: StageContext
): FusionStageResult {
  // Validate input
  if (!spec.input?.pipelines) {
    throw new Error('$scoreFusion requires input.pipelines');
  }

  const { pipelines } = spec.input;

  if (!pipelines.vector || !pipelines.text) {
    throw new Error('$scoreFusion requires both vector and text pipelines');
  }

  // Extract and normalize weights
  let weights = spec.combination?.weights ?? { ...DEFAULT_WEIGHTS };
  weights = normalizeWeights(weights);

  // Extract normalization option
  const normalizeScores = spec.combination?.normalizeScores ?? true;

  return {
    fusionType: 'score',
    vectorPipeline: pipelines.vector,
    textPipeline: pipelines.text,
    weights,
    normalizeScores,
    limit: spec.limit,
    params: [],
    transformsShape: true,
  };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Normalize weights so they sum to 1.0
 */
function normalizeWeights(weights: { vector: number; text: number }): {
  vector: number;
  text: number;
} {
  const sum = weights.vector + weights.text;

  if (sum === 0) {
    return { vector: 0.5, text: 0.5 };
  }

  if (Math.abs(sum - 1) < 0.001) {
    // Already normalized (within tolerance)
    return weights;
  }

  return {
    vector: weights.vector / sum,
    text: weights.text / sum,
  };
}

/**
 * Build SQL CTE for rank fusion
 *
 * Creates CTEs that:
 * 1. Execute vector search pipeline
 * 2. Execute text search pipeline
 * 3. Combine results using RRF
 */
export function buildRankFusionSQL(
  result: FusionStageResult,
  collection: string
): { sql: string; params: unknown[] } {
  const k = result.rrfK ?? DEFAULT_RRF_K;

  // This is a template - actual implementation will require
  // executing both pipelines and combining results in JavaScript
  // since SQLite doesn't support row_number() in all contexts
  const sql = `
    WITH vector_ranked AS (
      -- Vector search results will be inserted here
      SELECT docId, row_number() OVER (ORDER BY score DESC) as rank
      FROM vector_results
    ),
    text_ranked AS (
      -- Text search results will be inserted here
      SELECT docId, row_number() OVER (ORDER BY score DESC) as rank
      FROM text_results
    ),
    rrf_scores AS (
      SELECT
        COALESCE(v.docId, t.docId) as docId,
        COALESCE(1.0 / (${k} + v.rank), 0) + COALESCE(1.0 / (${k} + t.rank), 0) as fusedScore
      FROM vector_ranked v
      FULL OUTER JOIN text_ranked t ON v.docId = t.docId
    )
    SELECT docId, fusedScore
    FROM rrf_scores
    ORDER BY fusedScore DESC
    ${result.limit ? `LIMIT ${result.limit}` : ''}
  `.trim();

  return { sql, params: [] };
}

/**
 * Build SQL CTE for score fusion
 *
 * Creates CTEs that:
 * 1. Execute vector search pipeline
 * 2. Execute text search pipeline
 * 3. Normalize scores
 * 4. Combine with weights
 */
export function buildScoreFusionSQL(
  result: FusionStageResult,
  collection: string
): { sql: string; params: unknown[] } {
  const { vector: vectorWeight, text: textWeight } = result.weights ?? DEFAULT_WEIGHTS;

  // This is a template - actual implementation will require
  // executing both pipelines and combining results in JavaScript
  const sql = `
    WITH vector_scores AS (
      -- Vector search results with normalized scores
      SELECT docId, score as vectorScore
      FROM vector_results
    ),
    text_scores AS (
      -- Text search results with normalized scores
      SELECT docId, score as textScore
      FROM text_results
    ),
    fused_scores AS (
      SELECT
        COALESCE(v.docId, t.docId) as docId,
        (${vectorWeight} * COALESCE(v.vectorScore, 0)) +
        (${textWeight} * COALESCE(t.textScore, 0)) as fusedScore
      FROM vector_scores v
      FULL OUTER JOIN text_scores t ON v.docId = t.docId
    )
    SELECT docId, fusedScore
    FROM fused_scores
    ORDER BY fusedScore DESC
    ${result.limit ? `LIMIT ${result.limit}` : ''}
  `.trim();

  return { sql, params: [] };
}
