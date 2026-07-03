const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const CSS = `
  body{font-family:-apple-system,'Segoe UI',sans-serif;margin:24px;color:#111}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
  th{background:#f5f5f5}
  .Passed{color:#0a7a2f;font-weight:600}.Failed{color:#b00020;font-weight:600}
  .Capture{color:#b06a00;font-weight:600}.Not{color:#b00020;font-weight:600}.Retired{color:#7a4a00;font-weight:600}
  .reach{background:#dbe7ff;color:#1a3a7a}
  .sev-High{background:#fde8e8}.sev-Medium{background:#fef3e2}.sev-Low{background:#eef}
  details.cat{border:1px solid #ddd;border-radius:6px;margin:10px 0;background:#fafafa}
  details.cat summary{cursor:pointer;padding:10px 12px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  details.cat[open]>summary{border-bottom:1px solid #ddd}
  details.cat table{border:none}
  .chip{font-size:12px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap}
  .chip-High{background:#fde8e8;color:#b00020}
  .chip-Medium{background:#fef3e2;color:#b06a00}
  .chip-Low{background:#eef;color:#334}
  .chip-count{background:#e4e4e4;color:#333}
  .region-tag{background:#eef;color:#334}
  .val{font-size:13px;max-width:340px;word-break:break-word}
  .val-orig{color:#0a7a2f}.val-mig{color:#b00020}
  .thumb{display:block;max-height:80px;max-width:100%;margin-top:6px;border:1px solid #ccc}
  .shots{display:flex;gap:12px}
  .shots>div{flex:1;height:80vh;overflow-y:scroll;border:1px solid #ccc}
  .shots img{width:100%;display:block}
  .cap{font-weight:600;margin:4px 0}
`;

const SYNC_SCROLL = `
  const [a,b]=document.querySelectorAll('.shots>div');
  let lock=false;
  const sync=(src,dst)=>()=>{ if(lock)return; lock=true;
    dst.scrollTop=src.scrollTop/(src.scrollHeight-src.clientHeight||1)*(dst.scrollHeight-dst.clientHeight||0);
    requestAnimationFrame(()=>{lock=false}); };
  a.addEventListener('scroll',sync(a,b)); b.addEventListener('scroll',sync(b,a));
`;

const SEVERITY_ORDER = ['High', 'Medium', 'Low'];
const severityRank = (sev) => {
  const rank = SEVERITY_ORDER.indexOf(sev);
  return rank === -1 ? SEVERITY_ORDER.length : rank;
};

const categoryChips = (issues) => {
  const counts = {};
  for (const i of issues) counts[i.category] = (counts[i.category] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<span class="chip chip-count">${esc(c)}: ${n}</span>`)
    .join(' ') || '—';
};

const severityChips = (issues) =>
  SEVERITY_ORDER
    .map((sev) => [sev, issues.filter((i) => i.severity === sev).length])
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `<span class="chip chip-${esc(sev)}">${n} ${esc(sev)}</span>`)
    .join(' ');

const groupIssues = (issues) => {
  const byCategory = new Map();
  for (const i of issues) {
    byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);
  }
  return [...byCategory.entries()]
    .map(([category, items]) => ({
      category,
      items: [...items].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
      hasHigh: items.some((i) => i.severity === 'High'),
    }))
    .sort((a, b) => (b.hasHigh - a.hasHigh) || (b.items.length - a.items.length));
};

const thumb = (src) => (src && /^https?:/.test(src))
  ? `<a href="${esc(src)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(src)}" loading="lazy" alt=""></a>`
  : '';

const issueRows = (items) => items.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(i.severity)}</td><td>${esc(i.description)}</td>
      <td class="val val-orig">${esc(i.original ?? '—')}${thumb(i.originalSrc)}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}${thumb(i.migratedSrc)}</td>
      <td>${esc(i.location)}${i.region ? ` <span class="chip region-tag">${esc(i.region)}</span>` : ''}</td>
    </tr>`).join('');

const groupTables = (issues) => groupIssues(issues).map((g) => `
<details class="cat"${g.hasHigh ? ' open' : ''}>
  <summary>${esc(g.category)} <span class="chip chip-count">${g.items.length}</span> ${severityChips(g.items)}</summary>
  <table><tr><th>Severity</th><th>Description</th><th>Original</th><th>Migrated</th><th>Location</th></tr>${issueRows(g.items)}</table>
</details>`).join('');

export function renderIndex(rows, systemicCount) {
  const trs = rows.map(({ pair, result, own, systemicHits }) => `
    <tr>
      <td><a href="${esc(pair.id)}.html">${esc(pair.id)}</a></td>
      <td>${esc(pair.category)} / ${esc(pair.subCategory)}</td>
      <td class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</td>
      <td>${own.length}</td>
      <td>${systemicHits}</td>
      <td>${categoryChips(own)}</td>
    </tr>`).join('');
  const banner = systemicCount > 0
    ? `<p><strong>${systemicCount} site-wide issues</strong> affect pages across the site — <a href="systemic.html">see the systemic report</a>.</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Migration Comparison Report</title>
<style>${CSS}</style></head><body>
<h1>Migration Comparison Report</h1>
${banner}
<table><tr><th>Page</th><th>Category</th><th>Status</th><th>Own</th><th>Site-wide</th><th>Own by category</th></tr>${trs}</table>
</body></html>`;
}

export function renderDetail(pair, result, own, systemicHits) {
  const ref = systemicHits > 0
    ? `<p>+${systemicHits} site-wide issues also affect this page — <a href="systemic.html">see the systemic report</a>.</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(pair.id)}</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">← back</a></p>
<h1>${esc(pair.id)} — <span class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</span></h1>
<p>Original: <a href="${esc(pair.originalUrl)}">${esc(pair.originalUrl)}</a><br>
Migrated: <a href="${esc(pair.migratedUrl)}">${esc(pair.migratedUrl)}</a></p>
<div class="shots">
  <div><p class="cap">Original</p><img src="../shots/${esc(pair.id)}-orig.png" alt="original"></div>
  <div><p class="cap">Migrated</p><img src="../shots/${esc(pair.id)}-mig.png" alt="migrated"></div>
</div>
<h2>Own issues (${own.length})</h2>
${ref}
${groupTables(own) || '<p>No page-specific issues.</p>'}
<script>${SYNC_SCROLL}</script>
</body></html>`;
}

export function renderSystemic(systemic, comparableCount) {
  const byCat = new Map();
  for (const s of systemic) byCat.set(s.issue.category, [...(byCat.get(s.issue.category) ?? []), s]);
  const groups = [...byCat.entries()]
    .map(([category, entries]) => ({
      category,
      entries: [...entries].sort((a, b) => b.count - a.count || severityRank(a.issue.severity) - severityRank(b.issue.severity)),
      hasHigh: entries.some((e) => e.issue.severity === 'High'),
    }))
    .sort((a, b) => (b.hasHigh - a.hasHigh) || (b.entries.length - a.entries.length));

  const groupsHtml = groups.map((g) => `
<details class="cat"${g.hasHigh ? ' open' : ''}>
  <summary>${esc(g.category)} <span class="chip chip-count">${g.entries.length}</span></summary>
  <table><tr><th>Severity</th><th>Description</th><th>Original</th><th>Migrated</th><th>Reach</th><th>Affected pages</th></tr>${g.entries.map((s) => `
    <tr class="sev-${esc(s.issue.severity)}">
      <td>${esc(s.issue.severity)}</td><td>${esc(s.issue.description)}</td>
      <td class="val val-orig">${esc(s.issue.original ?? '—')}</td>
      <td class="val val-mig">${esc(s.issue.migrated ?? '—')}</td>
      <td><span class="chip reach">${s.count} / ${comparableCount}</span></td>
      <td>${s.pageIds.map((id) => `<a href="${esc(id)}.html">${esc(id)}</a>`).join(', ')}</td>
    </tr>`).join('')}</table>
</details>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Site-wide (systemic) issues</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">← back</a></p>
<h1>Site-wide issues (${systemic.length})</h1>
<p>Issues appearing on at least 60% of comparable pages. Fix these once at the template level.</p>
${groupsHtml || '<p>No site-wide issues.</p>'}
</body></html>`;
}
