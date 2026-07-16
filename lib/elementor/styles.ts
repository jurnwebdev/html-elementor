import type { StyleMap } from './types'

export interface CssRule {
  selector: string
  declarations: StyleMap
  specificity: number
}

/** Parse a style declaration block ("color: red; font-size: 16px") into a map. */
export function parseDeclarations(block: string): StyleMap {
  const out: StyleMap = {}
  for (const part of block.split(';')) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const value = part
      .slice(idx + 1)
      .trim()
      .replace(/!important$/i, '')
      .trim()
    if (prop && value) out[prop] = value
  }
  return out
}

function specificityOf(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) || []).length
  const classes = (selector.match(/\.[\w-]+/g) || []).length + (selector.match(/\[[^\]]+\]/g) || []).length
  const tags = (selector.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length
  return ids * 100 + classes * 10 + tags
}

/**
 * Naive CSS parser: extracts simple rules, skipping at-rules
 * (@media, @keyframes, @font-face...). Good enough for basic style
 * translation into Elementor settings.
 */
export function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = []
  // strip comments
  let src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // remove at-rule blocks (naive brace matching)
  src = stripAtRules(src)

  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = ruleRe.exec(src)) !== null) {
    const selectors = m[1].split(',')
    const declarations = parseDeclarations(m[2])
    if (Object.keys(declarations).length === 0) continue
    for (const raw of selectors) {
      const selector = raw.trim()
      if (!selector || selector.startsWith('@')) continue
      rules.push({ selector, declarations, specificity: specificityOf(selector) })
    }
  }
  // stable sort by specificity ascending so later merges override correctly
  return rules.sort((a, b) => a.specificity - b.specificity)
}

function stripAtRules(css: string): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    if (css[i] === '@') {
      // skip until matching closing brace (or semicolon for simple at-rules)
      let j = i
      while (j < css.length && css[j] !== '{' && css[j] !== ';') j++
      if (j >= css.length) break
      if (css[j] === ';') {
        i = j + 1
        continue
      }
      let depth = 1
      j++
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
        j++
      }
      i = j
    } else {
      out += css[i]
      i++
    }
  }
  return out
}

/** Resolve which rule declarations apply to a live DOM element. */
export function resolveMatchedStyles(el: Element, rules: CssRule[]): StyleMap {
  const merged: StyleMap = {}
  for (const rule of rules) {
    let matches = false
    try {
      matches = el.matches(rule.selector)
    } catch {
      // invalid/unsupported selector - skip
    }
    if (matches) Object.assign(merged, rule.declarations)
  }
  return merged
}

/** Merge matched stylesheet styles with inline styles (inline wins). */
export function effectiveStyle(matched: StyleMap, inline: StyleMap): StyleMap {
  return { ...matched, ...inline }
}

/** Parse a numeric px-ish value ("16px", "1.5rem" -> px approximation). */
export function toPx(value: string | undefined): number | null {
  if (!value) return null
  const v = value.trim()
  const num = Number.parseFloat(v)
  if (Number.isNaN(num)) return null
  if (v.endsWith('rem') || v.endsWith('em')) return Math.round(num * 16)
  if (v.endsWith('%')) return null
  return Math.round(num)
}

export interface BoxValues {
  top: number
  right: number
  bottom: number
  left: number
}

/** Resolve padding/margin box values from shorthand + longhand properties. */
export function resolveBox(style: StyleMap, prop: 'padding' | 'margin'): BoxValues | null {
  let box: BoxValues | null = null
  const shorthand = style[prop]
  if (shorthand) {
    const parts = shorthand
      .split(/\s+/)
      .map((p) => toPx(p))
      .filter((p): p is number => p !== null)
    if (parts.length === 1) box = { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] }
    else if (parts.length === 2) box = { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] }
    else if (parts.length === 3) box = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] }
    else if (parts.length >= 4) box = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
  }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = toPx(style[`${prop}-${side}`])
    if (v !== null) {
      if (!box) box = { top: 0, right: 0, bottom: 0, left: 0 }
      box[side] = v
    }
  }
  return box
}

/** Scope raw CSS to the preview root so source styles do not leak into the app UI. */
export function scopeCss(css: string, scope: string): string {
  let src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  src = stripAtRules(src)
  return src.replace(/([^{}]+)\{/g, (_match, selectorGroup: string) => {
    const scoped = selectorGroup
      .split(',')
      .map((s) => {
        const sel = s.trim()
        if (!sel) return sel
        // body/html selectors target the preview root itself
        if (/^(html|body)$/i.test(sel)) return scope
        return `${scope} ${sel.replace(/^(html|body)\s+/i, '')}`
      })
      .join(', ')
    return `${scoped} {`
  })
}
