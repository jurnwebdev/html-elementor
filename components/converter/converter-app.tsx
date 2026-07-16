'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FilePlus2Icon, BracesIcon, LayoutTemplateIcon, SlidersHorizontalIcon } from 'lucide-react'
import type { ParsedNode, MappingKind, StyleMap, FlexOverrides } from '@/lib/elementor/types'
import { parseHtml, updateNode, findNode, countStats } from '@/lib/elementor/parser'
import { HtmlInput } from './html-input'
import { TreePanel } from './tree-panel'
import { PreviewPanel } from './preview-panel'
import { InspectorPanel, InspectorContent } from './inspector-panel'
import { ExportDialog } from './export-dialog'

export function ConverterApp() {
  const [nodes, setNodes] = useState<ParsedNode[] | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [computedStyles, setComputedStyles] = useState<Record<string, StyleMap>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false)

  const handleParse = useCallback((html: string) => {
    const result = parseHtml(html)
    setNodes(result.nodes)
    setPreviewHtml(result.previewHtml)
    setComputedStyles({})
    setSelectedId(null)
    setHoveredId(null)
  }, [])

  const handleReset = useCallback(() => {
    setNodes(null)
    setPreviewHtml('')
    setComputedStyles({})
    setSelectedId(null)
    setHoveredId(null)
  }, [])

  const handleMappingChange = useCallback(
    (id: string, kind: MappingKind, widgetType: string | null) => {
      setNodes((prev) =>
        prev ? updateNode(prev, id, (node) => ({ ...node, mapping: { kind, widgetType, auto: false } })) : prev,
      )
    },
    [],
  )

  const handleFlexChange = useCallback((id: string, patch: Partial<FlexOverrides> | null) => {
    setNodes((prev) =>
      prev
        ? updateNode(prev, id, (node) => ({
            ...node,
            flexOverrides: patch === null ? undefined : { ...node.flexOverrides, ...patch },
          }))
        : prev,
    )
  }, [])

  const selectedNode = useMemo(() => (nodes && selectedId ? findNode(nodes, selectedId) : null), [nodes, selectedId])
  const stats = useMemo(() => (nodes ? countStats(nodes) : null), [nodes])

  if (!nodes) {
    return <HtmlInput onParse={handleParse} />
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary">
            <LayoutTemplateIcon className="size-3.5 text-primary-foreground" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">HTML to Elementor</h1>
          {stats && (
            <div className="ml-2 hidden items-center gap-1.5 md:flex">
              <Badge variant="secondary" className="font-mono text-[11px]">
                {stats.widgets} widgets
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {stats.containers} containers
              </Badge>
              {stats.skipped > 0 && (
                <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                  {stats.skipped} skipped
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <FilePlus2Icon data-icon="inline-start" />
            New import
          </Button>
          <Button size="sm" onClick={() => setExportOpen(true)}>
            <BracesIcon data-icon="inline-start" />
            Export JSON
          </Button>
        </div>
      </header>

      {/* Editor panels */}
      <div className="flex min-h-0 flex-1">
        <TreePanel
          nodes={nodes}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />
        <PreviewPanel
          nodes={nodes}
          previewHtml={previewHtml}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
          onComputedStyles={setComputedStyles}
        />
        <InspectorPanel node={selectedNode} onMappingChange={handleMappingChange} onFlexChange={handleFlexChange} />
      </div>

      {/* Floating inspector trigger for screens below lg */}
      {selectedNode && (
        <Button
          size="sm"
          className="fixed bottom-4 right-4 z-40 shadow-lg lg:hidden"
          onClick={() => setInspectorSheetOpen(true)}
        >
          <SlidersHorizontalIcon data-icon="inline-start" />
          {'Map <'}{selectedNode.tag}{'>'}
        </Button>
      )}

      <Sheet open={inspectorSheetOpen} onOpenChange={setInspectorSheetOpen}>
        <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0">
          <SheetHeader className="shrink-0 border-b border-border px-3 py-2.5">
            <SheetTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Inspector
            </SheetTitle>
          </SheetHeader>
          <InspectorContent node={selectedNode} onMappingChange={handleMappingChange} onFlexChange={handleFlexChange} />
        </SheetContent>
      </Sheet>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} nodes={nodes} computedStyles={computedStyles} />
    </div>
  )
}
