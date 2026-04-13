/**
 * Dropdown Component
 *
 * Custom dropdown that replaces native <select> elements.
 * Renders the panel in a portal to avoid clipping by parent overflow (e.g. toolbar).
 * Supports light/dark mode and follows the app's design system.
 */

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption<T = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface DropdownProps<T = string> {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  title?: string
}

export function Dropdown<T extends string | number = string>({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  title,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const selectedOption = options.find(opt => opt.value === value)

  // Compute panel position when opening (portal needs fixed coords)
  useEffect(() => {
    if (!isOpen || !buttonRef.current) {
      setPanelRect(null)
      return
    }
    const rect = buttonRef.current.getBoundingClientRect()
    setPanelRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close dropdown on escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleSelect = (optionValue: T) => {
    if (options.find(opt => opt.value === optionValue)?.disabled) return
    onChange(optionValue)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault()
        setIsOpen(!isOpen)
        break
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          const currentIndex = options.findIndex(opt => opt.value === value)
          const nextIndex = Math.min(currentIndex + 1, options.length - 1)
          const nextOption = options[nextIndex]
          if (!nextOption.disabled) {
            onChange(nextOption.value)
          }
        }
        break
      case 'ArrowUp':
        event.preventDefault()
        if (isOpen) {
          const currentIndex = options.findIndex(opt => opt.value === value)
          const prevIndex = Math.max(currentIndex - 1, 0)
          const prevOption = options[prevIndex]
          if (!prevOption.disabled) {
            onChange(prevOption.value)
          }
        }
        break
    }
  }

  const panelContent =
    isOpen &&
    panelRect &&
    createPortal(
      <div
        ref={dropdownRef}
        className="
          fixed z-[99999]
          bg-surface-elevated border border-border rounded-button shadow-lg
          max-h-60 overflow-auto
        "
        style={{
          top: panelRect.top,
          left: panelRect.left,
          width: panelRect.width,
        }}
        role="listbox"
      >
        {options.map((option) => {
          const isSelected = option.value === value
          const isDisabled = option.disabled

          return (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={isDisabled}
              onClick={() => handleSelect(option.value)}
              className={`
                w-full px-2 py-1.5 text-xs text-left
                transition-colors
                first:rounded-t-button last:rounded-b-button
                ${
                  isSelected
                    ? 'bg-accent-light text-accent font-medium'
                    : 'text-content hover:bg-surface-inset'
                }
                ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }
              `}
            >
              {option.label}
            </button>
          )
        })}
      </div>,
      document.body
    )

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        title={title}
        className={`
          h-7 rounded-button border border-border bg-surface-elevated 
          px-2 pr-6 text-xs text-content 
          focus:outline-none focus:ring-1 focus:ring-accent 
          cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors hover:bg-surface-inset
          flex items-center justify-between w-full text-left
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={title || 'Select option'}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder || 'Select...'}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-content-secondary transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="currentColor"
        >
          <path d="M4 6l4 4 4-4z" />
        </svg>
      </button>

      {panelContent}
    </div>
  )
}
