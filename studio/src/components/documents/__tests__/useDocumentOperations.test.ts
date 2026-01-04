import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useDocumentOperations,
  useDocumentSelection,
  copyToClipboard,
  downloadAsJson,
  prepareForDuplicate,
} from '../useDocumentOperations'

describe('useDocumentOperations', () => {
  const mockDocument = {
    _id: 'doc123',
    name: 'Test Document',
    count: 42,
  }

  it('initializes with all modals closed', () => {
    const { result } = renderHook(() => useDocumentOperations())

    expect(result.current.createOpen).toBe(false)
    expect(result.current.editOpen).toBe(false)
    expect(result.current.deleteOpen).toBe(false)
    expect(result.current.selectedDocument).toBeNull()
  })

  it('opens create modal', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openCreate()
    })

    expect(result.current.createOpen).toBe(true)
  })

  it('opens edit modal with document', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openEdit(mockDocument)
    })

    expect(result.current.editOpen).toBe(true)
    expect(result.current.selectedDocument).toEqual(mockDocument)
  })

  it('opens delete modal with document', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openDelete(mockDocument)
    })

    expect(result.current.deleteOpen).toBe(true)
    expect(result.current.selectedDocument).toEqual(mockDocument)
  })

  it('closes create modal', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openCreate()
    })
    act(() => {
      result.current.closeCreate()
    })

    expect(result.current.createOpen).toBe(false)
  })

  it('closes edit modal and clears document', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openEdit(mockDocument)
    })
    act(() => {
      result.current.closeEdit()
    })

    expect(result.current.editOpen).toBe(false)
    expect(result.current.selectedDocument).toBeNull()
  })

  it('closes delete modal and clears document', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openDelete(mockDocument)
    })
    act(() => {
      result.current.closeDelete()
    })

    expect(result.current.deleteOpen).toBe(false)
    expect(result.current.selectedDocument).toBeNull()
  })

  it('closes all modals', () => {
    const { result } = renderHook(() => useDocumentOperations())

    act(() => {
      result.current.openCreate()
      result.current.openEdit(mockDocument)
      result.current.openDelete(mockDocument)
    })
    act(() => {
      result.current.closeAll()
    })

    expect(result.current.createOpen).toBe(false)
    expect(result.current.editOpen).toBe(false)
    expect(result.current.deleteOpen).toBe(false)
    expect(result.current.selectedDocument).toBeNull()
  })
})

describe('useDocumentSelection', () => {
  const doc1 = { _id: 'doc1', name: 'Doc 1' }
  const doc2 = { _id: 'doc2', name: 'Doc 2' }
  const doc3 = { _id: 'doc3', name: 'Doc 3' }

  it('initializes with empty selection', () => {
    const { result } = renderHook(() => useDocumentSelection())

    expect(result.current.count).toBe(0)
    expect(result.current.selectedDocuments).toEqual([])
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('selects a document', () => {
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      result.current.select(doc1)
    })

    expect(result.current.count).toBe(1)
    expect(result.current.isSelected('doc1')).toBe(true)
    expect(result.current.selectedDocuments).toContainEqual(doc1)
  })

  it('toggles selection', () => {
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      result.current.toggle(doc1)
    })
    expect(result.current.isSelected('doc1')).toBe(true)

    act(() => {
      result.current.toggle(doc1)
    })
    expect(result.current.isSelected('doc1')).toBe(false)
  })

  it('deselects a document', () => {
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      result.current.select(doc1)
      result.current.select(doc2)
    })
    act(() => {
      result.current.deselect('doc1')
    })

    expect(result.current.isSelected('doc1')).toBe(false)
    expect(result.current.isSelected('doc2')).toBe(true)
    expect(result.current.count).toBe(1)
  })

  it('selects all documents', () => {
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      result.current.selectAll([doc1, doc2, doc3])
    })

    expect(result.current.count).toBe(3)
    expect(result.current.isSelected('doc1')).toBe(true)
    expect(result.current.isSelected('doc2')).toBe(true)
    expect(result.current.isSelected('doc3')).toBe(true)
  })

  it('clears selection', () => {
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      result.current.selectAll([doc1, doc2, doc3])
    })
    act(() => {
      result.current.clear()
    })

    expect(result.current.count).toBe(0)
    expect(result.current.selectedDocuments).toEqual([])
  })

  it('returns selectedIds as a Set', () => {
    const { result } = renderHook(() => useDocumentSelection())

    act(() => {
      result.current.select(doc1)
      result.current.select(doc2)
    })

    expect(result.current.selectedIds).toBeInstanceOf(Set)
    expect(result.current.selectedIds.has('doc1')).toBe(true)
    expect(result.current.selectedIds.has('doc2')).toBe(true)
    expect(result.current.selectedIds.has('doc3')).toBe(false)
  })
})

describe('copyToClipboard', () => {
  const mockClipboard = {
    writeText: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, { clipboard: mockClipboard })
  })

  it('copies string content', async () => {
    mockClipboard.writeText.mockResolvedValue(undefined)

    const result = await copyToClipboard('hello world')

    expect(mockClipboard.writeText).toHaveBeenCalledWith('hello world')
    expect(result).toBe(true)
  })

  it('stringifies object content', async () => {
    mockClipboard.writeText.mockResolvedValue(undefined)
    const obj = { name: 'test', count: 42 }

    await copyToClipboard(obj)

    expect(mockClipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(obj, null, 2)
    )
  })

  it('returns false on clipboard error', async () => {
    mockClipboard.writeText.mockRejectedValue(new Error('Failed'))

    const result = await copyToClipboard('test')

    expect(result).toBe(false)
  })
})

describe('downloadAsJson', () => {
  const mockCreateObjectURL = vi.fn(() => 'blob:test')
  const mockRevokeObjectURL = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = mockCreateObjectURL
    URL.revokeObjectURL = mockRevokeObjectURL
  })

  it('creates and triggers download', () => {
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        return mockLink as any
      }
      return originalCreateElement(tagName)
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any)

    const data = { name: 'test' }
    downloadAsJson(data, 'test-file')

    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(mockLink.download).toBe('test-file.json')
    expect(mockLink.click).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('does not add .json extension if already present', () => {
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    }
    vi.spyOn(document, 'createElement').mockImplementation(() => mockLink as any)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any)

    downloadAsJson({}, 'test-file.json')

    expect(mockLink.download).toBe('test-file.json')
  })
})

describe('prepareForDuplicate', () => {
  it('removes _id from document', () => {
    const document = {
      _id: 'doc123',
      name: 'Test',
      count: 42,
    }

    const result = prepareForDuplicate(document)

    expect(result).toEqual({ name: 'Test', count: 42 })
    expect('_id' in result).toBe(false)
  })

  it('preserves all other fields', () => {
    const document = {
      _id: 'doc123',
      name: 'Test',
      nested: { a: 1, b: 2 },
      array: [1, 2, 3],
      nullField: null,
      boolField: true,
    }

    const result = prepareForDuplicate(document)

    expect(result).toEqual({
      name: 'Test',
      nested: { a: 1, b: 2 },
      array: [1, 2, 3],
      nullField: null,
      boolField: true,
    })
  })
})
