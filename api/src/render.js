import { acquirePage } from './browser-pool.js';
import { resolveImageSrc } from './image-fetch.js';
import { escapeHtml } from './util.js';
import { config } from './config.js';

function joinStyle(parts) {
  return parts.filter(Boolean).join(';');
}

function textHtml(el) {
  let effect;
  if (el.effect === 'gradient') {
    effect = 'background:linear-gradient(45deg,#ff007f,#7f00ff);-webkit-background-clip:text;background-clip:text;color:transparent';
  } else if (el.effect === 'neon') {
    effect = 'color:#fff;text-shadow:0 0 5px #fff,0 0 10px #ff007f,0 0 20px #ff007f';
  } else {
    effect = `color:${el.color}`;
  }
  // Anchor by alignment: center pulls the box back by half its own width so the text
  // stays centered on x=left; right pulls it back by its full width. Must match the
  // designer's preview (ui/js/designer/canvas.js) so what you place is what renders.
  const align = el.align || 'left';
  const transform = align === 'center' ? 'translateX(-50%)'
    : align === 'right' ? 'translateX(-100%)' : '';
  const style = joinStyle([
    'position:absolute',
    `left:${el.left}px`, `top:${el.top}px`,
    `font-size:${el.fontSize}px`,
    `font-family:${el.fontFamily || 'sans-serif'}, sans-serif`,
    `font-weight:${el.fontWeight}`,
    el.maxWidth ? `max-width:${el.maxWidth}px` : '',
    el.width ? `width:${el.width}px` : '',
    el.height ? `height:${el.height}px` : '',
    el.height ? 'overflow:hidden' : '',
    // Wrap long words when a width/maxWidth constrains the box (matches the designer preview).
    (el.width || el.maxWidth) ? 'white-space:pre-wrap' : '',
    (el.width || el.maxWidth) ? 'overflow-wrap:anywhere' : '',
    (el.width || el.maxWidth) ? 'word-break:break-word' : '',
    el.letterSpacing != null ? `letter-spacing:${el.letterSpacing}px` : '',
    el.lineHeight != null ? `line-height:${el.lineHeight}` : '',
    `text-align:${align}`,
    transform ? `transform:${transform}` : '',
    effect,
  ]);
  return `<div style="${style}">${escapeHtml(el.text)}</div>`;
}

function rectHtml(el) {
  const style = joinStyle([
    'position:absolute',
    `left:${el.left}px`, `top:${el.top}px`,
    `width:${el.width}px`, `height:${el.height}px`,
    `background:${el.color}`,
    `border-radius:${el.radius}px`,
  ]);
  return `<div style="${style}"></div>`;
}

function imageHtml(el, dataUri) {
  const style = joinStyle([
    'position:absolute',
    `left:${el.left}px`, `top:${el.top}px`,
    `width:${el.width}px`, `height:${el.height}px`,
    `border-radius:${el.radius}px`,
    'object-fit:cover',
  ]);
  return `<img src="${dataUri}" style="${style}">`;
}

function wrapDocument(doc, inner) {
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>*{box-sizing:border-box;margin:0;padding:0}</style></head>` +
    `<body style="margin:0;width:${doc.width}px;height:${doc.height}px;` +
    `background:${doc.backgroundColor};overflow:hidden;position:relative">${inner}</body></html>`;
}

export async function renderImage(doc) {
  const fragments = [];
  for (const el of doc.elements) {
    if (el.type === 'text') fragments.push(textHtml(el));
    else if (el.type === 'rect') fragments.push(rectHtml(el));
    else if (el.type === 'image') fragments.push(imageHtml(el, await resolveImageSrc(el.src)));
  }
  const html = wrapDocument(doc, fragments.join(''));

  const { page, release } = await acquirePage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      // Allow only inline content; block every network request (defense in depth).
      if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
        req.continue().catch(() => {});
      } else {
        req.abort().catch(() => {});
      }
    });
    await page.setViewport({
      width: doc.width,
      height: doc.height,
      deviceScaleFactor: doc.deviceScaleFactor,
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: config.renderTimeoutMs });

    const options = { type: doc.format, fullPage: false };
    if (doc.format !== 'png') options.quality = doc.quality;
    return await page.screenshot(options);
  } finally {
    await release();
  }
}
