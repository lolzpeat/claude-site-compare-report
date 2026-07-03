#!/usr/bin/env python3
"""Generate pages.csv from the master spreadsheet (input/BBL_pages.xlsx).

The workbook has two sheets, each becoming a report "sheet" group:
  - "TH Pages - Categorized"  -> categorized site pages (Personal, Business, ...)
  - "News & Media Articles"   -> News-Detail articles (?id=GUID)

Output columns: id, originalUrl, migratedUrl, category, subCategory, sheet
IDs are collision-free: categorized pages slug the migrated path (last segment,
falling back to parent-leaf on clash); news articles use the full GUID.

Usage: python3 scripts/gen-pages.py [input/BBL_pages.xlsx] > pages.csv
"""
import sys, io, re, zipfile, csv

XLSX = sys.argv[1] if len(sys.argv) > 1 else "input/BBL_pages.xlsx"
CATEGORIZED_SHEET = "TH Pages - Categorized"
NEWS_SHEET = "News & Media Articles"


def load_rows(path):
    z = zipfile.ZipFile(path)
    sx = z.read("xl/sharedStrings.xml").decode("utf-8", "ignore")
    def si_text(si):
        s = "".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S))
        for a, b in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")]:
            s = s.replace(a, b)
        return s
    ss = [si_text(s) for s in re.findall(r"<si>(.*?)</si>", sx, re.S)]

    def col_idx(ref):
        letters = re.match(r"([A-Z]+)\d+", ref).group(1)
        n = 0
        for ch in letters:
            n = n * 26 + (ord(ch) - 64)
        return n - 1

    def sheet_rows(name):
        xml = z.read(f"xl/worksheets/{name}").decode("utf-8", "ignore")
        rows = []
        for rm in re.findall(r"<row[^>]*>(.*?)</row>", xml, re.S):
            cells = {}
            for cm in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*)>(.*?)</c>', rm, re.S):
                ref, attr, body = cm.group(1), cm.group(2), cm.group(3)
                v = re.search(r"<v>(.*?)</v>", body)
                if not v:
                    continue
                val = v.group(1)
                if 't="s"' in attr:
                    val = ss[int(val)]
                cells[col_idx(ref)] = val
            width = max(cells) + 1 if cells else 0
            rows.append([cells.get(i, "") for i in range(width)])
        return rows

    return sheet_rows("sheet1.xml"), sheet_rows("sheet2.xml")


def clean_url(u):
    return u.replace("\\&", "&").replace("\\\\", "").strip()


def slug_from_path(url):
    m = re.search(r"prod-aem\.bangkokbank\.com/th/(.+?)/?$", url)
    if not m:
        return None
    return m.group(1).strip("/").split("/")  # path segments after /th/


def guid_of(url):
    m = re.search(r"[?&]id=([0-9A-Fa-f-]{36})", url)
    return m.group(1).lower() if m else None


def main():
    s1, s2 = load_rows(XLSX)
    out = []
    used = set()

    def add(pid, orig, mig, cat, sub, sheet):
        if pid in used:
            return  # skip exact dup id (same page listed twice)
        used.add(pid)
        out.append([pid, orig, mig, cat, sub, sheet])

    # --- sheet1: categorized pages (data starts after the 2-line title + header) ---
    for r in s1:
        orig = clean_url(r[0] if len(r) > 0 else "")
        mig = clean_url(r[1] if len(r) > 1 else "")
        if not orig.startswith("http") or "prod-aem" not in mig:
            continue
        cat = (r[3] if len(r) > 3 else "").strip()
        sub = (r[4] if len(r) > 4 else "").strip()
        segs = slug_from_path(mig)
        if not segs:
            continue
        pid = segs[-1]
        if pid in used and len(segs) >= 2:
            pid = f"{segs[-2]}-{segs[-1]}"
        n = 2
        while pid in used and len(segs) >= n + 1:
            n += 1
            pid = "-".join(segs[-n:])
        add(pid, orig, mig, cat, sub, CATEGORIZED_SHEET)

    # --- sheet2: news-detail articles ---
    for r in s2:
        orig = clean_url(r[0] if len(r) > 0 else "")
        mig = clean_url(r[1] if len(r) > 1 else "")
        if not orig.startswith("http") or "prod-aem" not in mig:
            continue
        g = guid_of(orig) or (mig.rstrip("/").split("/")[-1] if re.search(r"[0-9a-f-]{36}$", mig) else None)
        if not g:
            continue
        add(f"news-detail-{g}", orig, mig, "About Us", "News & Media", NEWS_SHEET)

    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(["id", "originalUrl", "migratedUrl", "category", "subCategory", "sheet"])
    w.writerows(out)
    counts = {}
    for row in out:
        counts[row[5]] = counts.get(row[5], 0) + 1
    sys.stderr.write(f"generated {len(out)} rows: {counts}\n")


if __name__ == "__main__":
    main()
