import { useState, useCallback } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import TextInput from '@leafygreen-ui/text-input'
import Icon from '@leafygreen-ui/icon'

const queryBarStyles = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: ${palette.gray.light3};
  border-radius: 8px;
`

const mainRowStyles = css`
  display: flex;
  gap: 12px;
  align-items: flex-end;
`

const filterInputStyles = css`
  flex: 1;
`

const optionsRowStyles = css`
  display: flex;
  gap: 12px;
  align-items: flex-end;
`

const smallInputStyles = css`
  width: 120px;
`

const toggleStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${palette.gray.dark1};
  cursor: pointer;
  font-size: 13px;

  &:hover {
    color: ${palette.gray.dark3};
  }
`

const errorStyles = css`
  color: ${palette.red.dark2};
  font-size: 12px;
  margin-top: 4px;
`

interface QueryBarProps {
  onSubmit: (query: {
    filter?: Record<string, unknown>
    sort?: Record<string, 1 | -1>
    limit?: number
    skip?: number
  }) => void
}

export function QueryBar({ onSubmit }: QueryBarProps) {
  const [filterText, setFilterText] = useState('{}')
  const [sortText, setSortText] = useState('{}')
  const [limit, setLimit] = useState('20')
  const [skip, setSkip] = useState('0')
  const [showOptions, setShowOptions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(() => {
    try {
      const filter = JSON.parse(filterText)
      const sort = JSON.parse(sortText)
      const limitNum = parseInt(limit, 10)
      const skipNum = parseInt(skip, 10)

      if (isNaN(limitNum) || limitNum < 0) {
        throw new Error('Limit must be a positive number')
      }
      if (isNaN(skipNum) || skipNum < 0) {
        throw new Error('Skip must be a positive number')
      }

      setError(null)
      onSubmit({
        filter,
        sort,
        limit: limitNum,
        skip: skipNum,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid query')
    }
  }, [filterText, sortText, limit, skip, onSubmit])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  return (
    <div className={queryBarStyles} onKeyDown={handleKeyDown}>
      <div className={mainRowStyles}>
        <div className={filterInputStyles}>
          <TextInput
            label="Filter"
            placeholder='{ "field": "value" }'
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            aria-describedby="filter-error"
          />
        </div>
        <Button variant="primary" onClick={handleSubmit}>
          <Icon glyph="MagnifyingGlass" />
          Find
        </Button>
      </div>

      <div
        className={toggleStyles}
        onClick={() => setShowOptions(!showOptions)}
      >
        <Icon glyph={showOptions ? 'ChevronDown' : 'ChevronRight'} size={12} />
        <Body>Options</Body>
      </div>

      {showOptions && (
        <div className={optionsRowStyles}>
          <div className={filterInputStyles}>
            <TextInput
              label="Sort"
              placeholder='{ "field": 1 }'
              value={sortText}
              onChange={(e) => setSortText(e.target.value)}
            />
          </div>
          <div className={smallInputStyles}>
            <TextInput
              label="Limit"
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className={smallInputStyles}>
            <TextInput
              label="Skip"
              type="number"
              value={skip}
              onChange={(e) => setSkip(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <div id="filter-error" className={errorStyles}>
          {error}
        </div>
      )}
    </div>
  )
}
