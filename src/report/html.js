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

const countsByCategory = (issues) => {
  const counts = {};
  for (const i of issues) counts[i.category] = (counts[i.category] ?? 0) + 1;
  return Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join(', ') || '—';
};

export function renderIndex(rows) {
  const trs = rows.map(({ pair, result }) => `
    <tr>
      <td><a href="${esc(pair.id)}.html">${esc(pair.id)}</a></td>
      <td>${esc(pair.category)} / ${esc(pair.subCategory)}</td>
      <td class="${esc(result.status.split(' ')[0])}">${esc(result.status)}</td>
      <td>${result.issues.length}</td>
      <td>${esc(countsByCategory(result.issues))}</td>
    </tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Migration Comparison Report</title>
<style>${CSS}</style></head><body>
<h1>Migration Comparison Report</h1>
<table><tr><th>Page</th><th>Category</th><th>Status</th><th>Issues</th><th>By category</th></tr>${trs}</table>
</body></html>`;
}

export function renderDetail(pair, result) {
  const issueRows = result.issues.map((i) => `
    <tr class="sev-${esc(i.severity)}">
      <td>${esc(i.category)}</td><td>${esc(i.severity)}</td>
      <td>${esc(i.description)}</td><td>${esc(i.location)}</td>
    </tr>`).join('');
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
<table><tr><th>Category</th><th>Severity</th><th>Description</th><th>Location</th></tr>${issueRows}</table>
<script>${SYNC_SCROLL}</script>
</body></html>`;
}
