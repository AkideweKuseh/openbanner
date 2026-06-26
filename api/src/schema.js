import { z } from 'zod';

// No quotes, braces, or semicolons can appear -> safe to inline into a style attribute.
const cssColor = z.string().regex(
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\)|[a-zA-Z]{3,20})$/,
  'invalid color',
);

const fontWeight = z.union([
  z.enum(['normal', 'bold', 'bolder', 'lighter']),
  z.number().int().min(100).max(900),
]);

const baseEl = {
  left: z.number().int().min(-4000).max(4000),
  top: z.number().int().min(-4000).max(4000),
  // UI-only label for the element (shown in the Layers panel). Optional, ignored at render.
  name: z.string().max(120).optional(),
};

// Font family names like "Inter", "Playfair Display", "JetBrains Mono".
const fontFamilyStr = z.string().regex(/^[A-Za-z0-9 ,'"-]+$/, 'invalid font family').max(80);

// Slot name for template text injection (e.g. "headline", "text1"). Optional — when
// present, the element's text is fillable via the template render `mergeVars` map.
const slotName = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/, 'invalid slot name');

const textEl = z.object({
  type: z.literal('text'),
  text: z.string().max(2000),
  ...baseEl,
  fontFamily: fontFamilyStr.default('sans-serif'),
  fontSize: z.number().int().min(8).max(400).default(32),
  color: cssColor.default('#ffffff'),
  fontWeight: fontWeight.default('bold'),
  maxWidth: z.number().int().min(1).max(4000).optional(),
  // Optional fixed box: when set, the text wraps at `width` and (if `height` is set)
  // clips to it — turning a text element into a sized "placeholder" frame.
  width: z.number().int().min(1).max(4000).optional(),
  height: z.number().int().min(1).max(4000).optional(),
  // Typography fine-tuning. letterSpacing is in px (may be negative); lineHeight is a
  // unitless multiplier (e.g. 1.2).
  letterSpacing: z.number().min(-50).max(200).optional(),
  lineHeight: z.number().min(0.1).max(10).optional(),
  effect: z.enum(['none', 'gradient', 'neon']).default('none'),
  // Horizontal anchor for the text. `left` (default) grows rightward from (left,top);
  // `center` keeps the text centered on x=left; `right` anchors its right edge at x=left.
  // This makes variable-length merge values stay put instead of drifting by length.
  align: z.enum(['left', 'center', 'right']).default('left'),
  slot: slotName.optional(),
}).strict();

const rectEl = z.object({
  type: z.literal('rect'),
  ...baseEl,
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
  color: cssColor.default('#000000'),
  radius: z.number().int().min(0).max(2000).default(0),
}).strict();

// An image source is one of: an `ob-image:<key>` reference to our object storage, an
// inline data: URI (uploaded/offline), or a remote http(s) URL (SSRF-guarded at render).
const imageSrc = z.string().refine(
  (s) => /^ob-image:[a-f0-9]{32}$/.test(s) || /^data:image\//.test(s) || /^https?:\/\//.test(s),
  'image src must be an ob-image reference, a data: image URI, or an http(s) URL',
);

const imageEl = z.object({
  type: z.literal('image'),
  src: imageSrc,
  ...baseEl,
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
  radius: z.number().int().min(0).max(2000).default(0),
}).strict();

const element = z.discriminatedUnion('type', [textEl, rectEl, imageEl]);

export const renderSchema = z.object({
  width: z.number().int().min(16).max(4000).default(1200),
  height: z.number().int().min(16).max(4000).default(630),
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.number().int().min(1).max(100).default(90),
  backgroundColor: cssColor.default('#1e1e24'),
  deviceScaleFactor: z.number().min(1).max(3).default(1),
  elements: z.array(element).max(100).default([]),
}).strict();

// ── Templates (server-side reusable layouts with named text slots) ──

// Stable identifier / slug for a stored template. Lowercase, URL-safe.
export const templateIdRe = /^[a-z0-9][a-z0-9-_]{0,63}$/;

// A stored template: the fixed layout (dimensions + elements). `id` and `name` are
// optional on create (id auto-generated if absent; name defaults to "Untitled").
// `elements` reuse the same element union, so text elements may carry a `slot`.
export const templateSchema = z.object({
  id: z.string().regex(templateIdRe, 'invalid template id').optional(),
  name: z.string().max(120).default('Untitled'),
  width: z.number().int().min(16).max(4000).default(1200),
  height: z.number().int().min(16).max(4000).default(630),
  backgroundColor: cssColor.default('#1e1e24'),
  elements: z.array(element).max(100).default([]),
}).strict();

// Body for `POST /v1/templates/:id/render`: pick the output format and fill slots.
export const renderTemplateSchema = z.object({
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.number().int().min(1).max(100).default(90),
  deviceScaleFactor: z.number().min(1).max(3).default(1),
  mergeVars: z.record(z.string(), z.string().max(2000)).default({}),
}).strict();

/** Extract the ordered list of slot names from a template's elements. */
export function slotsOf(elements) {
  const slots = [];
  let auto = 0;
  for (const el of elements) {
    if (el.type !== 'text') continue;
    auto += 1;
    slots.push(el.slot || `text${auto}`);
  }
  return slots;
}
