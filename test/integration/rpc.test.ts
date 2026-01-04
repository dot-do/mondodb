/**
 * Integration tests for RPC Layer with capnweb and Workers RPC
 *
 * Tests cover:
 * - RPC Target (Server-side)
 * - RPC Client (Client-side)
 * - Workers Entrypoint (Service Bindings)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Task mondodb-28p: RPC Server Tests (RED)
// ============================================================================

describe('RPC Server - MondoRpcTarget', () => {
  describe('Worker exports RpcTarget for MongoDB API', () => {
    it('should export MondoRpcTarget class', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      expect(MondoRpcTarget).toBeDefined();
      expect(typeof MondoRpcTarget).toBe('function');
    });

    it('should extend RpcTarget base class', async () => {
      const { MondoRpcTarget, RpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = { MONDO_DATABASE: {} };
      const target = new MondoRpcTarget(mockEnv as any);
      expect(target).toBeInstanceOf(RpcTarget);
    });

    it('should have connect method', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = { MONDO_DATABASE: {} };
      const target = new MondoRpcTarget(mockEnv as any);
      expect(typeof target.connect).toBe('function');
    });

    it('should have db method', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = { MONDO_DATABASE: {} };
      const target = new MondoRpcTarget(mockEnv as any);
      expect(typeof target.db).toBe('function');
    });

    it('should have collection method', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = { MONDO_DATABASE: {} };
      const target = new MondoRpcTarget(mockEnv as any);
      expect(typeof target.collection).toBe('function');
    });
  });

  describe('newWorkersRpcResponse handles requests', () => {
    it('should export newWorkersRpcResponse function', async () => {
      const { newWorkersRpcResponse } = await import('../../src/rpc/rpc-target');
      expect(newWorkersRpcResponse).toBeDefined();
      expect(typeof newWorkersRpcResponse).toBe('function');
    });

    it('should return Response for valid RPC request', async () => {
      const { newWorkersRpcResponse, MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'test-id' }),
          get: vi.fn().mockReturnValue({}),
        },
      };

      const request = new Request('https://example.com/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'connect', params: ['mongodb://localhost/test'] }),
      });

      const target = new MondoRpcTarget(mockEnv as any);
      const response = await newWorkersRpcResponse(target, request);

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    it('should handle method not found errors', async () => {
      const { newWorkersRpcResponse, MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = { MONDO_DATABASE: {} };

      const request = new Request('https://example.com/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'nonExistentMethod', params: [] }),
      });

      const target = new MondoRpcTarget(mockEnv as any);
      const response = await newWorkersRpcResponse(target, request);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toContain('Method not found');
    });
  });

  describe('HTTP batch protocol support', () => {
    it('should handle batch requests', async () => {
      const { newWorkersRpcResponse, MondoRpcTarget } = await import('../../src/rpc/rpc-target');
      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'test-id' }),
          get: vi.fn().mockReturnValue({}),
        },
      };

      const batchRequests = [
        { id: '1', method: 'connect', params: ['mongodb://localhost/test'] },
        { id: '2', method: 'db', params: ['testdb'] },
      ];

      const request = new Request('https://example.com/rpc/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchRequests),
      });

      const target = new MondoRpcTarget(mockEnv as any);
      const response = await newWorkersRpcResponse(target, request);

      expect(response).toBeInstanceOf(Response);
      const body = await response.json() as { results: unknown[] };
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.results.length).toBe(2);
    });
  });

  describe('Method dispatch to Durable Object', () => {
    it('should route connect to Durable Object stub', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };

      const target = new MondoRpcTarget(mockEnv as any);
      const result = await target.connect('mongodb://localhost/testdb');

      expect(mockEnv.MONDO_DATABASE.idFromName).toHaveBeenCalled();
      expect(mockEnv.MONDO_DATABASE.get).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should route db operations to correct Durable Object', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };

      const target = new MondoRpcTarget(mockEnv as any);
      await target.connect('mongodb://localhost/testdb');
      const db = await target.db('testdb');

      expect(db).toBeDefined();
      expect(mockEnv.MONDO_DATABASE.idFromName).toHaveBeenCalledWith('testdb');
    });

    it('should route collection operations to correct Durable Object', async () => {
      const { MondoRpcTarget } = await import('../../src/rpc/rpc-target');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };

      const target = new MondoRpcTarget(mockEnv as any);
      await target.connect('mongodb://localhost/testdb');
      const collection = await target.collection('testdb', 'users');

      expect(collection).toBeDefined();
    });
  });
});

// ============================================================================
// Task mondodb-0f6: RPC Server Refactoring Tests (Request Batching, Promise Pipelining)
// ============================================================================

describe('RPC Server - Batching and Pipelining', () => {
  describe('Request batching', () => {
    it('should batch multiple requests into single Durable Object call', async () => {
      const { BatchedRpcExecutor } = await import('../../src/rpc/rpc-target');
      expect(BatchedRpcExecutor).toBeDefined();
    });

    it('should coalesce requests to the same database', async () => {
      const { BatchedRpcExecutor } = await import('../../src/rpc/rpc-target');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ results: [{ ok: true }, { ok: true }] }))
        ),
      };

      const executor = new BatchedRpcExecutor(mockStub as any);

      // Queue multiple operations
      const promise1 = executor.execute('find', { collection: 'users', query: {} });
      const promise2 = executor.execute('find', { collection: 'users', query: { active: true } });

      // Flush batch
      await executor.flush();

      // Should have made only one fetch call
      expect(mockStub.fetch).toHaveBeenCalledTimes(1);

      const results = await Promise.all([promise1, promise2]);
      expect(results).toHaveLength(2);
    });

    it('should respect batch size limits', async () => {
      const { BatchedRpcExecutor } = await import('../../src/rpc/rpc-target');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ results: new Array(100).fill({ ok: true }) }))
        ),
      };

      const executor = new BatchedRpcExecutor(mockStub as any, { maxBatchSize: 50 });

      // Queue more requests than batch size
      const promises = Array.from({ length: 100 }, (_, i) =>
        executor.execute('find', { collection: 'users', query: { id: i } })
      );

      await executor.flush();

      // Should have made at least 2 fetch calls due to batch size limit
      expect(mockStub.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Promise pipelining', () => {
    it('should support promise pipelining for chained operations', async () => {
      const { PipelinedRpcProxy } = await import('../../src/rpc/rpc-target');
      expect(PipelinedRpcProxy).toBeDefined();
    });

    it('should pipeline db().collection() calls', async () => {
      const { PipelinedRpcProxy, MondoRpcTarget } = await import('../../src/rpc/rpc-target');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };

      const target = new MondoRpcTarget(mockEnv as any);
      const proxy = new PipelinedRpcProxy(target);

      // This should be pipelined into a single request
      const result = await proxy.db('testdb').collection('users').find({});

      expect(result).toBeDefined();
    });

    it('should track pipeline dependencies', async () => {
      const { PipelineTracker } = await import('../../src/rpc/rpc-target');

      const tracker = new PipelineTracker();

      const op1 = tracker.track('db', ['testdb']);
      const op2 = tracker.track('collection', ['users'], op1);
      const op3 = tracker.track('find', [{}], op2);

      expect(tracker.getDependencies(op3)).toContain(op2);
      expect(tracker.getDependencies(op3)).toContain(op1);
    });
  });
});

// ============================================================================
// Task mondodb-dzz: RPC Client Tests (RED)
// ============================================================================

describe('RPC Client', () => {
  describe('HTTP batch protocol', () => {
    it('should export RpcClient class', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');
      expect(RpcClient).toBeDefined();
      expect(typeof RpcClient).toBe('function');
    });

    it('should connect via HTTP', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      // Mock fetch
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ connected: true }))
      );
      globalThis.fetch = mockFetch;

      const client = new RpcClient('http://localhost:8787/rpc');
      const result = await client.call('connect', ['mongodb://localhost/test']);

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should batch multiple calls', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [{ ok: true }, { ok: true }] }))
      );
      globalThis.fetch = mockFetch;

      const client = new RpcClient('http://localhost:8787/rpc');

      // Start batch mode
      client.startBatch();
      const p1 = client.call('find', [{ collection: 'users' }]);
      const p2 = client.call('find', [{ collection: 'posts' }]);
      await client.endBatch();

      // Should have made only one fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const results = await Promise.all([p1, p2]);
      expect(results).toHaveLength(2);
    });
  });

  describe('WebSocket sessions', () => {
    it('should support WebSocket connections', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      const client = new RpcClient('ws://localhost:8787/rpc');
      expect(client.transport).toBe('websocket');
    });

    it('should handle WebSocket message framing', async () => {
      const { WebSocketRpcTransport } = await import('../../src/rpc/rpc-client');
      expect(WebSocketRpcTransport).toBeDefined();
    });

    it('should support bidirectional streaming', async () => {
      const { WebSocketRpcTransport } = await import('../../src/rpc/rpc-client');

      // Create a more complete WebSocket mock
      const messageHandlers: Array<(event: { data: string }) => void> = [];
      const mockWs = {
        send: vi.fn().mockImplementation((data: string) => {
          // Simulate response after send
          const parsed = JSON.parse(data);
          setTimeout(() => {
            messageHandlers.forEach(handler => {
              handler({ data: JSON.stringify({ id: parsed.id, result: { ok: true } }) });
            });
          }, 0);
        }),
        addEventListener: vi.fn().mockImplementation((event: string, handler: (event: { data: string }) => void) => {
          if (event === 'message') {
            messageHandlers.push(handler);
          }
        }),
        readyState: 1, // WebSocket.OPEN
      };

      const transport = new WebSocketRpcTransport(mockWs as any);
      const result = await transport.send({ method: 'find', params: [{}] });

      expect(mockWs.send).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });
  });
});

// ============================================================================
// Task mondodb-1sw: RPC Client Refactoring Tests (Auto-reconnection, Deduplication)
// ============================================================================

describe('RPC Client - Auto-reconnection and Deduplication', () => {
  describe('Auto-reconnection', () => {
    it('should automatically reconnect on connection loss', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      const client = new RpcClient('http://localhost:8787/rpc', {
        autoReconnect: true,
        reconnectInterval: 100,
      });

      expect(client.options.autoReconnect).toBe(true);
    });

    it('should retry failed requests after reconnection', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true })));
      });
      globalThis.fetch = mockFetch;

      const client = new RpcClient('http://localhost:8787/rpc', {
        autoReconnect: true,
        maxRetries: 3,
      });

      const result = await client.call('find', [{ collection: 'users' }]);

      expect(result).toBeDefined();
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });

    it('should emit reconnection events', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      const client = new RpcClient('http://localhost:8787/rpc', {
        autoReconnect: true,
      });

      const reconnectHandler = vi.fn();
      client.on('reconnect', reconnectHandler);

      // Simulate reconnection
      client.emit('reconnect', { attempt: 1 });

      expect(reconnectHandler).toHaveBeenCalledWith({ attempt: 1 });
    });
  });

  describe('Request deduplication', () => {
    it('should deduplicate identical concurrent requests', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 1 }] }))
      );
      globalThis.fetch = mockFetch;

      const client = new RpcClient('http://localhost:8787/rpc', {
        deduplicate: true,
      });

      // Make identical concurrent requests
      const [r1, r2, r3] = await Promise.all([
        client.call('find', [{ collection: 'users', query: {} }]),
        client.call('find', [{ collection: 'users', query: {} }]),
        client.call('find', [{ collection: 'users', query: {} }]),
      ]);

      // Should have made only one fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // All results should be the same
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });

    it('should not deduplicate different requests', async () => {
      const { RpcClient } = await import('../../src/rpc/rpc-client');

      // Create a new Response for each call to avoid body already used issue
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ data: [] })))
      );
      globalThis.fetch = mockFetch;

      const client = new RpcClient('http://localhost:8787/rpc', {
        deduplicate: true,
      });

      await Promise.all([
        client.call('find', [{ collection: 'users' }]),
        client.call('find', [{ collection: 'posts' }]),
      ]);

      // Different requests should not be deduplicated
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should expire deduplication cache', async () => {
      const { RequestDeduplicator } = await import('../../src/rpc/rpc-client');

      const deduplicator = new RequestDeduplicator({ ttl: 50 });

      const key = 'find:users:{}';
      const promise1 = Promise.resolve({ data: [] });

      deduplicator.set(key, promise1);
      expect(deduplicator.has(key)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(deduplicator.has(key)).toBe(false);
    });
  });
});

// ============================================================================
// Task mondodb-8m3: Workers Entrypoint Tests (RED)
// ============================================================================

describe('Workers Entrypoint', () => {
  describe('WorkerEntrypoint export', () => {
    it('should export MondoEntrypoint class', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');
      expect(MondoEntrypoint).toBeDefined();
      expect(typeof MondoEntrypoint).toBe('function');
    });

    it('should extend WorkerEntrypoint base class', async () => {
      const { MondoEntrypoint, WorkerEntrypoint } = await import('../../src/rpc/worker-entrypoint');
      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue({}),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);
      expect(entrypoint).toBeInstanceOf(WorkerEntrypoint);
    });
  });

  describe('Service binding methods', () => {
    it('should expose connect method for service bindings', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');
      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue({}),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);
      expect(typeof entrypoint.connect).toBe('function');
    });

    it('should expose db method for service bindings', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');
      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue({}),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);
      expect(typeof entrypoint.db).toBe('function');
    });

    it('should expose collection method for service bindings', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');
      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue({}),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);
      expect(typeof entrypoint.collection).toBe('function');
    });

    it('should return RPC-serializable results', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ _id: '123', name: 'test' }))
        ),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);
      await entrypoint.connect('mongodb://localhost/testdb');
      const collection = await entrypoint.collection('testdb', 'users');

      expect(collection).toBeDefined();
    });
  });

  describe('Service binding integration', () => {
    it('should be callable via env.MONDO binding', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      // Simulate service binding call
      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);
      const result = await entrypoint.connect('mongodb://localhost/test');

      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// Task mondodb-i7a: Workers Entrypoint Refactoring Tests (TypeScript Declarations, Environment Safety)
// ============================================================================

describe('Workers Entrypoint - TypeScript and Environment Safety', () => {
  describe('TypeScript declarations', () => {
    it('should export Env interface', async () => {
      const module = await import('../../src/rpc/worker-entrypoint');
      // TypeScript type exports won't be testable at runtime,
      // but we verify the module structure is correct
      expect(module).toBeDefined();
    });

    it('should export MondoBindings interface', async () => {
      const { isMondoEnv } = await import('../../src/rpc/worker-entrypoint');
      // Type guard function for Mondo environment
      expect(typeof isMondoEnv).toBe('function');
    });

    it('should have properly typed methods', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');

      // Verify method signatures exist
      const prototype = MondoEntrypoint.prototype;
      expect(prototype.connect).toBeDefined();
      expect(prototype.db).toBeDefined();
      expect(prototype.collection).toBeDefined();
    });
  });

  describe('Environment safety', () => {
    it('should validate environment bindings', async () => {
      const { validateEnv, MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');

      const validEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn(),
          get: vi.fn(),
        },
      };

      const invalidEnv = {};

      expect(validateEnv(validEnv)).toBe(true);
      expect(validateEnv(invalidEnv)).toBe(false);
    });

    it('should throw helpful error for missing bindings', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      expect(() => {
        new MondoEntrypoint(mockCtx as any, {} as any);
      }).toThrow(/MONDO_DATABASE/);
    });

    it('should handle ctx.waitUntil for background tasks', async () => {
      const { MondoEntrypoint } = await import('../../src/rpc/worker-entrypoint');

      const mockStub = {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
      };

      const mockEnv = {
        MONDO_DATABASE: {
          idFromName: vi.fn().mockReturnValue({ toString: () => 'db-id' }),
          get: vi.fn().mockReturnValue(mockStub),
        },
      };
      const mockCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

      const entrypoint = new MondoEntrypoint(mockCtx as any, mockEnv as any);

      // Background cleanup task
      entrypoint.scheduleCleanup();

      expect(mockCtx.waitUntil).toHaveBeenCalled();
    });

    it('should provide safe default options', async () => {
      const { DEFAULT_OPTIONS } = await import('../../src/rpc/worker-entrypoint');

      expect(DEFAULT_OPTIONS).toBeDefined();
      expect(DEFAULT_OPTIONS.maxBatchSize).toBeGreaterThan(0);
      expect(DEFAULT_OPTIONS.timeout).toBeGreaterThan(0);
    });
  });
});
