'use client'

import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  MousePointerClickIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  WrapTextIcon,
  MoveHorizontalIcon,
  RotateCcwIcon,
} from 'lucide-react'
import type { FlexOverrides, MappingKind, ParsedNode } from '@/lib/elementor/types'
import { WIDGETS } from '@/lib/elementor/widgets'
import { effectiveStyle } from '@/lib/elementor/styles'

interface InspectorPanelProps {
  node: ParsedNode | null
  onMappingChange: (id: string, kind: MappingKind, widgetType: string | null) => void
  onFlexChange: (id: string, patch: Partial<FlexOverrides> | null) => void
}

const CONTAINER_VALUE = '__container__'
const SKIP_VALUE = '__skip__'

const MAPPING_ITEMS: { value: string; label: string }[] = [
  { value: CONTAINER_VALUE, label: 'Container (layout)' },
  ...WIDGETS.map((w) => ({ value: w.type, label: w.label })),
  { value: SKIP_VALUE, label: 'Skip (exclude from export)' },
]

export function InspectorPanel({ node, onMappingChange, onFlexChange }: InspectorPanelProps) {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-card lg:flex">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inspector</h2>
      </div>
      <InspectorContent node={node} onMappingChange={onMappingChange} onFlexChange={onFlexChange} />
    </aside>
  )
}

export function InspectorContent({ node, onMappingChange, onFlexChange }: InspectorPanelProps) {
  const selectValue = node
    ? node.mapping.kind === 'container'
      ? CONTAINER_VALUE
      : node.mapping.kind === 'skip'
        ? SKIP_VALUE
        : node.mapping.widgetType || 'html'
    : ''

  const styles = useMemo(() => (node ? effectiveStyle(node.matchedStyle, node.inlineStyle) : {}), [node])
  const styleEntries = Object.entries(styles)

  return (
    <>
      {!node ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <MousePointerClickIcon className="size-5 text-muted-foreground" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select an element in the preview or structure tree to assign it to an Elementor widget.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-3">
            {/* Element identity */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {'<'}{node.tag}{'>'}
                </Badge>
                {node.mapping.auto && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    auto-detected
                  </Badge>
                )}
                {node.layoutHint && (
                  <Badge variant="outline" className="text-[10px] text-primary">
                    {node.layoutHint}
                  </Badge>
                )}
              </div>
              {node.classes.length > 0 && (
                <p className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                  .{node.classes.join(' .')}
                </p>
              )}
            </div>

            <Separator />

            {/* Mapping */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Map to
              </label>
              <Select
                value={selectValue}
                items={MAPPING_ITEMS}
                onValueChange={(value) => {
                  if (value === CONTAINER_VALUE) onMappingChange(node.id, 'container', null)
                  else if (value === SKIP_VALUE) onMappingChange(node.id, 'skip', null)
                  else if (typeof value === 'string') onMappingChange(node.id, 'widget', value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MAPPING_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {selectValue === CONTAINER_VALUE
                  ? 'Children stay selectable and export as nested elements.'
                  : selectValue === SKIP_VALUE
                    ? 'This element and its children are excluded from the export.'
                    : WIDGETS.find((w) => w.type === selectValue)?.description || ''}
              </p>
            </div>

            {/* Flex layout controls (containers only) */}
            {node.mapping.kind === 'container' && (
              <>
                <Separator />
                <FlexControls node={node} styles={styles} onFlexChange={onFlexChange} />
              </>
            )}

            {/* Content preview */}
            {node.text && (
              <>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Content</h3>
                  <p className="line-clamp-4 rounded-md bg-muted p-2 text-[11px] leading-relaxed text-foreground/80">
                    {node.text}
                  </p>
                </div>
              </>
            )}

            {/* Detected styles */}
            {styleEntries.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Detected styles
                  </h3>
                  <div className="flex flex-col gap-1 rounded-md bg-muted p-2">
                    {styleEntries.map(([prop, value]) => (
                      <div key={prop} className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
                        <span className="text-muted-foreground">{prop}</span>
                        <span className="truncate text-foreground/80">{value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Translated into widget settings on export where supported.
                  </p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </>
  )
}

const JUSTIFY_OPTIONS: { value: NonNullable<FlexOverrides['justify']>; label: string }[] = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
  { value: 'space-evenly', label: 'Space evenly' },
]

const ALIGN_OPTIONS: { value: NonNullable<FlexOverrides['align']>; label: string }[] = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
]

function FlexControls({
  node,
  styles,
  onFlexChange,
}: {
  node: ParsedNode
  styles: Record<string, string>
  onFlexChange: (id: string, patch: Partial<FlexOverrides> | null) => void
}) {
  const ov = node.flexOverrides || {}

  // detected fallbacks: overrides win, then inline/matched CSS, then the layout hint
  const detectedDirection: 'row' | 'column' =
    (styles['flex-direction']?.startsWith('column') ? 'column' : undefined) ??
    (node.layoutHint?.includes('column') ? 'column' : 'row')
  const detectedWrap: 'wrap' | 'nowrap' =
    styles['flex-wrap'] === 'wrap' || node.layoutHint?.includes('wrap') ? 'wrap' : 'nowrap'

  const direction = ov.direction ?? detectedDirection
  const wrap = ov.wrap ?? detectedWrap
  const justify = ov.justify ?? (styles['justify-content'] as FlexOverrides['justify']) ?? undefined
  const align = ov.align ?? (styles['align-items'] as FlexOverrides['align']) ?? undefined
  const hasOverrides = Object.values(ov).some((v) => v !== undefined)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Flex layout</h3>
        {hasOverrides && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => onFlexChange(node.id, null)}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Reset
          </Button>
        )}
      </div>

      {/* Direction */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">Direction</span>
        <ToggleGroup
          value={[direction]}
          onValueChange={(value: string[]) => {
            const v = value[0]
            if (v === 'row' || v === 'column') onFlexChange(node.id, { direction: v })
          }}
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
        >
          <ToggleGroupItem value="row" className="flex-1" aria-label="Row direction">
            <ArrowRightIcon />
            Row
          </ToggleGroupItem>
          <ToggleGroupItem value="column" className="flex-1" aria-label="Column direction">
            <ArrowDownIcon />
            Column
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Wrap */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">Wrap</span>
        <ToggleGroup
          value={[wrap]}
          onValueChange={(value: string[]) => {
            const v = value[0]
            if (v === 'wrap' || v === 'nowrap') onFlexChange(node.id, { wrap: v })
          }}
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
        >
          <ToggleGroupItem value="nowrap" className="flex-1" aria-label="No wrap">
            <MoveHorizontalIcon />
            No wrap
          </ToggleGroupItem>
          <ToggleGroupItem value="wrap" className="flex-1" aria-label="Wrap">
            <WrapTextIcon />
            Wrap
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Justify */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">Justify content</span>
        <Select
          value={justify ?? ''}
          onValueChange={(value) => {
            if (typeof value === 'string' && value) {
              onFlexChange(node.id, { justify: value as FlexOverrides['justify'] })
            }
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Detected / default" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {JUSTIFY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Align */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">Align items</span>
        <Select
          value={align ?? ''}
          onValueChange={(value) => {
            if (typeof value === 'string' && value) {
              onFlexChange(node.id, { align: value as FlexOverrides['align'] })
            }
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Detected / default" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ALIGN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Gap */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="flex-gap" className="text-[11px] text-muted-foreground">
          Gap (px)
        </label>
        <Input
          id="flex-gap"
          type="number"
          min={0}
          className="h-8"
          placeholder="Detected / default"
          value={ov.gap ?? ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onFlexChange(node.id, { gap: undefined })
              return
            }
            const n = Number.parseInt(raw, 10)
            if (!Number.isNaN(n) && n >= 0) onFlexChange(node.id, { gap: n })
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Changes preview live and override detected styles in the exported JSON.
      </p>
    </div>
  )
}
