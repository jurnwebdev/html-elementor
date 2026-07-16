import type { NodeMapping, ParsedNode, ParseResult, StyleMap } from './types'
import { INLINE_TAGS, IGNORED_TAGS } from './widgets'
import { parseCss, parseDeclarations, resolveMatchedStyles, type CssRule } from './styles'

let idCounter = 0

export function generateElementId(): string {
  idCounter++
  return (Math.floor(Math.random() * 0xfffff).toString(16) + idCounter.toString(16)).padStart(7, '0').slice(0, 7)
}

/** Decide whether an element is a leaf (only inline/text content inside). */
function isLeafElement(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase()
    if (IGNORED_TAGS.has(tag)) continue
    if (!INLINE_TAGS.has(tag)) return false
  }
  return true
}

/**
 * Detect a leaf element whose inner markup is too complex for a clean
 * text-editor conversion — these are better exported as an HTML widget.
 */
function leafIsComplex(el: Element): boolean {
  // embedded interactive/vector content can't survive a text-editor round trip
  if (el.querySelector('svg, input, select, textarea, iframe, canvas, video, audio')) return true
  // several class-styled inline children (badges, styled spans, icons) => layout-dependent markup
  const styledInlineChildren = el.querySelectorAll(':scope > [class], :scope > * > [class]').length
  if (styledInlineChildren >= 2) return true
  // markup-heavy relative to its visible text (decorative wrappers, pseudo-layout spans)
  const text = (el.textContent || '').trim()
  if (text.length > 0 && el.innerHTML.length > text.length * 4 && el.children.length > 0) return true
  return false
}

/** Detect the layout system of a container from classes + inline styles. */
export function detectLayoutHint(el: Element): string | undefined {
  const cls = el.getAttribute('class') || ''
  const style = el.getAttribute('style') || ''

  const isGrid = /(?:^|[\s:"])grid(?:$|[\s"])/.test(cls) || /display:\s*(?:inline-)?grid/.test(style)
  if (isGrid) {
    const cols = cls.match(/(?:^|[\s:])grid-cols-(\d+)/)
    const styleCols = style.match(/grid-template-columns:\s*repeat\((\d+)/)
    const n = cols?.[1] || styleCols?.[1]
    return n ? `Grid · ${n} columns` : 'Grid'
  }

  const isFlex = /(?:^|[\s:])(?:inline-)?flex(?:$|[\s])/.test(cls) || /display:\s*(?:inline-)?flex/.test(style)
  if (isFlex) {
    const isCol = /(?:^|[\s:])flex-col(?:$|[\s])/.test(cls) || /flex-direction:\s*column/.test(style)
    const wraps = /(?:^|[\s:])flex-wrap(?:$|[\s])/.test(cls) || /flex-wrap:\s*wrap/.test(style)
    return `Flex · ${isCol ? 'column' : 'row'}${wraps ? ' · wrap' : ''}`
  }

  return undefined
}

/** Auto-detect the best Elementor mapping for an element. */
export function autoDetect(el: Element, leaf: boolean, merged: StyleMap = {}): NodeMapping {
  const tag = el.tagName.toLowerCase()
  const cls = (el.getAttribute('class') || '').toLowerCase()

  const widget = (widgetType: string): NodeMapping => ({ kind: 'widget', widgetType, auto: true })

  // Elements with position: absolute or fixed will break the flex layout
  // if treated as normal flex children — export them as HTML widgets so
  // they keep their original overlay/positioned behavior inside a wrapper.
  if (merged['position'] === 'absolute' || merged['position'] === 'fixed') {
    return widget('html')
  }

  if (/^h[1-6]$/.test(tag)) return widget('heading')
  if (tag === 'img' || tag === 'picture' || tag === 'figure') return widget('image')
  if (tag === 'button') return widget('button')
  if (tag === 'a') {
    if (el.querySelector('img') && el.textContent?.trim() === '') return widget('image')
    if (/\b(btn|button|cta)\b/.test(cls)) return widget('button')
    return widget('button')
  }
  if (tag === 'hr') return widget('divider')
  if (tag === 'ul') return widget('icon-list')
  if (tag === 'ol') return widget('text-editor')
  if (tag === 'iframe') {
    const src = el.getAttribute('src') || ''
    if (/youtube|youtu\.be|vimeo/.test(src)) return widget('video')
    return widget('html')
  }
  if (tag === 'video') return widget('video')
  if (tag === 'svg' || tag === 'canvas' || tag === 'table' || tag === 'form' || tag === 'input' || tag === 'select' || tag === 'textarea') {
    return widget('html')
  }
  if (tag === 'p' || tag === 'blockquote' || tag === 'pre') return widget('text-editor')

  // structural containers
  if (!leaf) return { kind: 'container', widgetType: null, auto: true }

  // leaf with complex inner markup that a text-editor would mangle -> html widget
  if (leafIsComplex(el)) return widget('html')

  // leaf div/span/etc with only text -> text editor
  if (el.textContent?.trim()) return widget('text-editor')

  // empty leaf that still renders something visual (bg image, decorative block) -> html widget
  const inlineStyle = (el.getAttribute('style') || '').toLowerCase()
  if (/bg-\[|bg-cover|bg-center|background/.test(cls + inlineStyle)) return widget('html')

  return { kind: 'skip', widgetType: null, auto: true }
}

function buildNode(el: Element, rules: CssRule[]): ParsedNode | null {
  const tag = el.tagName.toLowerCase()
  if (IGNORED_TAGS.has(tag)) return null

  const attrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    attrs[attr.name] = attr.value
  }

  const leaf = isLeafElement(el)
  const inlineStyle = parseDeclarations(attrs.style || '')
  const matchedStyle = resolveMatchedStyles(el, rules)

  const id = generateElementId()
  const merged = { ...matchedStyle, ...inlineStyle }

  // layout hint: prefer utility classes / inline style, fall back to matched <style> CSS
  let layoutHint = detectLayoutHint(el)
  if (!layoutHint) {
    const display = merged.display || ''
    if (display.includes('grid')) {
      const cols = (merged['grid-template-columns'] || '').match(/repeat\((\d+)/)
      layoutHint = cols ? `Grid · ${cols[1]} columns` : 'Grid'
    } else if (display.includes('flex')) {
      const isCol = (merged['flex-direction'] || '').startsWith('column')
      const wraps = merged['flex-wrap'] === 'wrap'
      layoutHint = `Flex · ${isCol ? 'column' : 'row'}${wraps ? ' · wrap' : ''}`
    }
  }

  const node: ParsedNode = {
    id,
    tag,
    attrs,
    classes: (attrs.class || '').split(/\s+/).filter(Boolean),
    inlineStyle,
    matchedStyle,
    text: (el.textContent || '').trim(),
    innerHtml: el.innerHTML.trim(),
    outerHtml: el.outerHTML.trim(),
    isLeaf: leaf,
    layoutHint,
    children: [],
    mapping: autoDetect(el, leaf, merged),
  }

  // mark the live DOM element AFTER snapshotting inner/outer HTML,
  // so exported HTML never contains data-nid markers
  el.setAttribute('data-nid', id)

  if (!leaf) {
    for (const child of Array.from(el.children)) {
      const childTag = child.tagName.toLowerCase()
      if (IGNORED_TAGS.has(childTag)) continue
      // inline elements between structural siblings still become nodes
      const childNode = buildNode(child, rules)
      if (childNode) node.children.push(childNode)
    }
  }

  return node
}

/** Parse raw HTML into a selectable node tree + collected CSS. Client-side only. */
export function parseHtml(html: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // collect css from <style> blocks
  let css = ''
  doc.querySelectorAll('style').forEach((styleEl) => {
    css += `\n${styleEl.textContent || ''}`
  })
  const rules = parseCss(css)

  const nodes: ParsedNode[] = []
  for (const child of Array.from(doc.body.children)) {
    const node = buildNode(child, rules)
    if (node) nodes.push(node)
  }

  // serialize the FULL document (head scripts, font links, styles, CDN Tailwind, ...)
  // with data-nid markers now applied, so the iframe preview renders exactly like the source
  const previewHtml = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`

  return { nodes, css: css.trim(), previewHtml }
}

/* ---- tree helpers ---- */

export function findNode(nodes: ParsedNode[], id: string): ParsedNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

export function updateNode(nodes: ParsedNode[], id: string, updater: (node: ParsedNode) => ParsedNode): ParsedNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node)
    if (node.children.length === 0) return node
    const children = updateNode(node.children, id, updater)
    if (children === node.children) return node
    return { ...node, children }
  })
}

export interface TreeStats {
  widgets: number
  containers: number
  skipped: number
}

export function countStats(nodes: ParsedNode[]): TreeStats {
  const stats: TreeStats = { widgets: 0, containers: 0, skipped: 0 }
  const walk = (list: ParsedNode[]) => {
    for (const node of list) {
      if (node.mapping.kind === 'widget') stats.widgets++
      else if (node.mapping.kind === 'container') stats.containers++
      else stats.skipped++
      if (node.mapping.kind !== 'skip' && node.mapping.kind !== 'widget') walk(node.children)
      else if (node.mapping.kind === 'container') walk(node.children)
    }
  }
  walk(nodes)
  return stats
}
