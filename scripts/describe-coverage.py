#!/usr/bin/env python3
"""Measure describeIssue rule coverage against real det JSON.

Runs every distinct description in output/issues/det/ through
src/report/describe.js (via a node one-liner) and reports the untranslated
remainder. Acceptance: 0 untranslated among patterns the CURRENT comparators
emit (stale patterns from old JSON may remain and are listed for review).
"""
import json, glob, subprocess, sys

descs = set()
for f in glob.glob('output/issues/det/*.json'):
    d = json.load(open(f))
    for i in (d.get('issues') or []) + (d.get('chromeIssues') or []):
        descs.add(i.get('description', ''))

node = subprocess.run(
    ['node', '--input-type=module', '-e',
     'import { describeIssue } from "./src/report/describe.js";'
     'import fs from "node:fs";'
     'const ds = JSON.parse(fs.readFileSync(0, "utf8"));'
     'process.stdout.write(JSON.stringify(ds.filter(d => describeIssue({description: d}) === d)));'],
    input=json.dumps(sorted(descs)), capture_output=True, text=True, check=True)

untranslated = json.loads(node.stdout)
print(f'distinct descriptions: {len(descs)}, untranslated: {len(untranslated)}')
for d in untranslated[:30]:
    print('  MISS |', d[:110])
sys.exit(0 if not untranslated else 1)
