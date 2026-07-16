'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  BoxIcon,
  HeadingIcon,
  TypeIcon,
  ImageIcon,
  MousePointerClickIcon,
  PlayIcon,
  MinusIcon,
  MoveVerticalIcon,
  ListIcon,
  CodeIcon,
  EyeOffIcon,
  ChevronRightIcon,
  UnfoldVerticalIcon,
  FoldVerticalIcon,
} from 'lucide-react'
import type { ParsedNode } from '@/lib/elementor/types'

const WIDGET_ICONS: Record<string, typeof BoxIcon> = {
  heading: HeadingIcon,
  'text-editor': TypeIcon,
  image: ImageIcon,
  button: MousePointerClickIcon,
  video: PlayIcon,
  divider: MinusIcon,
  spacer: MoveVerticalIcon,
  'icon-list': ListIcon,
  html: CodeIcon,
}

interface TreePanelProps {
  nodes: ParsedNode[]
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

function nodeIcon(node: ParsedNode) {
  if (node.mapping.kind === 'skip') return EyeOffIcon
  if (node.mapping.kind === 'container') return BoxIcon
  return WIDGET_ICONS[node.mapping.widgetType || 'html'] || CodeIcon
}

/** Count all descendants that would render as tree rows under a container. */
function descendantCount(node: ParsedNode): number {
  if (node.mapping.kind !== 'container') return 0
  let count = 0
  for (const child of node.children) {
    count += 1 + descendantCount(child)
  }
  return count
}

/** Collect ids of every container that has children (collapsible rows). */
function collectContainerIds(nodes: ParsedNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.mapping.kind === 'container' && node.children.length > 0) {
      out.push(node.id)
      collectContainerIds(node.children, out)
    }
  }
  return out
}

/** Find the ancestor id chain leading to a node id. */
function findAncestors(nodes: ParsedNode[], id: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === id) return trail
    if (node.children.length > 0) {
      const found = findAncestors(node.children, id, [...trail, node.id])
      if (found) return found
    }
  }
  return null
}

function TreeRow({
  node,
  depth,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  collapsed,
  onToggle,
}: {
  node: ParsedNode
  depth: number
  collapsed: Set<string>
  onToggle: (id: string) => void
} & Omit<TreePanelProps, 'nodes'>) {
  const Icon = nodeIcon(node)
  const isSelected = selectedId === node.id
  const isHovered = hoveredId === node.id
  const skipped = node.mapping.kind === 'skip'
  const isContainer = node.mapping.kind === 'container'
  const collapsible = isContainer && node.children.length > 0
  const isCollapsed = collapsible && collapsed.has(node.id)
  const hiddenCount = isCollapsed ? descendantCount(node) : 0

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'flex w-full items-center rounded-md transition-colors',
          isSelected ? 'bg-primary/15' : isHovered ? 'bg-accent' : 'hover:bg-accent',
          skipped && 'opacity-45',
        )}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.id)
            }}
            aria-label={isCollapsed ? `Expand <${node.tag}>` : `Collapse <${node.tag}>`}
            aria-expanded={!isCollapsed}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRightIcon className={cn('size-3.5 transition-transform', !isCollapsed && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          onMouseEnter={() => onHover(node.id)}
          onMouseLeave={() => onHover(null)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-xs"
          aria-pressed={isSelected}
        >
          <Icon className={cn('size-3.5 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
          <span className="shrink-0 font-mono text-muted-foreground">{'<'}{node.tag}{'>'}</span>
          <span className="truncate text-muted-foreground/70">
            {isContainer
              ? node.layoutHint || 'Container'
              : node.mapping.kind === 'skip'
                ? 'Skipped'
                : node.mapping.widgetType}
          </span>
          {isCollapsed ? (
            <span className="ml-auto shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              {hiddenCount}
            </span>
          ) : (
            node.mapping.auto &&
            node.mapping.kind !== 'skip' && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/50">auto</span>
            )
          )}
        </button>
      </div>
      {isContainer &&
        !isCollapsed &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        ))}
    </div>
  )
}

export function TreePanel({ nodes, selectedId, hoveredId, onSelect, onHover }: TreePanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const allContainerIds = useMemo(() => collectContainerIds(nodes), [nodes])

  const handleToggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => setCollapsed(new Set(allContainerIds)), [allContainerIds])
  const expandAll = useCallback(() => setCollapsed(new Set()), [])

  // when a node is selected from the preview, expand its collapsed ancestors so it's visible
  useEffect(() => {
    if (!selectedId) return
    const ancestors = findAncestors(nodes, selectedId)
    if (!ancestors || ancestors.length === 0) return
    setCollapsed((prev) => {
      const blocking = ancestors.filter((id) => prev.has(id))
      if (blocking.length === 0) return prev
      const next = new Set(prev)
      for (const id of blocking) next.delete(id)
      return next
    })
  }, [selectedId, nodes])

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Structure</h2>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={expandAll} aria-label="Expand all">
                  <UnfoldVerticalIcon />
                </Button>
              }
            />
            <TooltipContent>Expand all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={collapseAll} aria-label="Collapse all">
                  <FoldVerticalIcon />
                </Button>
              }
            />
            <TooltipContent>Collapse all</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-px p-2">
          {nodes.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={onSelect}
              onHover={onHover}
              collapsed={collapsed}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
