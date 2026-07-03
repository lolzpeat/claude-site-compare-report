import { normalizeText, thaiRatio } from '../lib/text-utils.js';
import { migLinkStatusIssues } from './links.js';

// A News-Detail article page (e.g. .../News-and-Media/News-Detail?id=GUID migrated to
// .../news-and-media/<year>/<guid>). These get a dedicated element-level comparison:
// the generic link/text/module comparators only manufacture false positives here
// (see docs/superpowers/specs/2026-07-03-news-detail-comparator-design.md).

const HEADLINE_MIN_CHARS = 12;
const CONTENT_MIN_CHARS = 200;
const DATE_MAX_CHARS = 40;
const INVALID_DATE = 'Invalid Date';

const THAI_MONTH_RE =
  /(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/;

const SHARE_LABELS = new Set(['facebook', 'x', 'twitter', 'line', 'linkedin']);
const SHARE_HREF_RE = /facebook\.com|twitter\.com|x\.com|line\.me|linkedin\.com|social-share|\/share\b/i;

const NEWS_DETAIL_MIG_RE =
  /\/news-and-media\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const NEWS_DETAIL_ORIG_RE = /news-and-media\/news-detail/i;

const pathOf = (u) => {
  try {
    return new URL(u).pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return '';
  }
};

export function isNewsDetail(origEnv, migEnv) {
  const migUrl = migEnv?.snapshot?.finalUrl ?? migEnv?.requestedUrl ?? '';
  const origUrl = origEnv?.requestedUrl ?? origEnv?.snapshot?.finalUrl ?? '';
  return NEWS_DETAIL_MIG_RE.test(migUrl) || NEWS_DETAIL_ORIG_RE.test(origUrl);
}

// Breadcrumb trail = links whose pathname is a strict ancestor of the article path.
// Language-agnostic (works on both /th-TH/... and /th/...); the Thai-vs-English check
// reads the link text afterwards. Deduped by path, home root (`/th`, `/th-th`) dropped
// as too generic.
function extractBreadcrumb(snapshot) {
  const articlePath = pathOf(snapshot.finalUrl);
  if (!articlePath) return [];
  const seen = new Set();
  const trail = [];
  for (const l of snapshot.links ?? []) {
    const p = pathOf(l.href);
    if (!p || p === articlePath || !articlePath.startsWith(`${p}/`)) continue;
    if (p.split('/').filter(Boolean).length < 2) continue; // skip /th home root
    if (seen.has(p)) continue;
    seen.add(p);
    trail.push({ text: normalizeText(l.text ?? ''), href: l.href });
  }
  return trail;
}

export function extractArticle(snapshot) {
  const main = (snapshot.textBlocks ?? [])
    .filter((b) => b.region === 'main')
    .map((b) => normalizeText(b.text ?? ''))
    .filter(Boolean);

  const headline = main.find((t) => t.length >= HEADLINE_MIN_CHARS) ?? null;
  const date =
    main.find((t) => t.length < DATE_MAX_CHARS && (t === INVALID_DATE || THAI_MONTH_RE.test(t))) ??
    null;
  const bodyText = main.reduce((longest, t) => (t.length > longest.length ? t : longest), '');

  const shareLinks = (snapshot.links ?? []).filter((l) => {
    const t = normalizeText(l.text ?? '').toLowerCase();
    return SHARE_LABELS.has(t) || SHARE_HREF_RE.test(l.href ?? '');
  });

  // Content images = the article's own images only. Module extraction is chrome-aware
  // and excludes the related-news thumbnail rail, so this avoids counting chrome/
  // thumbnail images (raw snapshot.images is polluted: ~6 orig vs ~17 migrated).
  const contentImages = [
    ...new Set(
      (snapshot.modules ?? [])
        .flatMap((m) => m.imageFiles ?? [])
        .map((f) => String(f).toLowerCase()),
    ),
  ];

  return {
    headline,
    date,
    bodyText: bodyText || null,
    breadcrumb: extractBreadcrumb(snapshot),
    shareLinks,
    contentImages,
  };
}

export function compareNewsDetail(origEnv, migEnv) {
  const issues = [];
  const o = extractArticle(origEnv.snapshot);
  const m = extractArticle(migEnv.snapshot);

  // Article not detected at all on migrated — one issue, not six.
  if (!m.headline && (!m.bodyText || m.bodyText.length < CONTENT_MIN_CHARS)) {
    issues.push({
      category: 'news-element', severity: 'High',
      description: 'Article content not detected on migrated page',
      location: 'news:content',
      original: 'article present', migrated: '(no article content)', region: 'main',
    });
    return [...issues, ...migLinkStatusIssues(migEnv)];
  }

  // Headline — present + matches original.
  if (!m.headline) {
    issues.push({
      category: 'news-element', severity: 'High',
      description: 'News headline missing on migrated', location: 'news:headline',
      original: o.headline ?? '(none)', migrated: '(missing)', region: 'main',
    });
  } else if (o.headline && normalizeText(o.headline) !== normalizeText(m.headline)) {
    issues.push({
      category: 'news-element', severity: 'High',
      description: 'News headline differs from original', location: 'news:headline',
      original: o.headline, migrated: m.headline, region: 'main',
    });
  }

  // Date — must be a valid Thai date; catches literal "Invalid Date".
  if (!m.date || m.date === INVALID_DATE) {
    issues.push({
      category: 'news-element', severity: 'High',
      description: m.date === INVALID_DATE
        ? 'News date renders as "Invalid Date" on migrated'
        : 'News date missing on migrated',
      location: 'news:date',
      original: o.date ?? '(none)', migrated: m.date ?? '(missing)', region: 'main',
    });
  } else if (o.date && normalizeText(o.date) !== normalizeText(m.date)) {
    issues.push({
      category: 'news-element', severity: 'Medium',
      description: 'News date differs from original', location: 'news:date',
      original: o.date, migrated: m.date, region: 'main',
    });
  }

  // Content body — present and not drastically shorter.
  const migLen = (m.bodyText ?? '').length;
  const origLen = (o.bodyText ?? '').length;
  if (migLen < CONTENT_MIN_CHARS) {
    issues.push({
      category: 'news-element', severity: 'High',
      description: `News body content missing or too short on migrated (${migLen} chars)`,
      location: 'news:content',
      original: `${origLen} chars`, migrated: `${migLen} chars`, region: 'main',
    });
  } else if (origLen > 0 && migLen < origLen * 0.5) {
    issues.push({
      category: 'news-element', severity: 'Medium',
      description: `News body content much shorter on migrated (${migLen} vs ${origLen} chars)`,
      location: 'news:content',
      original: `${origLen} chars`, migrated: `${migLen} chars`, region: 'main',
    });
  }

  // Content image — article's own image present + same file as original.
  if (o.contentImages.length > 0 && m.contentImages.length === 0) {
    issues.push({
      category: 'news-element', severity: 'Medium',
      description: 'Content image missing on migrated article', location: 'news:image',
      original: o.contentImages[0], migrated: '(none)', region: 'main',
    });
  } else if (o.contentImages.length > 0 && m.contentImages.length > 0) {
    const shared = o.contentImages.some((f) => m.contentImages.includes(f));
    if (!shared) {
      issues.push({
        category: 'news-element', severity: 'Medium',
        description: 'Content image differs on migrated article', location: 'news:image',
        original: o.contentImages[0], migrated: m.contentImages[0], region: 'main',
      });
    }
  }

  // Breadcrumb — present, and localized to Thai when the original is Thai.
  if (m.breadcrumb.length === 0 && o.breadcrumb.length > 0) {
    issues.push({
      category: 'news-element', severity: 'Medium',
      description: 'Breadcrumb missing on migrated', location: 'news:breadcrumb',
      original: `${o.breadcrumb.length} items`, migrated: '(none)', region: 'main',
    });
  } else if (m.breadcrumb.length > 0) {
    const oText = o.breadcrumb.map((l) => l.text).join(' ');
    const mText = m.breadcrumb.map((l) => l.text).join(' ');
    if (thaiRatio(oText) > 0.5 && thaiRatio(mText) < 0.2) {
      issues.push({
        category: 'news-element', severity: 'Low',
        description: 'Breadcrumb not localized to Thai on migrated', location: 'news:breadcrumb',
        original: oText.slice(0, 80), migrated: mText.slice(0, 80), region: 'main',
      });
    }
  }

  // Share buttons — present on migrated when the original has them.
  if (o.shareLinks.length > 0 && m.shareLinks.length === 0) {
    const names = o.shareLinks.map((l) => normalizeText(l.text)).filter(Boolean).join(', ');
    issues.push({
      category: 'news-element', severity: 'Medium',
      description: 'Social share buttons missing on migrated', location: 'news:share',
      original: names || `${o.shareLinks.length} share links`, migrated: '(none)', region: 'main',
    });
  }

  return [...issues, ...migLinkStatusIssues(migEnv)];
}
