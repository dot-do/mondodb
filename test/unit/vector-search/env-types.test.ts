import { describe, it, expect } from 'vitest';
import type { Env } from '../../../src/types/env';

describe('Env types for vector search', () => {
  it('should have optional VECTORIZE binding', () => {
    const env: Env = { MONDO_DATABASE: {} as any };
    expect(env.VECTORIZE).toBeUndefined();
  });

  it('should have optional AI binding', () => {
    const env: Env = { MONDO_DATABASE: {} as any };
    expect(env.AI).toBeUndefined();
  });

  it('should accept EMBEDDING_MODEL config', () => {
    const env: Env = {
      MONDO_DATABASE: {} as any,
      EMBEDDING_MODEL: '@cf/baai/bge-m3'
    };
    expect(env.EMBEDDING_MODEL).toBe('@cf/baai/bge-m3');
  });

  it('should accept EMBEDDING_ENABLED config', () => {
    const env: Env = {
      MONDO_DATABASE: {} as any,
      EMBEDDING_ENABLED: 'true'
    };
    expect(env.EMBEDDING_ENABLED).toBe('true');
  });
});
