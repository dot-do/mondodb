# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-04

### Added

- **Core Database Engine**
  - MongoDB-compatible API backed by Cloudflare Durable Objects and SQLite
  - Query translation engine converting MongoDB queries to SQLite
  - Update translation engine for MongoDB-to-SQLite updates

- **CRUD Operations**
  - `insertOne`, `insertMany` for document insertion
  - `findOne`, `find` for document retrieval
  - `updateOne`, `updateMany` for document updates
  - `deleteOne`, `deleteMany` for document deletion
  - `replaceOne`, `countDocuments`, `estimatedDocumentCount`, `distinct`

- **Aggregation Pipeline**
  - `$match` - Filter documents
  - `$project` - Reshape documents
  - `$group` - Group documents and compute aggregates
  - `$sort`, `$limit`, `$skip` - Ordering and pagination
  - `$unwind` - Deconstruct arrays
  - `$lookup` - Join with another collection
  - `$facet` - Multi-faceted aggregation
  - `$addFields` / `$set` - Add new fields
  - `$count` - Count documents
  - `$bucket` / `$bucketAuto` - Categorize documents
  - `$function` - Custom JavaScript function execution
  - Async aggregation support for long-running pipelines

- **Index Support**
  - `createIndex`, `createIndexes` for index creation
  - `dropIndex`, `dropIndexes` for index removal
  - `listIndexes` for index enumeration
  - TTL indexes for automatic document expiration

- **Advanced Features**
  - Transactions - Multi-document transaction support
  - Change Streams - Real-time change notifications
  - Bulk Write - Batch write operations
  - Text Search - Full-text search capabilities
  - Geospatial queries - Location-based queries

- **Vector Search**
  - Vector similarity search with Cloudflare Vectorize integration
  - Automatic embedding pipeline for document vectorization
  - Semantic search capabilities

- **AgentFS Virtual Filesystem**
  - Virtual filesystem module for AI agent integration
  - Full TDD test coverage

- **Wire Protocol Server**
  - MongoDB wire protocol implementation
  - CLI server with argument parsing and backend selection
  - Local SQLite backend support

- **Studio UI**
  - Database browser interface
  - CRUD dialogs for document management
  - Collection page with Analytics tab
  - Query bar with autocomplete and syntax highlighting

- **RPC Communication**
  - HTTP/WebSocket RPC client and server
  - Worker entrypoint for Cloudflare deployment

- **Developer Experience**
  - Full TypeScript support with type definitions
  - GitHub Actions CI/CD pipeline
  - Comprehensive test suite (unit, integration, e2e, compatibility)
  - Compatibility testing infrastructure against MongoDB

### Fixed

- LeafyGreen test assertions and focus-trap issues
- QueryBar tests and Tooltip usage
- DocumentRow test role attribute handling
- CreateDocument tests for LeafyGreen UI compatibility
- TypeScript errors in studio components
- 22+ test failures in compatibility suite

[Unreleased]: https://github.com/nathanclevenger/mongo.do/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nathanclevenger/mongo.do/releases/tag/v0.1.0
