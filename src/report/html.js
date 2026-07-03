import { T, TH_HEAD, SEVERITY_LABEL, STATUS_LABEL, CATEGORY_LABEL, REGION_LABEL } from './labels.js';

export const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const sevText = (sev) => SEVERITY_LABEL[sev] ?? sev;
const statusText = (s) => STATUS_LABEL[s] ?? s;
const catText = (c) => CATEGORY_LABEL[c] ?? c;
const regionText = (r) => REGION_LABEL[r] ?? r;
const th = (label) => TH_HEAD[label] ?? label;
const tok = (status) => esc(status.split(' ')[0]); // stable single-word token for CSS

export const CSS = `
  :root{
    --bg:#eef1f6;--surface:#fff;--ink:#17203a;--muted:#5b6577;--line:#dce1ea;
    --accent:#2f4bd6;--accent-weak:#e7ebfb;
    --pass:#0a7a2f;--fail:#c02626;--notmig:#b0480a;--retired:#7a4a00;--capture:#a06a00;
    --hi:#c02626;--med:#b9770a;--low:#5b6577;
    --mono:ui-monospace,'SF Mono','Cascadia Mono',Menlo,Consolas,monospace;
    --sans:'Noto Sans Thai','Sarabun',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  }
  *{box-sizing:border-box}
  body{font-family:var(--sans);background:var(--bg);color:var(--ink);margin:0 auto;padding:24px;max-width:1200px;line-height:1.5}
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
  h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:0 0 4px}
  h2{font-size:16px;font-weight:600;margin:22px 0 8px}
  .muted{color:var(--muted)}
  code{font-family:var(--mono);font-size:.85em;background:#f0f2f7;padding:1px 5px;border-radius:4px;color:#33405e}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px}

  /* generic table (criteria & bare tables) */
  table{border-collapse:collapse;width:100%;font-size:13.5px;background:var(--surface)}
  th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  thead th,tr:first-child th{background:#f3f5f9;color:var(--muted);font-size:12px;font-weight:600}
  body>table,body>p+table{border:1px solid var(--line);border-radius:10px;overflow:hidden}

  /* top / stats */
  .toplinks{font-size:13px;color:var(--muted);margin:2px 0 16px}
  .stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
  .stat{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 12px;cursor:pointer;display:inline-flex;gap:6px;align-items:center;color:var(--ink)}
  .stat b{font-family:var(--mono);font-variant-numeric:tabular-nums}
  .stat:hover{border-color:var(--accent)}
  .stat.on{border-color:var(--accent);background:var(--accent-weak);box-shadow:inset 0 0 0 1px var(--accent)}
  .stat.total{cursor:default;border-style:dashed;color:var(--muted)}
  .stat.b-Passed b{color:var(--pass)} .stat.b-Failed b{color:var(--fail)} .stat.b-Not b{color:var(--notmig)}
  .stat.b-Retired b{color:var(--retired)} .stat.b-Capture b{color:var(--capture)}

  /* toolbar */
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0 0 12px}
  .toolbar input,.toolbar select{font:inherit;font-size:14px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:#fff;color:var(--ink)}
  .toolbar input#q{flex:1;min-width:180px}
  .toolbar button{font:inherit;font-size:13px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;color:var(--ink)}
  .toolbar button:hover{border-color:var(--accent);color:var(--accent)}
  .toolbar .spacer{flex:1}
  .toolbar .limit{font-size:13px;color:var(--muted);display:inline-flex;align-items:center;gap:6px}
  .toolbar .count{font-family:var(--mono);font-size:12.5px;color:var(--muted);white-space:nowrap}

  /* ledger */
  .ledger-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
  table.ledger{font-size:13.5px}
  table.ledger thead th{position:sticky;top:0;z-index:2;white-space:nowrap;cursor:pointer;user-select:none}
  table.ledger thead th.num{text-align:right}
  table.ledger thead th[data-key]:hover{color:var(--accent)}
  table.ledger thead th[aria-sort]::after{content:'▾';margin-left:6px;font-size:10px;color:var(--accent)}
  table.ledger thead th[aria-sort=ascending]::after{content:'▴'}
  table.ledger td{vertical-align:middle}
  table.ledger tbody tr:hover{background:#f7f9fc}
  td.num,.num{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
  .c-seq{border-left:3px solid transparent;color:var(--muted)}
  .r-Passed .c-seq{border-left-color:var(--pass)} .r-Failed .c-seq{border-left-color:var(--fail)}
  .r-Not .c-seq{border-left-color:var(--notmig)} .r-Retired .c-seq{border-left-color:var(--retired)}
  .r-Capture .c-seq{border-left-color:var(--capture)}
  .c-page a{font-weight:600}
  .badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:6px;white-space:nowrap}
  .b-Passed{background:#e3f4e9;color:var(--pass)} .b-Failed{background:#fbe6e6;color:var(--fail)}
  .b-Not{background:#fdeede;color:var(--notmig)} .b-Retired{background:#f6eede;color:var(--retired)}
  .b-Capture{background:#fbf0dc;color:var(--capture)}

  /* pager */
  .pager{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;margin:14px 0}
  .pager .pg{font:inherit;font-size:13px;border:1px solid var(--line);background:#fff;border-radius:7px;padding:6px 11px;cursor:pointer;color:var(--ink);font-variant-numeric:tabular-nums}
  .pager .pg:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
  .pager .pg.cur{background:var(--accent);border-color:var(--accent);color:#fff}
  .pager .pg:disabled{opacity:.4;cursor:default}
  .pager .pg-ellipsis{color:var(--muted);padding:0 2px}

  /* chips */
  .chip{font-size:12px;font-weight:600;padding:2px 8px;border-radius:8px;white-space:nowrap;display:inline-block;margin:1px 0}
  .chip-High{background:#fbe6e6;color:var(--hi)} .chip-Medium{background:#fbf0dc;color:var(--med)} .chip-Low{background:#eef;color:var(--low)}
  .chip-count{background:#eceff4;color:#33405e;font-family:var(--mono);font-variant-numeric:tabular-nums}
  .region-tag{background:#eef;color:#334}
  .reach{background:#e7ebfb;color:#26408c;font-family:var(--mono);font-variant-numeric:tabular-nums}
  .c-chips .chip{margin-right:3px}

  /* detail / systemic */
  details.cat{border:1px solid var(--line);border-radius:10px;margin:10px 0;background:var(--surface);overflow:hidden}
  details.cat summary{cursor:pointer;padding:11px 14px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  details.cat[open]>summary{border-bottom:1px solid var(--line);background:#f3f5f9}
  details.cat td{vertical-align:top}
  .sev-High{box-shadow:inset 3px 0 var(--hi)} .sev-Medium{box-shadow:inset 3px 0 var(--med)} .sev-Low{box-shadow:inset 3px 0 var(--low)}
  .val{font-size:13px;max-width:340px;word-break:break-word}
  .val-orig{color:var(--pass)} .val-mig{color:var(--fail)}
  .thumb{display:block;max-height:80px;max-width:100%;margin-top:6px;border:1px solid var(--line);border-radius:4px}
  .shots{display:flex;gap:12px;margin:10px 0}
  .shots>div{flex:1;height:80vh;overflow-y:scroll;border:1px solid var(--line);border-radius:8px;background:#fff}
  .shots img{width:100%;display:block}
  .cap{font-weight:600;margin:4px 0;color:var(--muted)}
  .Passed{color:var(--pass);font-weight:600} .Failed{color:var(--fail);font-weight:600}
  .Capture{color:var(--capture);font-weight:600} .Not{color:var(--notmig);font-weight:600} .Retired{color:var(--retired);font-weight:600}

  @media (max-width:640px){
    body{padding:14px}
    .toolbar input#q{flex-basis:100%}
  }
  @media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const SYNC_SCROLL = `
  const [a,b]=document.querySelectorAll('.shots>div');
  let lock=false;
  const sync=(src,dst)=>()=>{ if(lock)return; lock=true;
    dst.scrollTop=src.scrollTop/(src.scrollHeight-src.clientHeight||1)*(dst.scrollHeight-dst.clientHeight||0);
    requestAnimationFrame(()=>{lock=false}); };
  a.addEventListener('scroll',sync(a,b)); b.addEventListener('scroll',sync(b,a));
`;

// Client-side filter / search / sort / pagination over the ledger rows.
const INDEX_JS = `
(function(){
  var tbl=document.getElementById('pages'); if(!tbl) return;
  var tbody=tbl.tBodies[0], rows=[].slice.call(tbody.rows);
  var q=document.getElementById('q'), fStatus=document.getElementById('f-status'),
      fCat=document.getElementById('f-cat'), fLimit=document.getElementById('f-limit'),
      fClear=document.getElementById('f-clear'), count=document.getElementById('count'),
      pager=document.getElementById('pager'), stats=[].slice.call(document.querySelectorAll('.stat[data-status]'));
  var page=1, sortKey='seq', sortDir=1;
  var numeric={seq:1,own:1,sys:1}, tk={page:'sPage',cat:'sCat',status:'sStatus'};
  function val(r){ return numeric[sortKey]? (parseFloat(r.dataset[sortKey])||0) : (r.dataset[tk[sortKey]]||'').toLowerCase(); }
  function filtered(){
    var s=(q.value||'').trim().toLowerCase(), st=fStatus.value, c=fCat.value;
    return rows.filter(function(r){
      return (!s||r.dataset.search.indexOf(s)>=0)
        && (!st||r.dataset.status===st)
        && (!c||(' '+r.dataset.cats+' ').indexOf(' '+c+' ')>=0);
    });
  }
  function sorted(list){
    return list.slice().sort(function(a,b){ var av=val(a),bv=val(b); return av<bv?-sortDir:av>bv?sortDir:0; });
  }
  function pill(label,to,dis,cur){
    var b=document.createElement('button'); b.type='button'; b.textContent=label;
    b.className='pg'+(cur?' cur':''); if(dis)b.disabled=true;
    b.addEventListener('click',function(){page=to;render();}); return b;
  }
  function renderPager(pages){
    pager.innerHTML=''; if(pages<=1) return;
    pager.appendChild(pill('‹ ก่อนหน้า',page-1,page===1,false));
    for(var i=1;i<=pages;i++){
      if(i===1||i===pages||Math.abs(i-page)<=2){ pager.appendChild(pill(String(i),i,false,i===page)); }
      else if(i===2||i===pages-1){ var s=document.createElement('span'); s.className='pg-ellipsis'; s.textContent='…'; pager.appendChild(s); }
    }
    pager.appendChild(pill('ถัดไป ›',page+1,page===pages,false));
  }
  function render(){
    var list=sorted(filtered());
    var limit=fLimit.value==='all'?list.length:parseInt(fLimit.value,10);
    var pages=Math.max(1,Math.ceil(list.length/(limit||1)));
    if(page>pages)page=pages;
    var start=(page-1)*limit, end=limit?start+limit:list.length;
    rows.forEach(function(r){r.style.display='none';});
    list.slice(start,end).forEach(function(r){r.style.display='';tbody.appendChild(r);});
    count.textContent=list.length?('แสดง '+(start+1)+'–'+Math.min(end,list.length)+' จาก '+list.length):'ไม่พบรายการ';
    renderPager(pages);
  }
  tbl.tHead.querySelectorAll('th[data-key]').forEach(function(h){
    h.tabIndex=0;
    function act(){
      var k=h.dataset.key;
      if(sortKey===k)sortDir*=-1; else {sortKey=k;sortDir=1;}
      tbl.tHead.querySelectorAll('th').forEach(function(t){t.removeAttribute('aria-sort');});
      h.setAttribute('aria-sort',sortDir===1?'ascending':'descending');
      page=1; render();
    }
    h.addEventListener('click',act);
    h.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();act();} });
  });
  [q,fStatus,fCat,fLimit].forEach(function(el){ el.addEventListener('input',function(){page=1;render();}); });
  fClear.addEventListener('click',function(){ q.value='';fStatus.value='';fCat.value='';page=1; stats.forEach(function(s){s.classList.remove('on');}); render(); });
  stats.forEach(function(s){ s.addEventListener('click',function(){
    var st=s.dataset.status;
    if(fStatus.value===st){ fStatus.value=''; s.classList.remove('on'); }
    else { fStatus.value=st; stats.forEach(function(x){x.classList.remove('on');}); s.classList.add('on'); }
    page=1; render();
  }); });
  render();
})();
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
    .map(([c, n]) => `<span class="chip chip-count">${esc(catText(c))}: ${n}</span>`)
    .join(' ') || '—';
};

const severityChips = (issues) =>
  SEVERITY_ORDER
    .map((sev) => [sev, issues.filter((i) => i.severity === sev).length])
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `<span class="chip chip-${esc(sev)}">${n} ${esc(sevText(sev))}</span>`)
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
      <td>${esc(sevText(i.severity))}</td><td>${esc(i.description)}</td>
      <td class="val val-orig">${esc(i.original ?? '—')}${thumb(i.originalSrc)}</td>
      <td class="val val-mig">${esc(i.migrated ?? '—')}${thumb(i.migratedSrc)}</td>
      <td>${esc(i.location)}${i.region ? ` <span class="chip region-tag">${esc(regionText(i.region))}</span>` : ''}</td>
    </tr>`).join('');

const groupTables = (issues) => groupIssues(issues).map((g) => `
<details class="cat"${g.hasHigh ? ' open' : ''}>
  <summary>${esc(catText(g.category))} <span class="chip chip-count">${g.items.length}</span> ${severityChips(g.items)}</summary>
  <table><tr><th>${th('Severity')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th><th>${th('Location')}</th></tr>${issueRows(g.items)}</table>
</details>`).join('');

// Statuses in display order (only those present are shown).
const STATUS_ORDER = ['Passed', 'Failed', 'Not Migrated', 'Retired on Original', 'Capture Failed'];

export function renderIndex(rows, systemicCount) {
  const statusCounts = {};
  for (const r of rows) statusCounts[r.result.status] = (statusCounts[r.result.status] ?? 0) + 1;
  const presentStatuses = STATUS_ORDER.filter((s) => statusCounts[s]);

  const catsPresent = new Set();
  for (const r of rows) for (const i of r.own) catsPresent.add(i.category);
  const catOptions = [...catsPresent].sort();

  const statChips = presentStatuses
    .map((s) => `<button type="button" class="stat b-${tok(s)}" data-status="${esc(s)}">${esc(statusText(s))} <b>${statusCounts[s]}</b></button>`)
    .join('') + `<span class="stat total">รวม <b>${rows.length}</b> หน้า</span>`;

  const statusOpts = presentStatuses
    .map((s) => `<option value="${esc(s)}">${esc(statusText(s))} (${statusCounts[s]})</option>`).join('');
  const catOpts = catOptions
    .map((c) => `<option value="${esc(c)}">${esc(catText(c))}</option>`).join('');

  const trs = rows.map(({ pair, result, own, systemicHits }, i) => {
    const seq = i + 1;
    const st = result.status;
    const cats = [...new Set(own.map((x) => x.category))].join(' ');
    const search = `${pair.id} ${pair.category} ${pair.subCategory}`.toLowerCase();
    return `
    <tr class="row r-${tok(st)}" data-seq="${seq}" data-own="${own.length}" data-sys="${systemicHits}"
        data-status="${esc(st)}" data-cats="${esc(cats)}" data-search="${esc(search)}"
        data-s-page="${esc(pair.id.toLowerCase())}" data-s-cat="${esc((pair.category + ' ' + pair.subCategory).toLowerCase())}" data-s-status="${esc(statusText(st))}">
      <td class="c-seq num">${seq}</td>
      <td class="c-page"><a href="${esc(pair.id)}.html">${esc(pair.id)}</a></td>
      <td class="c-cat">${esc(pair.category)} <span class="muted">/ ${esc(pair.subCategory)}</span></td>
      <td class="c-status"><span class="badge b-${tok(st)}">${esc(statusText(st))}</span></td>
      <td class="num">${own.length}</td>
      <td class="num">${systemicHits}</td>
      <td class="c-chips">${categoryChips(own)}</td>
    </tr>`;
  }).join('');

  const systemicLink = systemicCount > 0
    ? ` · <a href="systemic.html">${systemicCount} ${T.bannerA} ${T.seeSystemic}</a>`
    : '';

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.reportTitle}</title>
<style>${CSS}</style></head><body>
<h1>${T.reportTitle}</h1>
<p class="toplinks"><a href="criteria.html">เกณฑ์การตรวจสอบ</a>${systemicLink}</p>
<div class="stats">${statChips}</div>
<div class="toolbar">
  <input id="q" type="search" placeholder="ค้นหาหน้า / หมวด…" aria-label="ค้นหา">
  <select id="f-status" aria-label="กรองสถานะ"><option value="">ทุกสถานะ</option>${statusOpts}</select>
  <select id="f-cat" aria-label="กรองหมวดที่พบ"><option value="">ทุกหมวด</option>${catOpts}</select>
  <button id="f-clear" type="button">ล้างตัวกรอง</button>
  <span class="spacer"></span>
  <label class="limit">แสดง <select id="f-limit"><option>10</option><option selected>25</option><option>50</option><option>100</option><option value="all">ทั้งหมด</option></select></label>
  <span id="count" class="count"></span>
</div>
<div class="ledger-wrap">
<table id="pages" class="ledger">
<thead><tr>
  <th data-key="seq" class="num" aria-sort="ascending">#</th>
  <th data-key="page">${th('Page')}</th>
  <th data-key="cat">${th('Category')}</th>
  <th data-key="status">${th('Status')}</th>
  <th data-key="own" class="num">${th('Own')}</th>
  <th data-key="sys" class="num">${th('Site-wide')}</th>
  <th>${th('Own by category')}</th>
</tr></thead>
<tbody>${trs}</tbody>
</table>
</div>
<nav id="pager" class="pager" aria-label="แบ่งหน้า"></nav>
<script>${INDEX_JS}</script>
</body></html>`;
}

// Top-level landing linking to one dashboard per sheet. Each sheet dashboard lives in
// its own subdirectory (report/<slug>/index.html), so the relative links inside
// renderIndex/renderDetail/renderSystemic resolve within that subdir unchanged.
export function renderLanding(sheets) {
  const cards = sheets.map((s) => {
    const chips = STATUS_ORDER.filter((st) => s.statusCounts[st])
      .map((st) => `<span class="badge b-${tok(st)}">${esc(statusText(st))} ${s.statusCounts[st]}</span>`)
      .join(' ');
    const sysline = s.systemicCount > 0
      ? `<p class="muted">${s.systemicCount} ${T.siteWideTitle}</p>` : '';
    return `<a class="sheet-card" href="${esc(s.slug)}/index.html">
      <h2>${esc(s.name)}</h2>
      <p class="big"><b>${s.total}</b> <span class="muted">หน้า</span></p>
      <div class="chips">${chips || '<span class="muted">—</span>'}</div>
      ${sysline}
    </a>`;
  }).join('');
  const extraCss = '.sheet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:16px}'
    + '.sheet-card{display:block;border:1px solid #d5d8dd;border-radius:10px;padding:20px;text-decoration:none;color:inherit;background:#fff;transition:box-shadow .15s,border-color .15s}'
    + '.sheet-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.08);border-color:#9aa0a6}'
    + '.sheet-card h2{margin:0 0 8px;font-size:1.1rem}.sheet-card .big{font-size:1.6rem;margin:.2rem 0}.sheet-card .chips{margin:.4rem 0;display:flex;gap:6px;flex-wrap:wrap}';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.reportTitle}</title>
<style>${CSS}${extraCss}</style></head><body>
<h1>${T.reportTitle}</h1>
<p class="toplinks">เลือกชุดหน้า (sheet) เพื่อดูรายงาน</p>
<div class="sheet-grid">${cards}</div>
</body></html>`;
}

export function renderDetail(pair, result, own, systemicHits) {
  const ref = systemicHits > 0
    ? `<p>+${systemicHits} ${T.refA} <a href="systemic.html">${T.seeSystemic}</a></p>`
    : '';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pair.id)}</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>${esc(pair.id)} — <span class="${tok(result.status)}">${esc(statusText(result.status))}</span></h1>
<p>${T.original}: <a href="${esc(pair.originalUrl)}">${esc(pair.originalUrl)}</a><br>
${T.migrated}: <a href="${esc(pair.migratedUrl)}">${esc(pair.migratedUrl)}</a></p>
<div class="shots">
  <div><p class="cap">${T.original}</p><img src="../shots/${esc(pair.id)}-orig.png" alt="original"></div>
  <div><p class="cap">${T.migrated}</p><img src="../shots/${esc(pair.id)}-mig.png" alt="migrated"></div>
</div>
<h2>${T.ownIssues} (${own.length})</h2>
${ref}
${groupTables(own) || `<p>${T.noOwnIssues}</p>`}
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
  <summary>${esc(catText(g.category))} <span class="chip chip-count">${g.entries.length}</span></summary>
  <table><tr><th>${th('Severity')}</th><th>${th('Description')}</th><th>${th('Original')}</th><th>${th('Migrated')}</th><th>${th('Reach')}</th><th>${th('Affected pages')}</th></tr>${g.entries.map((s) => `
    <tr class="sev-${esc(s.issue.severity)}">
      <td>${esc(sevText(s.issue.severity))}</td><td>${esc(s.issue.description)}</td>
      <td class="val val-orig">${esc(s.issue.original ?? '—')}</td>
      <td class="val val-mig">${esc(s.issue.migrated ?? '—')}</td>
      <td><span class="chip reach">${s.count} / ${comparableCount}</span></td>
      <td>${s.pageIds.map((id) => `<a href="${esc(id)}.html">${esc(id)}</a>`).join(', ')}</td>
    </tr>`).join('')}</table>
</details>`).join('');

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${T.siteWideTitle}</title>
<style>${CSS}</style></head><body>
<p><a href="index.html">${T.back}</a></p>
<h1>${T.siteWideTitle} (${systemic.length})</h1>
<p>${T.systemicExplainer}</p>
${groupsHtml || `<p>${T.noSiteWide}</p>`}
</body></html>`;
}
