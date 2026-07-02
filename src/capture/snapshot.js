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
  // A module's image identity should be content images, not shared UI icons.
  const ICON_MAX_PX = 48;
  const contentImageFile = (img) => {
    const r = img.getBoundingClientRect();
    if (Math.min(r.width, r.height) < ICON_MAX_PX) return null;
    const src = img.currentSrc || img.src || '';
    const file = src.split('/').pop().split('?')[0].toLowerCase();
    return file || null;
  };
  const COARSE_MODULE_MIN_HEIGHT = 1000;
  const toModule = (el, heading, imgs, height) => ({
    tag: el.tagName.toLowerCase(),
    className: norm(el.className && el.className.toString()).slice(0, 200),
    heading: norm(heading),
    imageFiles: imgs.map(contentImageFile).filter(Boolean).slice(0, 10),
    height: Math.round(Math.max(0, height)),
    region: 'main',
  });

  // A monolithic content blob (tall + multiple section headings) is split into
  // one module per top-level (h2) section heading so its granularity matches a
  // well-segmented migrated page. h3+ are sub-points within a section, not modules.
  const modulesFor = (el) => {
    const rect = el.getBoundingClientRect();
    const headings = [...el.querySelectorAll('h2')];
    if (rect.height >= COARSE_MODULE_MIN_HEIGHT && headings.length >= 2) {
      const sections = [];
      for (const n of el.querySelectorAll('h2, img')) { // document order
        if (n.tagName.toLowerCase() === 'h2') sections.push({ headEl: n, heading: n.textContent, imgs: [] });
        else if (sections.length) sections[sections.length - 1].imgs.push(n);
      }
      return sections
        .map((s, i) => {
          const top = s.headEl.getBoundingClientRect().top;
          const nextTop = i + 1 < sections.length
            ? sections[i + 1].headEl.getBoundingClientRect().top
            : rect.bottom;
          return toModule(el, s.heading, s.imgs, nextTop - top);
        })
        .filter((m) => m.height > MIN_MODULE_HEIGHT); // drop zero/tiny stacked-heading noise
    }
    return [toModule(el, el.querySelector('h1,h2,h3,h4')?.textContent ?? '', [...el.querySelectorAll('img')], rect.height)];
  };

  const modules = contentChildren(node).flatMap(modulesFor);

  return { finalUrl: location.href, title: document.title, links, images, textBlocks, modules };
}
