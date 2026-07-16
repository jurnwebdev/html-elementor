export type MappingKind = 'container' | 'widget' | 'skip'

export type StyleMap = Record<string, string>

export interface NodeMapping {
  kind: MappingKind
  /** Elementor widgetType when kind === 'widget' */
  widgetType: string | null
  /** true when this mapping was auto-detected (not manually overridden) */
  auto: boolean
}

/** Manual flex layout overrides for containers, applied on top of detected styles at export. */
export interface FlexOverrides {
  direction?: 'row' | 'column'
  wrap?: 'wrap' | 'nowrap'
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly'
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch'
  /** gap in px, applied to both row and column */
  gap?: number
}

export interface ParsedNode {
  id: string
  tag: string
  attrs: Record<string, string>
  classes: string[]
  /** styles from the element's style="" attribute */
  inlineStyle: StyleMap
  /** styles matched from <style> blocks in the source HTML */
  matchedStyle: StyleMap
  /** plain text content */
  text: string
  /** inner HTML (used for leaf nodes rendered as rich text) */
  innerHtml: string
  /** full outer HTML (used for the HTML widget fallback) */
  outerHtml: string
  /** leaf = no structural element children (only inline content) */
  isLeaf: boolean
  /** detected layout for containers, e.g. "Flex · row" or "Grid · 3 columns" */
  layoutHint?: string
  /** manual flex layout overrides (win over detected styles at export) */
  flexOverrides?: FlexOverrides
  children: ParsedNode[]
  mapping: NodeMapping
}

export interface ParseResult {
  /** top-level nodes of the document */
  nodes: ParsedNode[]
  /** raw CSS collected from <style> blocks (for preview rendering) */
  css: string
  /** full original document serialized with data-nid markers, for iframe preview */
  previewHtml: string
}

/* Elementor JSON output shapes */

export interface ElementorElement {
  id: string
  elType: 'container' | 'widget'
  settings: Record<string, unknown>
  elements: ElementorElement[]
  isInner?: boolean
  widgetType?: string
}

export interface ElementorTemplate {
  content: ElementorElement[]
  page_settings: unknown[]
  version: string
  title: string
  type: string
}
