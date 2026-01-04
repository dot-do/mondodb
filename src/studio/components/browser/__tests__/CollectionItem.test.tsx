/**
 * CollectionItem Component Tests
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollectionItem } from '../CollectionItem'
import type { CollectionInfo, CollectionStats } from '../types'

describe('CollectionItem', () => {
  const mockCollection: CollectionInfo = {
    name: 'users',
    type: 'collection',
  }

  const mockStats: CollectionStats = {
    name: 'users',
    count: 1500,
    size: 102400,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders collection name', () => {
      render(<CollectionItem collection={mockCollection} database="testdb" />)
      expect(screen.getByText('users')).toBeInTheDocument()
    })

    it('renders view badge for view type', () => {
      const viewCollection: CollectionInfo = {
        name: 'userView',
        type: 'view',
      }
      render(<CollectionItem collection={viewCollection} database="testdb" />)
      expect(screen.getByText('View')).toBeInTheDocument()
    })

    it('does not render view badge for regular collection', () => {
      render(<CollectionItem collection={mockCollection} database="testdb" />)
      expect(screen.queryByText('View')).not.toBeInTheDocument()
    })

    it('renders stats when provided', () => {
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={mockStats}
        />
      )
      expect(screen.getByText(/1\.5K.*docs/)).toBeInTheDocument()
      expect(screen.getByText('100 KB')).toBeInTheDocument()
    })

    it('renders loading state for stats', () => {
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          isLoadingStats={true}
        />
      )
      expect(screen.getByTestId('stats-loading')).toBeInTheDocument()
    })

    it('does not render stats when not provided', () => {
      render(<CollectionItem collection={mockCollection} database="testdb" />)
      expect(screen.queryByText('docs')).not.toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('applies selected styles when isSelected is true', () => {
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          isSelected={true}
        />
      )
      const item = screen.getByTestId('collection-item-users')
      expect(item).toHaveAttribute('aria-selected', 'true')
    })

    it('does not apply selected styles when isSelected is false', () => {
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          isSelected={false}
        />
      )
      const item = screen.getByTestId('collection-item-users')
      expect(item).toHaveAttribute('aria-selected', 'false')
    })
  })

  describe('interactions', () => {
    it('calls onClick with database and collection when clicked', () => {
      const onClick = vi.fn()
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          onClick={onClick}
        />
      )

      fireEvent.click(screen.getByTestId('collection-item-users'))
      expect(onClick).toHaveBeenCalledWith('testdb', 'users')
    })

    it('calls onDropCollection when drop button is clicked', () => {
      const onDropCollection = vi.fn()
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          onDropCollection={onDropCollection}
        />
      )

      const dropButton = screen.getByTestId('drop-collection-users')
      fireEvent.click(dropButton)
      expect(onDropCollection).toHaveBeenCalledWith('testdb', 'users')
    })

    it('does not trigger onClick when drop button is clicked', () => {
      const onClick = vi.fn()
      const onDropCollection = vi.fn()
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          onClick={onClick}
          onDropCollection={onDropCollection}
        />
      )

      const dropButton = screen.getByTestId('drop-collection-users')
      fireEvent.click(dropButton)
      expect(onClick).not.toHaveBeenCalled()
      expect(onDropCollection).toHaveBeenCalled()
    })

    it('does not render drop button when onDropCollection is not provided', () => {
      render(<CollectionItem collection={mockCollection} database="testdb" />)
      expect(
        screen.queryByTestId('drop-collection-users')
      ).not.toBeInTheDocument()
    })
  })

  describe('formatting', () => {
    it('formats large document counts with K suffix', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 15000,
        size: 1024,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText(/15\.0K.*docs/)).toBeInTheDocument()
    })

    it('formats very large document counts with M suffix', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 1500000,
        size: 1024,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText(/1\.5M.*docs/)).toBeInTheDocument()
    })

    it('formats small document counts without suffix', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 150,
        size: 1024,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText(/150.*docs/)).toBeInTheDocument()
    })

    it('formats zero size correctly', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 0,
        size: 0,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText('0 B')).toBeInTheDocument()
    })

    it('formats KB size correctly', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 10,
        size: 1024,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText('1 KB')).toBeInTheDocument()
    })

    it('formats MB size correctly', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 10,
        size: 1048576,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText('1 MB')).toBeInTheDocument()
    })

    it('formats GB size correctly', () => {
      const stats: CollectionStats = {
        name: 'users',
        count: 10,
        size: 1073741824,
      }
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          stats={stats}
        />
      )
      expect(screen.getByText('1 GB')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has treeitem role', () => {
      render(<CollectionItem collection={mockCollection} database="testdb" />)
      expect(screen.getByRole('treeitem')).toBeInTheDocument()
    })

    it('drop button has correct aria-label', () => {
      render(
        <CollectionItem
          collection={mockCollection}
          database="testdb"
          onDropCollection={() => {}}
        />
      )
      const dropButton = screen.getByLabelText('Drop collection users')
      expect(dropButton).toBeInTheDocument()
    })
  })
})
