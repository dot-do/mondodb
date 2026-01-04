import { describe, it, expect } from 'vitest'
import {
  McpToolDefinition,
  ToolAnnotations,
  SearchResult,
  FetchResult,
  DoResult,
  McpTextContent,
  McpToolResponse,
  McpRequest,
  McpResponse,
  McpInitializeRequest,
  McpToolsListRequest,
  McpToolsCallRequest,
} from '../../../src/mcp/types'

describe('MCP Tool Types', () => {
  it('should define McpToolDefinition with required fields', () => {
    const tool: McpToolDefinition = {
      name: 'search',
      description: 'Search documents',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    }

    expect(tool.name).toBe('search')
    expect(tool.description).toBe('Search documents')
    expect(tool.inputSchema).toBeDefined()
    expect(tool.inputSchema.type).toBe('object')
  })

  it('should support optional annotations in McpToolDefinition', () => {
    const tool: McpToolDefinition = {
      name: 'search',
      description: 'Search documents',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
    }

    expect(tool.annotations?.readOnlyHint).toBe(true)
  })

  it('should define tool annotations matching MCP spec', () => {
    const annotations: ToolAnnotations = {
      title: 'Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    }

    // All fields should be optional
    expect(annotations.title).toBe('Search')
    expect(annotations.readOnlyHint).toBe(true)
    expect(annotations.destructiveHint).toBe(false)
    expect(annotations.idempotentHint).toBe(true)
    expect(annotations.openWorldHint).toBe(true)
  })

  it('should allow partial annotations', () => {
    const annotations: ToolAnnotations = {
      readOnlyHint: true,
    }

    expect(annotations.readOnlyHint).toBe(true)
    expect(annotations.title).toBeUndefined()
  })
})

describe('OpenAI Deep Research Response Types', () => {
  it('should define SearchResult with id, title, url, text', () => {
    const result: SearchResult = {
      id: 'db.collection.507f1f77bcf86cd799439011',
      title: 'Document Title',
      url: 'mongodb://db/collection/507f1f77bcf86cd799439011',
      text: 'Preview snippet...',
    }

    expect(result.id).toBe('db.collection.507f1f77bcf86cd799439011')
    expect(result.title).toBe('Document Title')
    expect(result.url).toBe('mongodb://db/collection/507f1f77bcf86cd799439011')
    expect(result.text).toBe('Preview snippet...')
  })

  it('should define FetchResult with full document', () => {
    const result: FetchResult = {
      id: 'db.collection.507f1f77bcf86cd799439011',
      title: 'Document Title',
      url: 'mongodb://db/collection/507f1f77bcf86cd799439011',
      text: '{"_id": "507f1f77bcf86cd799439011", "data": "value"}',
      metadata: {
        database: 'db',
        collection: 'coll',
        _id: '507f1f77bcf86cd799439011',
      },
    }

    expect(result.id).toBeDefined()
    expect(result.title).toBeDefined()
    expect(result.url).toBeDefined()
    expect(result.text).toBeDefined()
    expect(result.metadata).toBeDefined()
    expect(result.metadata.database).toBe('db')
    expect(result.metadata.collection).toBe('coll')
    expect(result.metadata._id).toBe('507f1f77bcf86cd799439011')
  })

  it('should define DoResult with success, logs, result', () => {
    const result: DoResult = {
      success: true,
      result: { count: 42 },
      logs: ['Processing...', 'Done'],
      duration: 150,
    }

    expect(result.success).toBe(true)
    expect(result.result).toEqual({ count: 42 })
    expect(result.logs).toEqual(['Processing...', 'Done'])
    expect(result.duration).toBe(150)
  })

  it('should allow DoResult with error', () => {
    const result: DoResult = {
      success: false,
      error: 'Operation failed',
      logs: ['Starting...', 'Error occurred'],
    }

    expect(result.success).toBe(false)
    expect(result.error).toBe('Operation failed')
  })
})

describe('MCP Content Types', () => {
  it('should define TextContent', () => {
    const content: McpTextContent = {
      type: 'text',
      text: 'Result text',
    }

    expect(content.type).toBe('text')
    expect(content.text).toBe('Result text')
  })

  it('should define McpToolResponse', () => {
    const response: McpToolResponse = {
      content: [{ type: 'text', text: 'Result' }],
      isError: false,
    }

    expect(response.content).toHaveLength(1)
    expect(response.content[0].type).toBe('text')
    expect(response.content[0].text).toBe('Result')
    expect(response.isError).toBe(false)
  })

  it('should define error McpToolResponse', () => {
    const response: McpToolResponse = {
      content: [{ type: 'text', text: 'Error: Something went wrong' }],
      isError: true,
    }

    expect(response.isError).toBe(true)
  })
})

describe('MCP Protocol Messages', () => {
  it('should define McpRequest base type', () => {
    const request: McpRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    }

    expect(request.jsonrpc).toBe('2.0')
    expect(request.id).toBe(1)
    expect(request.method).toBe('initialize')
  })

  it('should define McpInitializeRequest', () => {
    const request: McpInitializeRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }

    expect(request.method).toBe('initialize')
    expect(request.params.protocolVersion).toBe('2024-11-05')
    expect(request.params.clientInfo.name).toBe('test-client')
  })

  it('should define McpToolsListRequest', () => {
    const request: McpToolsListRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }

    expect(request.method).toBe('tools/list')
  })

  it('should define McpToolsCallRequest', () => {
    const request: McpToolsCallRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { query: 'test query' },
      },
    }

    expect(request.method).toBe('tools/call')
    expect(request.params.name).toBe('search')
    expect(request.params.arguments).toEqual({ query: 'test query' })
  })

  it('should define McpResponse', () => {
    const response: McpResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2024-11-05' },
    }

    expect(response.jsonrpc).toBe('2.0')
    expect(response.id).toBe(1)
    expect(response.result).toBeDefined()
  })

  it('should define error McpResponse', () => {
    const response: McpResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    }

    expect(response.error?.code).toBe(-32600)
    expect(response.error?.message).toBe('Invalid Request')
  })
})
