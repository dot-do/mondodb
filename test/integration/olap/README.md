# ClickHouse Integration Tests

This directory contains integration tests for the CDC -> ClickHouse -> Query roundtrip.

## Prerequisites

- Docker and Docker Compose installed
- Node.js environment with project dependencies installed

## Running Tests Locally

### 1. Start ClickHouse

```bash
docker-compose -f test/integration/olap/docker-compose.yml up -d
```

Wait for ClickHouse to be healthy:

```bash
docker-compose -f test/integration/olap/docker-compose.yml ps
```

### 2. Run Integration Tests

```bash
# Run all ClickHouse integration tests
CLICKHOUSE_URL=http://localhost:8123 npm run test -- --run test/integration/olap/clickhouse-integration.test.ts

# Or with more verbose output
CLICKHOUSE_URL=http://localhost:8123 npm run test -- --run --reporter=verbose test/integration/olap/clickhouse-integration.test.ts
```

### 3. Cleanup

```bash
docker-compose -f test/integration/olap/docker-compose.yml down -v
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLICKHOUSE_URL` | - | ClickHouse HTTP URL (required for tests to run) |
| `CLICKHOUSE_HOST` | `localhost` | ClickHouse hostname |
| `CLICKHOUSE_PORT` | `8123` | ClickHouse HTTP port |
| `CLICKHOUSE_USER` | `default` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | - | ClickHouse password |
| `CLICKHOUSE_DATABASE` | `mondodb_test` | Test database name |

## Test Categories

### CDC -> ClickHouse Flow Tests
- Insert event serialization and storage
- Batch inserts
- Event JSON serialization

### CDC Update Semantics
- ReplacingMergeTree version handling
- Concurrent update ordering
- FINAL modifier for deduplication

### CDC Delete Semantics (Tombstones)
- Soft delete via `_deleted` flag
- Tombstone insertion with version
- Filtering deleted documents

### Aggregation Semantics Tests
- `$group` with `$sum`, `$avg`, `$count`
- `$match` with various operators
- `$sort`, `$limit`, `$skip`

### Type Preservation Tests
- ObjectId roundtrip
- Date/DateTime roundtrip
- Nested document preservation
- Array handling

### Error Handling Tests
- Connection failures
- Query timeout
- Invalid aggregation pipeline
- Read-only operation enforcement

## CI Configuration

### GitHub Actions Example

```yaml
jobs:
  clickhouse-integration:
    runs-on: ubuntu-latest
    services:
      clickhouse:
        image: clickhouse/clickhouse-server:latest
        ports:
          - 8123:8123
          - 9000:9000
        options: >-
          --health-cmd "wget --spider -q http://localhost:8123/ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Run ClickHouse Integration Tests
        run: npm run test -- --run test/integration/olap/clickhouse-integration.test.ts
        env:
          CLICKHOUSE_URL: http://localhost:8123
          CLICKHOUSE_HOST: localhost
          CLICKHOUSE_PORT: 8123
```

### Skip in CI Without ClickHouse

Tests are automatically skipped when `CLICKHOUSE_URL` is not set:

```typescript
const describeIfClickHouse = CLICKHOUSE_URL ? describe : describe.skip;
```

This allows the test suite to run in environments without ClickHouse,
while still validating the standalone unit tests for CDC event creation
and serialization.

## Troubleshooting

### ClickHouse Won't Start

Check container logs:
```bash
docker-compose -f test/integration/olap/docker-compose.yml logs clickhouse
```

### Connection Refused

Ensure ClickHouse is healthy:
```bash
curl http://localhost:8123/ping
```

### Tests Timing Out

Increase timeout in test config or check ClickHouse performance:
```bash
# Check ClickHouse system metrics
curl "http://localhost:8123/?query=SELECT+*+FROM+system.metrics+LIMIT+10"
```

### Cleanup Failed Test Data

```bash
# Drop test database
curl "http://localhost:8123/?query=DROP+DATABASE+IF+EXISTS+mondodb_test"
```
