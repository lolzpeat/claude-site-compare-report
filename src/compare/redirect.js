const normUrl = (u) => {
  const url = new URL(u);
  return (url.origin + url.pathname).replace(/\/+$/, '').toLowerCase();
};

export function detectRedirects(origEnv, migEnv) {
  const issues = [];
  for (const [side, env] of [['original', origEnv], ['migrated', migEnv]]) {
    if (!env.snapshot) continue;
    if (normUrl(env.requestedUrl) !== normUrl(env.snapshot.finalUrl)) {
      issues.push({
        category: 'broken-link', severity: 'High',
        description: `The ${side} URL redirected: requested ${env.requestedUrl} but landed on ${env.snapshot.finalUrl}`,
        location: `${side} redirect`,
        original: `requested: ${env.requestedUrl}`, migrated: `landed: ${env.snapshot.finalUrl}`,
      });
    }
  }
  return issues;
}
