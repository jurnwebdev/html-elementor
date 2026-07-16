'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { LayoutTemplateIcon, SparklesIcon, ArrowRightIcon } from 'lucide-react'
import { SAMPLE_HTML } from '@/lib/elementor/sample'

interface HtmlInputProps {
  onParse: (html: string) => void
}

const STEPS = [
  { num: '01', title: 'Paste HTML', text: 'Drop in any HTML markup, including style blocks.' },
  { num: '02', title: 'Map elements', text: 'Auto-detected widgets, overridable per element.' },
  { num: '03', title: 'Export JSON', text: 'Import the template file straight into Elementor.' },
]

export function HtmlInput({ onParse }: HtmlInputProps) {
  const [html, setHtml] = useState('')

  const handleSubmit = () => {
    if (html.trim()) onParse(html)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <LayoutTemplateIcon className="size-4.5 text-primary-foreground" />
            </div>
            <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Flexbox containers
            </Badge>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            HTML to Elementor Converter
          </h1>
          <p className="max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
            Paste your HTML below. Every element becomes selectable in a visual editor where you assign it to an
            Elementor widget, then export a ready-to-import template JSON.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <label htmlFor="html-source" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            HTML source
          </label>
          <Textarea
            id="html-source"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={'<section class="hero">\n  <h1>Your headline</h1>\n  ...\n</section>'}
            className="min-h-64 resize-y font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setHtml(SAMPLE_HTML)}>
              <SparklesIcon data-icon="inline-start" />
              Load sample
            </Button>
            <Button onClick={handleSubmit} disabled={!html.trim()}>
              Parse &amp; open editor
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.num} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card/50 p-4">
              <span className="font-mono text-[11px] text-primary">{step.num}</span>
              <h2 className="text-sm font-medium">{step.title}</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
