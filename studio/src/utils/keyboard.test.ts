import { describe, it, expect, vi } from 'vitest'
import { handleKeyboardClick, getClickableProps } from './keyboard'

describe('keyboard utilities', () => {
  describe('handleKeyboardClick', () => {
    it('should call callback when Enter is pressed', () => {
      const callback = vi.fn()
      const handler = handleKeyboardClick(callback)

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>

      handler(event)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should call callback when Space is pressed', () => {
      const callback = vi.fn()
      const handler = handleKeyboardClick(callback)

      const event = {
        key: ' ',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>

      handler(event)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should not call callback for other keys', () => {
      const callback = vi.fn()
      const handler = handleKeyboardClick(callback)

      const keys = ['a', 'Tab', 'Escape', 'ArrowDown', 'Shift']

      keys.forEach((key) => {
        const event = {
          key,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent<HTMLElement>

        handler(event)
      })

      expect(callback).not.toHaveBeenCalled()
    })

    it('should prevent default to avoid scrolling on Space', () => {
      const callback = vi.fn()
      const handler = handleKeyboardClick(callback)

      const event = {
        key: ' ',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>

      handler(event)

      expect(event.preventDefault).toHaveBeenCalled()
    })
  })

  describe('getClickableProps', () => {
    it('should return role="button"', () => {
      const onClick = vi.fn()
      const props = getClickableProps(onClick)

      expect(props.role).toBe('button')
    })

    it('should return tabIndex={0}', () => {
      const onClick = vi.fn()
      const props = getClickableProps(onClick)

      expect(props.tabIndex).toBe(0)
    })

    it('should return onKeyDown handler that triggers callback on Enter', () => {
      const onClick = vi.fn()
      const props = getClickableProps(onClick)

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>

      props.onKeyDown(event)

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('should return onKeyDown handler that triggers callback on Space', () => {
      const onClick = vi.fn()
      const props = getClickableProps(onClick)

      const event = {
        key: ' ',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>

      props.onKeyDown(event)

      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })
})
