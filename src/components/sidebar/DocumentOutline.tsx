import React, { useState, useMemo, useCallback } from 'react'
import type { OutlineItem } from '../../constants'

interface DocumentOutlineProps {
  outline: OutlineItem[]
  onJumpToLine: (line: number) => void
}

interface OutlineNode {
  item: OutlineItem
  children: OutlineNode[]
}

function buildTree(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const item of items) {
    const node: OutlineNode = { item, children: [] }

    while (stack.length > 0 && stack[stack.length - 1].item.level >= item.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }

    stack.push(node)
  }

  return roots
}

const LEVEL_LABELS: Record<number, string> = {
  0: 'part',
  1: 'chap',
  2: '§',
  3: '§§',
  4: '§§§',
  5: '¶',
  6: '¶¶',
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
    >
      <path d="M6 3l5 5-5 5z" />
    </svg>
  )
}

function OutlineTreeNode({
  node,
  onJumpToLine,
  depth,
  isLastChild,
  collapsedSet,
  toggleCollapsed,
}: {
  node: OutlineNode
  onJumpToLine: (line: number) => void
  depth: number
  isLastChild: boolean
  collapsedSet: Set<number>
  toggleCollapsed: (line: number) => void
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsedSet.has(node.item.lineNumber)

  return (
    <div className="relative">
      {/* Vertical tree line from parent */}
      {depth > 0 && (
        <div
          className="absolute left-0 top-0 w-px bg-border"
          style={{
            marginLeft: depth * 16 + 3,
            height: isLastChild ? 14 : '100%',
          }}
        />
      )}

      {/* Horizontal branch line */}
      {depth > 0 && (
        <div
          className="absolute top-[14px] h-px bg-border"
          style={{
            left: depth * 16 + 3,
            width: 8,
          }}
        />
      )}

      {/* The node button */}
      <button
        className="group flex items-center gap-1 w-full text-left py-[5px] pr-3 text-[13px] leading-tight font-normal text-content hover:bg-black/[0.04] transition-colors"
        style={{ paddingLeft: depth * 16 + (depth > 0 ? 14 : 4) }}
        onClick={() => onJumpToLine(node.item.lineNumber)}
        title={`${node.item.title} — line ${node.item.lineNumber}`}
      >
        {hasChildren ? (
          <span
            className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded hover:bg-black/[0.06] text-content-tertiary hover:text-content transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed(node.item.lineNumber)
            }}
          >
            <ChevronIcon open={!isCollapsed} />
          </span>
        ) : (
          <span className="shrink-0 w-4 h-4 inline-flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-content-tertiary/40" />
          </span>
        )}

        <span className="truncate flex-1 text-left">
          {node.item.title}
        </span>

        <span className="text-[9px] text-content-tertiary opacity-0 group-hover:opacity-100 transition-opacity tabular-nums shrink-0 ml-1">
          {LEVEL_LABELS[node.item.level] ?? '§'}
        </span>
      </button>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="relative">
          {node.children.map((child, i) => (
            <OutlineTreeNode
              key={`${child.item.lineNumber}-${i}`}
              node={child}
              onJumpToLine={onJumpToLine}
              depth={depth + 1}
              isLastChild={i === node.children.length - 1}
              collapsedSet={collapsedSet}
              toggleCollapsed={toggleCollapsed}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DocumentOutline({ outline, onJumpToLine }: DocumentOutlineProps) {
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set())

  const tree = useMemo(() => buildTree(outline), [outline])

  const toggleCollapsed = useCallback((lineNumber: number) => {
    setCollapsedSet(prev => {
      const next = new Set(prev)
      if (next.has(lineNumber)) {
        next.delete(lineNumber)
      } else {
        next.add(lineNumber)
      }
      return next
    })
  }, [])

  if (outline.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-[12px] text-content-tertiary leading-relaxed">
          No headings found. Use <code className="text-[10px] px-1 py-0.5 bg-black/[0.04] rounded font-mono">\section&#123;&#125;</code> to add structure.
        </p>
      </div>
    )
  }

  return (
    <div className="py-0.5 font-sans">
      {tree.map((node, i) => (
        <OutlineTreeNode
          key={`${node.item.lineNumber}-${i}`}
          node={node}
          onJumpToLine={onJumpToLine}
          depth={0}
          isLastChild={i === tree.length - 1}
          collapsedSet={collapsedSet}
          toggleCollapsed={toggleCollapsed}
        />
      ))}
    </div>
  )
}
