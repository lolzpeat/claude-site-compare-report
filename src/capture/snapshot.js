// Runs INSIDE the browser page via page.evaluate(extractSnapshot).
// Must stay self-contained: no imports, no outer-scope references.
export function extractSnapshot() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const abs = (u) => {
    try { return new URL(u, location.href).href; } catch { return null; }
  };

  const links = [...document.querySelectorAll('a[href]')]
    .map((a) => ({ href: abs(a.getAttribute('href')), text: norm(a.textContent).slice(0, 120) }))
    .filter((l) => l.href && /^https?:/.test(l.href));

  const images = [...document.querySelectorAll('img')]
    .map((img) => {
      const r = img.getBoundingClientRect();
      return {
        src: abs(img.currentSrc || img.src),
        naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        renderedWidth: Math.round(r.width), renderedHeight: Math.round(r.height),
      };
    })
    .filter((i) => i.src && i.renderedWidth > 0 && i.renderedHeight > 0);

  const textBlocks = [...document.querySelectorAll('h1,h2,h3,h4,p,li')]
    .map((el) => norm(el.textContent))
    .filter((t) => t.length > 1);

  const root = document.querySelector('main') || document.body;
  const modules = [...root.children]
    .filter((el) => el.getBoundingClientRect().height > 40)
    .map((el) => ({
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
    }));

  return { finalUrl: location.href, title: document.title, links, images, textBlocks, modules };
}
