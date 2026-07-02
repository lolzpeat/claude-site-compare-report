const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const CSS = `
  body{font-family:-apple-system,'Segoe UI',sans-serif;margin:24px;color:#111}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
  th{background:#f5f5f5}
  .Passed{color:#0a7a2f;font-weight:600}.Failed{color:#b00020;font-weight:600}
  .Capture{color:#b06a00;font-weight:600}
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

export function renderIndex(rows) {
  const trs = rows.map(({ pair, result }) => `
    <tr>
      <td><a href="${esc(pair.id)}.html">${esc(pair.id)}</a></td>
      <td>${esc(pair.category)} / ${esc(pair.subCategory)}</td>
      <td class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</td>
      <td>${result.issues.length}</td>
      <td>${categoryChips(result.issues)}</td>
    </tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Migration Comparison Report</title>
<style>${CSS}</style></head><body>
<h1>Migration Comparison Report</h1>
<table><tr><th>Page</th><th>Category</th><th>Status</th><th>Issues</th><th>By category</th></tr>${trs}</table>
</body></html>`;
}

export function renderDetail(pair, result) {
  const groupsHtml = groupIssues(result.issues).map((g) => `
<details class="cat"${g.hasHigh ? ' open' : ''}>
  <summary>${esc(g.category)} <span class="chip chip-count">${g.items.length}</span> ${severityChips(g.items)}</summary>
  <table><tr><th>Severity</th><th>Description</th><th>Location</th></tr>${g.items.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(i.severity)}</td><td>${esc(i.description)}</td><td>${esc(i.location)}</td>
    </tr>`).join('')}</table>
</details>`).join('');
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
<h2>Issues (${result.issues.length})</h2>
${groupsHtml || '<p>No issues found.</p>'}
<script>${SYNC_SCROLL}</script>
</body></html>`;
}
