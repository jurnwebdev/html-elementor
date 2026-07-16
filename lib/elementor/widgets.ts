export interface WidgetDef {
  /** Elementor widgetType value */
  type: string
  label: string
  description: string
}

/** Widgets the converter can target. All are Elementor Free widgets. */
export const WIDGETS: WidgetDef[] = [
  { type: 'heading', label: 'Heading', description: 'Title text (h1-h6)' },
  { type: 'text-editor', label: 'Text Editor', description: 'Rich text / paragraphs' },
  { type: 'image', label: 'Image', description: 'Single image' },
  { type: 'button', label: 'Button', description: 'Link styled as a button' },
  { type: 'video', label: 'Video', description: 'YouTube / Vimeo embed' },
  { type: 'divider', label: 'Divider', description: 'Horizontal rule' },
  { type: 'spacer', label: 'Spacer', description: 'Vertical spacing' },
  { type: 'icon-list', label: 'Icon List', description: 'Bulleted list with icons' },
  { type: 'html', label: 'HTML', description: 'Raw HTML passthrough' },
]

export function widgetLabel(type: string | null): string {
  if (!type) return 'Unassigned'
  const def = WIDGETS.find((w) => w.type === type)
  return def ? def.label : type
}

/** Tags that are treated as inline content (kept inside a leaf's innerHTML). */
export const INLINE_TAGS = new Set([
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'a',
  'br',
  'small',
  'sub',
  'sup',
  'code',
  'mark',
  'abbr',
  'time',
  'label',
])

/** Tags that never become nodes at all. */
export const IGNORED_TAGS = new Set(['script', 'style', 'link', 'meta', 'title', 'noscript', 'template'])

/** Void elements (cannot have children). */
export const VOID_TAGS = new Set(['img', 'hr', 'br', 'input', 'source', 'embed', 'wbr'])
