#!/usr/bin/env bash
# Deploy the static HTML report to Vercel.
#
# The report lives under output/ (gitignored), so this is a direct folder deploy —
# NOT git-connected auto-deploy, and it can't be rebuilt on Vercel (regeneration needs
# the uncommitted snapshots). Re-run this whenever you refresh the report.
#
# Prereqs (one-time, run yourself): `npx vercel login`
#
# Deploy root is output/ so /report/ and /shots/ are siblings (detail pages reference
# ../../shots). Entry is https://<url>/report/ — the / redirect (output/index.html,
# written by run-report) forwards there.
set -euo pipefail
cd "$(dirname "$0")/.."

node src/run-report.js   # refresh dashboards + the / redirect + .vercelignore

cd output
exec npx vercel deploy --prod --yes
