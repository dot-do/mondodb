/**
 * CDC (Change Data Capture) Module
 *
 * Provides infrastructure for capturing and emitting document changes
 * to downstream OLAP systems like ClickHouse via Cloudflare Pipelines.
 */

export * from './cdc-schema';
export * from './cdc-emitter';
export * from './cdc-buffer';
