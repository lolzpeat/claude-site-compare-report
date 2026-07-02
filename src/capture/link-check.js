// Checks link statuses from INSIDE the page (same-origin fetch passes the WAF).
// Only pass same-origin URLs; cross-origin fetches return 0 (CORS) by design.
export async function checkLinks(page, urls) {
  return page.evaluate(async (list) => {
    const out = {};
    const BATCH = 5;
    for (let i = 0; i < list.length; i += BATCH) {
      await Promise.all(
        list.slice(i, i + BATCH).map(async (u) => {
          try {
            let res = await fetch(u, { method: 'HEAD', redirect: 'follow' });
            if (res.status === 405 || res.status === 501) {
              res = await fetch(u, { method: 'GET', redirect: 'follow' });
            }
            out[u] = res.status;
          } catch {
            out[u] = 0;
          }
        }),
      );
    }
    return out;
  }, urls);
}
