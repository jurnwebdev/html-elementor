'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react'
import type { ParsedNode, StyleMap } from '@/lib/elementor/types'
import { exportTemplate } from '@/lib/elementor/export'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodes: ParsedNode[]
  computedStyles: Record<string, StyleMap>
}

export function ExportDialog({ open, onOpenChange, nodes, computedStyles }: ExportDialogProps) {
  const [title, setTitle] = useState('Converted Template')
  const [copied, setCopied] = useState(false)
  const [freshStyles, setFreshStyles] = useState(0)

  // Trigger a fresh style capture from the preview iframe when the dialog
  // first opens, so the export uses the latest computed (desktop) values.
  useEffect(() => {
    if (!open) return
    const iframe = document.querySelector('iframe')
    if (iframe) {
      iframe.contentWindow?.postMessage({ __v0: true, type: 'capture-styles' }, '*')
      // Request styles again after a brief delay to ensure the iframe
      // has time to process and return them.
      const t = setTimeout(() => {
        iframe.contentWindow?.postMessage({ __v0: true, type: 'capture-styles' }, '*')
        setFreshStyles((n) => n + 1)
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  const json = useMemo(() => {
    if (!open) return ''
    return JSON.stringify(exportTemplate(nodes, title, computedStyles), null, 2)
  }, [open, nodes, title, computedStyles, freshStyles])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.trim().toLowerCase().replace(/\s+/g, '-') || 'template'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Elementor template</DialogTitle>
          <DialogDescription>
            Import via Elementor: Templates &gt; Saved Templates &gt; Import Templates, or drag the file into the
            Elementor library.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-title">Template title</Label>
            <Input id="template-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <Label>Generated JSON</Label>
            <pre className="min-h-40 flex-1 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground/85">
              {json}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
          <Button onClick={handleDownload}>
            <DownloadIcon data-icon="inline-start" />
            Download .json
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
