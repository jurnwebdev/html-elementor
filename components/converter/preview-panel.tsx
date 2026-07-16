'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { ParsedNode, StyleMap } from '@/lib/elementor/types'
import { widgetLabel } from '@/lib/elementor/widgets'

interface PreviewPanelProps {
  nodes: ParsedNode[]
  previewHtml: string
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onComputedStyles: (styles: Record<string, StyleMap>) => void
}

/**
 * Script injected into the preview iframe. Handles hover/click highlighting
 * and communicates selection to the editor via postMessage.
 */
const OVERLAY = `
<style id="__v0-overlay-css">
  [data-nid] { cursor: pointer !important; }
  [data-v0-hover] { outline: 2px dashed rgba(217, 32, 122, 0.75) !important; outline-offset: -2px !important; }
  [data-v0-selected] { outline: 2px solid #d9207a !important; outline-offset: -2px !important; }
  [data-v0-skip] { opacity: 0.35 !important; filter: grayscale(1) !important; }
</style>
<script id="__v0-overlay-js">
(function () {
  var hoverEl = null;

  var CAPTURE_PROPS = [
    'color','background-color','background-image','font-size','font-weight','font-family',
    'line-height','letter-spacing','text-transform','text-align','border-radius',
    'padding-top','padding-right','padding-bottom','padding-left',
    'margin-top','margin-right','margin-bottom','margin-left',
    'display','flex-direction','flex-wrap','justify-content','align-items','align-content',
    'align-self','flex-grow','flex-shrink','flex-basis','order',
    'row-gap','column-gap','min-height','height','width','max-width',
    'border-top-width','border-top-color','border-top-style',
    'grid-template-columns','background-size','background-position','background-repeat'
  ];

  // Subset that is genuinely inherited in CSS — only these should be
  // dropped when they match the parent's computed value.
  var INHERITED_PROPS = new Set([
    'color','font-size','font-weight','font-family',
    'line-height','letter-spacing','text-transform','text-align'
  ]);

  function isNoise(prop, v) {
    if (!v) return true;
    if (v === 'none' || v === 'normal' || v === 'auto') return true;
    if (prop === 'background-color' && (v === 'rgba(0, 0, 0, 0)' || v === 'transparent')) return true;
    if (prop === 'text-align' && (v === 'start' || v === 'left')) return true;
    if (prop === 'text-transform' && v === 'none') return true;
    if (prop === 'display' && (v === 'block' || v === 'inline')) return true;
    if (prop === 'flex-grow' && v === '0') return true;
    if (prop === 'flex-shrink' && v === '1') return true;
    if (prop === 'order' && v === '0') return true;
    if (prop === 'flex-basis' && (v === 'auto' || v === '0%')) return true;
    if (/^(padding|margin|border-radius|row-gap|column-gap|min-height|border-top-width)/.test(prop) && parseFloat(v) === 0) return true;
    return false;
  }

  function captureStyles() {
    var out = {};
    // Walk the DOM tree top-down so we can compare each node's
    // computed style with its parent.  Properties that match the
    // parent's value are **inherited** — we skip them so the
    // exporter doesn't bake redundant overrides into every element.
    var roots = document.querySelectorAll('[data-nid]');

    // Build a parent-map for fast lookup
    var parentMap = {};
    roots.forEach(function (el) {
      var p = el.parentElement;
      while (p && !p.hasAttribute('data-nid')) p = p.parentElement;
      parentMap[el.getAttribute('data-nid')] = p ? p.getAttribute('data-nid') : null;
    });

    // First pass — capture ALL computed values (including noise/defaults)
    var raw = {};
    roots.forEach(function (el) {
      var cs = getComputedStyle(el);
      var map = {};
      CAPTURE_PROPS.forEach(function (p) {
        map[p] = cs.getPropertyValue(p).trim();
      });
      raw[el.getAttribute('data-nid')] = map;
    });

    // Second pass — filter out inherited (parent-matching) and default values.
    // Only genuinely-inherited text/typography properties are compared against
    // the parent.  Layout properties (display, flex-*, padding, margin, border,
    // dimensions, background) are NEVER filtered by parent-match — they are
    // independently set on each element even if their value happens to match.
    roots.forEach(function (el) {
      var id = el.getAttribute('data-nid');
      var map = raw[id];
      var parentId = parentMap[id];
      var parentMap_ = parentId ? raw[parentId] : null;
      var filtered = {};
      CAPTURE_PROPS.forEach(function (p) {
        var v = map[p];
        if (!v) return;
        // Only drop inherited-text props when they match the parent value
        if (INHERITED_PROPS.has(p) && parentMap_ && map[p] === parentMap_[p]) return;
        // Skip noise / browser defaults
        if (isNoise(p, v)) return;
        filtered[p] = v;
      });
      out[id] = filtered;
    });

    parent.postMessage({ __v0: true, type: 'computed-styles', styles: out }, '*');
  }

  // capture after full load (fonts + Tailwind CDN applied), then once more for late async styling
  window.addEventListener('load', function () {
    setTimeout(captureStyles, 400);
    setTimeout(captureStyles, 1800);
  });

  function closestNid(target) {
    if (!target || !target.closest) return null;
    return target.closest('[data-nid]');
  }

  document.addEventListener('click', function (e) {
    var el = closestNid(e.target);
    if (el) parent.postMessage({ __v0: true, type: 'select', id: el.getAttribute('data-nid') }, '*');
  }, true);

  // block navigation/submissions inside the preview
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  document.addEventListener('mouseover', function (e) {
    var el = closestNid(e.target);
    if (el === hoverEl) return;
    if (hoverEl) hoverEl.removeAttribute('data-v0-hover');
    hoverEl = el;
    if (el) {
      el.setAttribute('data-v0-hover', '');
      parent.postMessage({ __v0: true, type: 'hover', id: el.getAttribute('data-nid') }, '*');
    } else {
      parent.postMessage({ __v0: true, type: 'hover', id: null }, '*');
    }
  }, true);

  document.addEventListener('mouseleave', function () {
    if (hoverEl) hoverEl.removeAttribute('data-v0-hover');
    hoverEl = null;
    parent.postMessage({ __v0: true, type: 'hover', id: null }, '*');
  });

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || !msg.__v0) return;

    if (msg.type === 'state') {
      document.querySelectorAll('[data-v0-selected]').forEach(function (n) { n.removeAttribute('data-v0-selected'); });
      if (msg.selectedId) {
        var sel = document.querySelector('[data-nid="' + msg.selectedId + '"]');
        if (sel) sel.setAttribute('data-v0-selected', '');
      }
      document.querySelectorAll('[data-v0-skip]').forEach(function (n) { n.removeAttribute('data-v0-skip'); });
      (msg.skippedIds || []).forEach(function (id) {
        var el = document.querySelector('[data-nid="' + id + '"]');
        if (el) el.setAttribute('data-v0-skip', '');
      });
    }

    if (msg.type === 'scroll' && msg.id) {
      var target = document.querySelector('[data-nid="' + msg.id + '"]');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (msg.type === 'capture-styles') {
      captureStyles();
    }

    if (msg.type === 'apply-flex') {
      var overrides = msg.overrides || {};
      // clear styles from nodes that no longer have overrides (e.g. after Reset)
      document.querySelectorAll('[data-v0-flex]').forEach(function (el) {
        var nid = el.getAttribute('data-nid');
        if (!overrides[nid]) {
          el.style.display = '';
          el.style.flexDirection = '';
          el.style.flexWrap = '';
          el.style.justifyContent = '';
          el.style.alignItems = '';
          el.style.gap = '';
          el.removeAttribute('data-v0-flex');
        }
      });
      Object.keys(overrides).forEach(function (nid) {
        var el = document.querySelector('[data-nid="' + nid + '"]');
        if (!el) return;
        var ov = overrides[nid];
        el.setAttribute('data-v0-flex', '');
        el.style.display = 'flex';
        el.style.flexDirection = ov.direction || '';
        el.style.flexWrap = ov.wrap || '';
        el.style.justifyContent = ov.justify || '';
        el.style.alignItems = ov.align || '';
        el.style.gap = ov.gap !== undefined && ov.gap !== null ? ov.gap + 'px' : '';
      });
    }

    if (msg.type === 'hover-from-tree') {
      document.querySelectorAll('[data-v0-hover]').forEach(function (n) { n.removeAttribute('data-v0-hover'); });
      if (msg.id) {
        var h = document.querySelector('[data-nid="' + msg.id + '"]');
        if (h) h.setAttribute('data-v0-hover', '');
      }
    }
  });

  parent.postMessage({ __v0: true, type: 'ready' }, '*');
})();
</script>
`

function collectSkippedIds(nodes: ParsedNode[]): string[] {
  const out: string[] = []
  const walk = (list: ParsedNode[]) => {
    for (const n of list) {
      if (n.mapping.kind === 'skip') out.push(n.id)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function collectFlexOverrides(nodes: ParsedNode[]): Record<string, NonNullable<ParsedNode['flexOverrides']>> {
  const out: Record<string, NonNullable<ParsedNode['flexOverrides']>> = {}
  const walk = (list: ParsedNode[]) => {
    for (const n of list) {
      if (n.flexOverrides && Object.values(n.flexOverrides).some((v) => v !== undefined)) out[n.id] = n.flexOverrides
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function findNodeById(nodes: ParsedNode[], id: string | null): ParsedNode | null {
  if (!id) return null
  for (const n of nodes) {
    if (n.id === id) return n
    const f = findNodeById(n.children, id)
    if (f) return f
  }
  return null
}

export function PreviewPanel({
  nodes,
  previewHtml,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onComputedStyles,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)
  const lastSelectedRef = useRef<string | null>(null)
  const hoverSourceRef = useRef<'iframe' | 'tree' | null>(null)

  const srcDoc = useMemo(() => {
    if (!previewHtml) return ''
    // Force desktop-width viewport so getComputedStyle captures the
    // desktop layout (not the mobile one from @media queries).
    const viewport = '<meta name="viewport" content="width=1440">'
    let html = previewHtml
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${viewport}</head>`)
    } else if (html.includes('<title>')) {
      html = html.replace('<title>', `${viewport}<title>`)
    }
    if (html.includes('</body>')) {
      return html.replace('</body>', `${OVERLAY}</body>`)
    }
    return html + OVERLAY
  }, [previewHtml])

  const skippedIds = useMemo(() => collectSkippedIds(nodes), [nodes])
  const flexOverrides = useMemo(() => collectFlexOverrides(nodes), [nodes])
  const flexOverridesKey = useMemo(() => JSON.stringify(flexOverrides), [flexOverrides])

  // push flex overrides into the iframe so layout changes preview live
  useEffect(() => {
    if (!readyRef.current) return
    iframeRef.current?.contentWindow?.postMessage({ __v0: true, type: 'apply-flex', overrides: flexOverrides }, '*')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flexOverridesKey])

  const postState = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { __v0: true, type: 'state', selectedId, skippedIds },
      '*',
    )
  }

  // receive select/hover events from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (!msg || !msg.__v0) return
      if (msg.type === 'select') onSelect(msg.id)
      if (msg.type === 'hover') {
        hoverSourceRef.current = 'iframe'
        onHover(msg.id)
      }
      if (msg.type === 'ready') {
        readyRef.current = true
        postState()
      }
      if (msg.type === 'computed-styles') {
        onComputedStyles(msg.styles || {})
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, onHover, selectedId, skippedIds, onComputedStyles])

  // push selection + skip state into the iframe whenever it changes
  useEffect(() => {
    if (!readyRef.current) return
    postState()
    // scroll to the selection only when it came from outside the iframe (tree click)
    if (selectedId && selectedId !== lastSelectedRef.current && hoverSourceRef.current !== 'iframe') {
      iframeRef.current?.contentWindow?.postMessage({ __v0: true, type: 'scroll', id: selectedId }, '*')
    }
    lastSelectedRef.current = selectedId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, skippedIds])

  // mirror tree-hover into the iframe
  useEffect(() => {
    if (!readyRef.current) return
    if (hoverSourceRef.current === 'iframe') {
      hoverSourceRef.current = null
      return
    }
    iframeRef.current?.contentWindow?.postMessage({ __v0: true, type: 'hover-from-tree', id: hoveredId }, '*')
  }, [hoveredId])

  const hoveredNode = useMemo(() => findNodeById(nodes, hoveredId), [nodes, hoveredId])

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Preview</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {hoveredNode
            ? `<${hoveredNode.tag}> \u2192 ${
                hoveredNode.mapping.kind === 'container'
                  ? 'Container'
                  : hoveredNode.mapping.kind === 'skip'
                    ? 'Skipped'
                    : widgetLabel(hoveredNode.mapping.widgetType)
              }`
            : 'Click an element to map it'}
        </span>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <iframe
          ref={iframeRef}
          title="HTML preview"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="size-full rounded-lg border border-border bg-white"
        />
      </div>
    </main>
  )
}
