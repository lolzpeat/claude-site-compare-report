export function mergeIssues(det, ai) {
  const issues = [...det.issues, ...(ai?.issues ?? [])];
  const STICKY = new Set(['Capture Failed', 'Not Migrated', 'Retired on Original']);
  const status = STICKY.has(det.status)
    ? det.status
    : issues.length === 0 ? 'Passed' : 'Failed';
  return {
    pairId: det.pairId, status, issues,
    chromeIssues: det.chromeIssues ?? [],
    chromeStats: det.chromeStats ?? [],
  };
}
