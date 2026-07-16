import type { ElementorElement, ElementorTemplate, ParsedNode, StyleMap } from './types'
import { effectiveStyle, resolveBox, toPx } from './styles'
import { generateElementId } from './parser'

interface SizeValue {
  unit: string
  size: number
  sizes: unknown[]
}

const size = (value: number, unit = 'px'): SizeValue => ({ unit, size: value, sizes: [] })

interface BoxSetting {
  unit: string
  top: string
  right: string
  bottom: string
  left: string
  isLinked: boolean
}

function boxSetting(top: number, right: number, bottom: number, left: number): BoxSetting {
  return {
    unit: 'px',
    top: String(top),
    right: String(right),
    bottom: String(bottom),
    left: String(left),
    isLinked: top === right && right === bottom && bottom === left,
  }
}

const ALIGN_MAP: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'justify' }

/** Normalized CSS alignment values accepted by Elementor flex settings. */
const FLEX_ALIGN_VALUES: Record<string, string> = {
  'flex-start': 'flex-start',
  start: 'flex-start',
  center: 'center',
  'flex-end': 'flex-end',
  end: 'flex-end',
  stretch: 'stretch',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
}

/**
 * Apply child flex properties (align-self, order, grow/shrink) describing how
 * an element behaves inside its flex parent. Elementor uses `flex_*` keys on
 * containers and `_flex_*` keys on widgets.
 */
function applyChildFlex(settings: Record<string, unknown>, style: StyleMap, prefix: 'flex' | '_flex') {
  if (style['align-self'] && FLEX_ALIGN_VALUES[style['align-self']]) {
    settings[`${prefix}_align_self`] = FLEX_ALIGN_VALUES[style['align-self']]
  }
  const order = style.order
  if (order && order !== '0') {
    settings[`${prefix}_order`] = 'custom'
    settings[`${prefix}_order_custom`] = Number.parseInt(order, 10)
  }
  const grow = style['flex-grow']
  const shrink = style['flex-shrink']
  if (grow && Number.parseFloat(grow) > 0) {
    settings[`${prefix}_size`] = 'custom'
    settings[`${prefix}_grow`] = Number.parseFloat(grow)
    if (shrink !== undefined) settings[`${prefix}_shrink`] = Number.parseFloat(shrink)
  } else if (shrink !== undefined && Number.parseFloat(shrink) !== 1) {
    settings[`${prefix}_size`] = 'custom'
    settings[`${prefix}_shrink`] = Number.parseFloat(shrink)
  }
}

/**
 * Converts any CSS color string to a 6- or 8-char hex code Elementor can digest.
 *
 * Uses an off-screen canvas to let the browser normalize any format:
 *   rgb(26, 26, 46)  →  #1A1A2E
 *   red              →  #FF0000
 *   hsl(0, 100%, 50%)→  #FF0000
 *   #abc             →  #AABBCC
 *   transparent      →  undefined
 *   rgba(..., 0)     →  undefined
 */
let _hexCtx: CanvasRenderingContext2D | null = null

function toHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  // fast path — already a 6/3 char hex
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const [_, r, g, b] = trimmed
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
    }
    return trimmed.slice(0, 7).toUpperCase()
  }
  // fast path — rgba/rgb with known alpha = 0
  const noAlpha = trimmed.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+0(?:\.0+)?)\s*\)$/)
  if (noAlpha) return undefined

  try {
    if (!_hexCtx) {
      const c = document.createElement('canvas')
      _hexCtx = c.getContext('2d')!
    }
    _hexCtx.fillStyle = trimmed
    const color = _hexCtx.fillStyle              // browser normalises it to rgb() / rgba() / #
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return undefined
    const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/)
    if (m) {
      const a = m[4] !== undefined ? Number.parseFloat(m[4]) : 1
      if (a === 0) return undefined
      const hex = (n: string) => Number.parseInt(n, 10).toString(16).padStart(2, '0')
      const base = `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`.toUpperCase()
      if (a < 1) return `${base}${Math.round(a * 255).toString(16).padStart(2, '0')}`
      return base
    }
    // already hex — return as-is (uppercased)
    if (color.startsWith('#')) return color.length <= 4 ? color[1]!.repeat(2) : color.slice(0, 7).toUpperCase()
  } catch {
    // fall through on any error
  }
  return trimmed.toUpperCase()
}

/** First non-generic font family from a computed font-family list. */
function primaryFontFamily(value: string | undefined): string | undefined {
  if (!value) return undefined
  const first = value.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
  if (!first || /^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive|fantasy)$/i.test(first)) {
    return undefined
  }
  return first
}

/**
 * Merge styles with correct priority: matched (stylesheet) → computed (browser) → inline.
 *
 * Computed style from `getComputedStyle` is the single most reliable source — it
 * reflects CDN-loaded classes, @media queries, CSS custom properties, external CSS,
 * and browser defaults. Inline styles win last because they have highest CSS specificity.
 *
 * IMPORTANT: Inline styles that reference unresolved `var(--custom-prop)` values are
 * DROPPED — the browser computed style already resolved them.  Leaving `var()` in
 * would override the real resolved value with an unusable literal string.
 */
function mergedStyle(node: ParsedNode, computed: Record<string, StyleMap>): StyleMap {
  const base = { ...node.matchedStyle, ...(computed[node.id] || {}) }
  // Merge inline styles but only if they are resolved (not CSS var() references)
  for (const [key, value] of Object.entries(node.inlineStyle)) {
    if (typeof value === 'string' && value.trim().startsWith('var(')) continue // skip unresolved custom props
    base[key] = value
  }
  return base
}

/** Apply shared typography settings from CSS onto a widget's settings. */
function applyTypography(settings: Record<string, unknown>, style: StyleMap, prefix = 'typography') {
  const fontSize = toPx(style['font-size'])
  const fontWeight = style['font-weight']
  const lineHeight = style['line-height']
  let hasCustom = false
  if (fontSize !== null) {
    settings[`${prefix}_font_size`] = size(fontSize)
    hasCustom = true
  }
  if (fontWeight && /^\d+$/.test(fontWeight)) {
    settings[`${prefix}_font_weight`] = fontWeight
    hasCustom = true
  } else if (fontWeight === 'bold') {
    settings[`${prefix}_font_weight`] = '700'
    hasCustom = true
  }
  if (lineHeight && lineHeight !== 'normal') {
    const lh = Number.parseFloat(lineHeight)
    if (!Number.isNaN(lh)) {
      settings[`${prefix}_line_height`] = lineHeight.endsWith('px') ? size(Math.round(lh)) : size(lh, 'em')
      hasCustom = true
    }
  }
  const family = primaryFontFamily(style['font-family'])
  if (family) {
    settings[`${prefix}_font_family`] = family
    hasCustom = true
  }
  const letterSpacing = toPx(style['letter-spacing'])
  if (letterSpacing !== null && letterSpacing !== 0) {
    settings[`${prefix}_letter_spacing`] = size(letterSpacing)
    hasCustom = true
  }
  const transform = style['text-transform']
  if (transform && ['uppercase', 'lowercase', 'capitalize'].includes(transform)) {
    settings[`${prefix}_text_transform`] = transform
    hasCustom = true
  }
  if (hasCustom) settings[`${prefix}_typography`] = 'custom'
}

function widgetSettings(node: ParsedNode, computed: Record<string, StyleMap>): Record<string, unknown> {
  const style = mergedStyle(node, computed)
  const settings: Record<string, unknown> = {}
  const align = ALIGN_MAP[style['text-align'] || '']

  switch (node.mapping.widgetType) {
    case 'heading': {
      settings.title = node.text
      settings.header_size = /^h[1-6]$/.test(node.tag) ? node.tag : 'h2'
      if (align) settings.align = align
      const color = toHexColor(style.color)
      if (color) settings.title_color = color
      applyTypography(settings, style)
      break
    }
    case 'text-editor': {
      const html = node.tag === 'p' ? `<p>${node.innerHtml}</p>` : node.isLeaf ? `<p>${node.innerHtml}</p>` : node.innerHtml
      settings.editor = html
      if (align) settings.align = align
      const color = toHexColor(style.color)
      if (color) settings.text_color = color
      applyTypography(settings, style)
      break
    }
    case 'image': {
      const img = node.tag === 'img' ? node : null
      let src = node.attrs.src || ''
      let alt = node.attrs.alt || ''
      if (!img) {
        const match = node.outerHtml.match(/<img[^>]*src=["']([^"']+)["']/i)
        if (match) src = match[1]
        const altMatch = node.outerHtml.match(/<img[^>]*alt=["']([^"']*)["']/i)
        if (altMatch) alt = altMatch[1]
      }
      settings.image = { url: src, id: '', size: '', alt, source: 'url' }
      const width = toPx(style.width)
      if (width !== null) settings.width = size(width)
      const radius = toPx(style['border-radius'])
      if (radius !== null) settings.image_border_radius = boxSetting(radius, radius, radius, radius)
      break
    }
    case 'button': {
      settings.text = node.text || 'Click here'
      settings.link = { url: node.attrs.href || '#', is_external: node.attrs.target === '_blank' ? 'on' : '', nofollow: '' }
      const btnColor = toHexColor(style.color)
      if (btnColor) settings.button_text_color = btnColor
      const btnBg = toHexColor(style['background-color'] || style.background)
      if (btnBg) {
        settings.background_color = btnBg
        settings.button_background_color = btnBg
      }
      const radius = toPx(style['border-radius'])
      if (radius !== null) settings.border_radius = boxSetting(radius, radius, radius, radius)
      const padding = resolveBox(style, 'padding')
      if (padding) settings.text_padding = boxSetting(padding.top, padding.right, padding.bottom, padding.left)
      applyTypography(settings, style)
      break
    }
    case 'video': {
      const src = node.attrs.src || node.outerHtml.match(/src=["']([^"']+)["']/i)?.[1] || ''
      if (/vimeo/.test(src)) {
        settings.video_type = 'vimeo'
        settings.vimeo_url = src
      } else {
        settings.video_type = 'youtube'
        // convert embed url to watch url
        const idMatch = src.match(/(?:embed\/|v=|youtu\.be\/)([\w-]{6,})/)
        settings.youtube_url = idMatch ? `https://www.youtube.com/watch?v=${idMatch[1]}` : src
      }
      break
    }
    case 'divider': {
      const dividerColor = toHexColor(style['border-color'] || style['border-top-color'])
      if (dividerColor) settings.color = dividerColor
      break
    }
    case 'spacer': {
      const height = toPx(style.height) ?? 50
      settings.space = size(height)
      break
    }
    case 'icon-list': {
      const items: Array<Record<string, unknown>> = []
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
      let m: RegExpExecArray | null
      while ((m = liRe.exec(node.innerHtml)) !== null) {
        // Strip HTML tags but keep visible text content, excluding
        // icon / symbol elements that only contribute visual icons.
        const li = m[1]
        // Remove material-symbol / icon spans entirely before extracting text
        const clean = li.replace(/<span[^>]*class="[^"]*material-symbols[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
                        .replace(/<[^>]+>/g, '').trim()
        if (!clean) continue
        items.push({
          text: clean,
          selected_icon: { value: 'fas fa-check', library: 'fa-solid' },
          _id: generateElementId(),
        })
      }
      settings.icon_list = items
      const listColor = toHexColor(style.color)
      if (listColor) settings.text_color = listColor
      break
    }
    case 'html': {
      settings.html = node.outerHtml
      break
    }
  }

  // child flex properties (how this widget behaves inside its flex parent)
  applyChildFlex(settings, style, '_flex')

  return settings
}

function containerSettings(
  node: ParsedNode,
  isTopLevel: boolean,
  style: StyleMap,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {}

  // Detect content width from the element's actual max-width.
  // If the element has no explicit max-width (or it's "none" or very large)
  // the container should be 'full' width. Elements with a constrained
  // max-width (e.g. 1200px) should use 'boxed' so Elementor applies its
  // own content-width constraint.
  const maxWidthVal = style['max-width']
  const maxWidth = maxWidthVal && maxWidthVal !== 'none' ? toPx(maxWidthVal) : null
  const isFullWidth = !maxWidth || maxWidth > 2000
  settings.content_width = isTopLevel && isFullWidth ? 'full' : isTopLevel ? 'boxed' : 'full'

  // Detect whether the source element uses CSS Grid.  Elementor containers
  // are always flex, but we can approximate a grid by setting flex-wrap +
  // equal-width children.
  const display = style.display || ''
  const isGrid = display.includes('grid') || style['grid-template-columns'] !== undefined
  const isFlexLike = isGrid || display.includes('flex')

  // Elementor containers are always flex — emit the full set of flex
  // properties on every container so nothing is lost in the conversion.
  settings.container_type = 'flex'

  const dir = style['flex-direction'] || 'row'
  if (isFlexLike) {
    settings.flex_direction = isGrid ? 'row' : dir.startsWith('row') ? 'row' : 'column'
  } else {
    // block containers stack children vertically -> flex column in Elementor
    settings.flex_direction = 'column'
  }

  // When the source has overflow-x: auto (horizontal scroll panels),
  // we must NOT wrap children — they should stay inline to approximate
  // the scrolling row.  Set nowrap explicitly so Elementor doesn't
  // force-wrap them into a vertical stack.
  const overflow = style['overflow-x'] || style.overflow || ''
  const isHorizontalScroll = overflow === 'auto' || overflow === 'scroll'
  if (style['flex-wrap'] === 'wrap' || (isGrid && !isHorizontalScroll)) settings.flex_wrap = 'wrap'
  else if (isHorizontalScroll) settings.flex_wrap = 'nowrap'

  if (style['justify-content'] && FLEX_ALIGN_VALUES[style['justify-content']]) {
    settings.flex_justify_content = FLEX_ALIGN_VALUES[style['justify-content']]
  }
  if (style['align-items'] && FLEX_ALIGN_VALUES[style['align-items']]) {
    settings.flex_align_items = FLEX_ALIGN_VALUES[style['align-items']]
  }
  if (style['align-content'] && FLEX_ALIGN_VALUES[style['align-content']]) {
    settings.flex_align_content = FLEX_ALIGN_VALUES[style['align-content']]
  }

  const colGap = toPx(style['column-gap'] ?? style.gap)
  const rowGap = toPx(style['row-gap'] ?? style.gap)
  if (colGap !== null || rowGap !== null) {
    const c = colGap ?? rowGap ?? 0
    const r = rowGap ?? colGap ?? 0
    settings.flex_gap = { unit: 'px', size: c, column: String(c), row: String(r), isLinked: c === r }
  }

  // child flex properties (how this container behaves inside ITS parent)
  applyChildFlex(settings, style, 'flex')

  // manual overrides from the inspector always win over detected styles
  const ov = node.flexOverrides
  if (ov) {
    if (ov.direction) settings.flex_direction = ov.direction
    if (ov.wrap === 'wrap') settings.flex_wrap = 'wrap'
    else if (ov.wrap === 'nowrap') delete settings.flex_wrap
    if (ov.justify) settings.flex_justify_content = ov.justify
    if (ov.align) settings.flex_align_items = ov.align
    if (ov.gap !== undefined) {
      settings.flex_gap = { unit: 'px', size: ov.gap, column: String(ov.gap), row: String(ov.gap), isLinked: true }
    }
  }

  const bg = toHexColor(
    style['background-color'] || (style.background && !style.background.includes('url') && !style.background.includes('gradient') ? style.background : ''),
  )
  if (bg) {
    settings.background_background = 'classic'
    settings.background_color = bg
  }

  // Detect CSS gradients (linear, radial, conic) and emit Elementor's
  // gradient settings so overlays and gradient backgrounds are preserved.
  const bgGradient = style['background-image'] || style.background || ''
  const gradientMatch = bgGradient.match(/(linear|radial|conic)-gradient\((.+)\)/i)
  if (gradientMatch) {
    settings.background_background = 'gradient'
    const gradientType = gradientMatch[1].toLowerCase()
    if (gradientType === 'linear') {
      settings.background_gradient_type = 'linear'
      // Extract angle or direction (e.g. "to top" or "180deg")
      const parts = gradientMatch[2].split(',')
      const first = parts[0]?.trim() || ''
      if (first.endsWith('deg') || first.startsWith('to ')) {
        settings.background_gradient_angle = first.endsWith('deg') ? parseFloat(first) || 180 : first === 'to top' ? 0 : first === 'to bottom' ? 180 : first === 'to left' ? 270 : first === 'to right' ? 90 : 180
        parts.shift()
      }
      // Extract color stops — first and last as start/end colors
      const stops = parts.map(s => s.trim()).filter(Boolean)
      if (stops.length > 0) settings.background_gradient_color = toHexColor(stops[0].split(/\s+/)[0]) || '#000000'
      if (stops.length > 1) settings.background_gradient_color_b = toHexColor(stops[stops.length - 1].split(/\s+/)[0]) || '#FFFFFF'
    } else if (gradientType === 'radial') {
      settings.background_gradient_type = 'radial'
    }
  }

  const bgImage = bgGradient.match(/url\(["']?([^"')]+)["']?\)/)
  if (bgImage) {
    settings.background_background = 'classic'
    settings.background_image = { url: bgImage[1], id: '', size: '', source: 'url' }
    settings.background_size = style['background-size'] || 'cover'
    settings.background_position = style['background-position'] || 'center center'
    settings.background_repeat = style['background-repeat'] || 'no-repeat'
  }

  const padding = resolveBox(style, 'padding')
  if (padding) settings.padding = boxSetting(padding.top, padding.right, padding.bottom, padding.left)
  const margin = resolveBox(style, 'margin')
  if (margin) settings.margin = boxSetting(margin.top, margin.right, margin.bottom, margin.left)

  const minHeight = toPx(style['min-height'])
  if (minHeight !== null) settings.min_height = size(minHeight)

  // Pass through max-width as Elementor's custom element width so the
  // imported container respects explicit width constraints from the source.
  if (maxWidth) {
    settings._element_width = 'custom'
    settings._element_custom_width = size(maxWidth)
  }

  const radius = toPx(style['border-radius'])
  if (radius !== null) settings.border_radius = boxSetting(radius, radius, radius, radius)

  return settings
}

/** Approximate number of columns from a grid-template-columns value. */
function gridColumnCount(style: StyleMap): number | null {
  const v = style['grid-template-columns']
  if (!v || v === 'none') return null
  const rep = v.match(/repeat\((\d+)/)
  if (rep) return Number.parseInt(rep[1], 10)
  const tracks = v.trim().split(/\s+/).length
  return tracks > 1 ? tracks : null
}

function buildElement(
  node: ParsedNode,
  depth: number,
  computed: Record<string, StyleMap>,
  gridColumns: number | null = null,
): ElementorElement | null {
  if (node.mapping.kind === 'skip') return null

  if (node.mapping.kind === 'widget') {
    const el: ElementorElement = {
      id: generateElementId(),
      elType: 'widget',
      settings: widgetSettings(node, computed),
      elements: [],
      widgetType: node.mapping.widgetType || 'html',
    }
    // When this widget sits inside a grid container, set it to
    // equal-width so children approximate the source grid layout.
    if (gridColumns && gridColumns > 1) {
      el.settings._flex_size = 'custom'
      el.settings._flex_grow = 1
      el.settings._flex_basis = (100 / gridColumns).toFixed(4) + '%'
    }
    return el
  }

  // container — compute merged CSS styles once, then use for both
  // the Elementor settings AND grid column detection.
  const style = mergedStyle(node, computed)
  const childGridColumns = gridColumnCount(style)
  const settings = containerSettings(node, depth === 0, style)

  const children: ElementorElement[] = []
  for (const child of node.children) {
    const el = buildElement(child, depth + 1, computed, childGridColumns)
    if (el) children.push(el)
  }

  // When this container sits inside a grid parent, give it equal-width
  // flex sizing so children approximate the source grid layout.
  if (gridColumns && gridColumns > 1) {
    settings._flex_size = 'custom'
    settings._flex_grow = 1
    settings._flex_basis = (100 / gridColumns).toFixed(4) + '%'
  }

  return {
    id: generateElementId(),
    elType: 'container',
    settings,
    elements: children,
    isInner: depth > 0,
  }
}

/** Wrap stray top-level widgets in a container (Elementor requires containers at root). */
function wrapTopLevel(elements: ElementorElement[]): ElementorElement[] {
  const out: ElementorElement[] = []
  let pendingWidgets: ElementorElement[] = []

  const flush = () => {
    if (pendingWidgets.length === 0) return
    out.push({
      id: generateElementId(),
      elType: 'container',
      settings: { content_width: 'full', flex_direction: 'column' },
      elements: pendingWidgets,
      isInner: false,
    })
    pendingWidgets = []
  }

  for (const el of elements) {
    if (el.elType === 'widget') {
      pendingWidgets.push(el)
    } else {
      flush()
      out.push(el)
    }
  }
  flush()
  return out
}

export function exportTemplate(
  nodes: ParsedNode[],
  title: string,
  computed: Record<string, StyleMap> = {},
): ElementorTemplate {
  const elements: ElementorElement[] = []
  for (const node of nodes) {
    const el = buildElement(node, 0, computed)
    if (el) elements.push(el)
  }

  return {
    content: wrapTopLevel(elements),
    page_settings: [],
    version: '0.4',
    title: title || 'Converted Template',
    type: 'page',
  }
}
