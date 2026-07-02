export function mergeIssues(det, ai) {
  const issues = [...det.issues, ...(ai?.issues ?? [])];
  const status = det.status === 'Capture Failed'
    ? 'Capture Failed'
    : issues.length === 0 ? 'Passed' : 'Failed';
  return { pairId: det.pairId, status, issues };
}
