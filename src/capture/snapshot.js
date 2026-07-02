// Runs INSIDE the browser page via page.evaluate(extractSnapshot).
// Must stay self-contained: no imports, no outer-scope references.
export function extractSnapshot() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch { return null; }
  };

  // Nearest semantic landmark wins; not-in-chrome falls back to 'main'.
  const regionOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const tag = n.tagName ? n.tagName.toLowerCase() : '';
      const role = (n.getAttribute && n.getAttribute('role')) || '';
      if (tag === 'nav' || role === 'navigation') return 'nav';
      if (tag === 'header' || role === 'banner') return 'header';
      if (tag === 'footer' || role === 'contentinfo') return 'footer';
      if (tag === 'main' || role === 'main') return 'main';
    }
    return 'main';
  };

  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: abs(a.getAttribute('href')), text: norm(a.textContent).slice(0, 120), region: regionOf(a) }))
    .filter((l) => l.href && /^https?:/.test(l.href));

  const images = [...document.querySelectorAll('img')]
    .map((img) => {
      const r = img.getBoundingClientRect();
      return {
        src: abs(img.currentSrc || img.src),
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(r.width), renderedHeight: Math.round(r.height),
        region: regionOf(img),
      };
    })
    .filter((i) => i.src && i.renderedWidth > 0 && i.renderedHeight > 0);

  const textBlocks = [...document.querySelectorAll('h1,h2,h3,h4,p,li')]
    .map((el) => ({ text: norm(el.textContent), region: regionOf(el) }))
    .filter((b) => b.text.length > 1);

  // Find the content root and its module children without relying on a <main>
  // landmark: descend through single content wrappers, skipping chrome (header/
  // nav/footer) subtrees via regionOf, until we reach the real content sections.
  const MIN_MODULE_HEIGHT = 40;
  const isTall = (el) => el.getBoundingClientRect().height > MIN_MODULE_HEIGHT;
  const contentChildren = (el) =>
    [...el.children].filter((c) => isTall(c) && regionOf(c) === 'main');

  let node = document.querySelector('main, [role=main]') || document.body;
  let guard = 0;
  while (guard++ < 40) {
    const kids = contentChildren(node);
    // descend through a single content wrapper only while it still has content inside
    if (kids.length === 1 && contentChildren(kids[0]).length >= 1) { node = kids[0]; continue; }
    break;
  }
  const modules = contentChildren(node).map((el) => ({
    tag: el.tagName.toLowerCase(),
    className: norm(el.className && el.className.toString()).slice(0, 200),
    heading: norm(el.querySelector('h1,h2,h3,h4')?.textContent ?? ''),
    imageFiles: [...el.querySelectorAll('img')]
      .map((i) => {
        const src = i.currentSrc || i.src || '';
        return src.split('/').pop().split('?')[0].toLowerCase();
      })
      .filter(Boolean)
      .slice(0, 10),
    height: Math.round(el.getBoundingClientRect().height),
    region: 'main',
  }));

  return { finalUrl: location.href, title: document.title, links, images, textBlocks, modules };
}
