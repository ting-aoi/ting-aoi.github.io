// ═══════════════════════════════════════════════════════
// search.js — Futaba search utilities
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT;

// SC2TC_MAP: { char: [variant1, variant2, ...] }
let SC2TC_MAP = {};

FT.loadSc2tc = async function() {
  try {
    const r = await fetch('./assets/sc2tc.json', { cache: 'force-cache' });
    if (!r.ok) return;
    const raw = await r.json();
    SC2TC_MAP = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (k.length !== 1) return; // skip comment/meta keys
      SC2TC_MAP[k] = Array.isArray(v) ? v : [v];
    });
  } catch {}
};

// Expand a string into all variant combinations.
// Each character is replaced by [original, ...mapped variants].
// Cartesian product, capped at 64 to avoid blowup on long strings.
function sc2tcVariants(str) {
  const s = String(str).toLowerCase();
  const charOpts = [...s].map(ch => {
    const variants = SC2TC_MAP[ch];
    if (!variants || variants.length === 0) return [ch];
    return [...new Set([ch, ...variants.map(v => v.toLowerCase())])];
  });

  let results = [''];
  for (const opts of charOpts) {
    const next = [];
    for (const prefix of results) {
      for (const opt of opts) {
        next.push(prefix + opt);
        if (next.length >= 64) break;
      }
      if (next.length >= 64) break;
    }
    results = next;
  }
  return [...new Set(results)];
}

// Normalise a string into a pipe-joined list of all SC→TC variants.
// Used for both haystack (book data) and needle (query).
function normalizeSearch(str) {
  return sc2tcVariants(str).join('|');
}

// Check if any needle variant appears in any haystack variant.
function searchMatch(hayN, needleN) {
  const hays    = hayN.split('|');
  const needles = needleN.split('|');
  return needles.some(n => hays.some(h => h.includes(n)));
}

FT.parseSearch = function(q) {
  const tags = [], chars = [];
  const rest = q
    .replace(/#(\S+)/g, (_, t)  => { tags.push(normalizeSearch(t));  return ''; })
    .replace(/@(\S+)/g, (_, ch) => { chars.push(ch.toLowerCase());   return ''; })
    .trim();
  return { tags, chars, rest: normalizeSearch(rest) };
};


// Match a book against parsed search tokens
FT.bookMatchesSearch = function(b, parsed) {
  const { tags, chars, rest } = parsed;
  const titleN  = normalizeSearch(b.title  || '');
  const authorN = normalizeSearch(b.author || '');

  if (tags.length) {
    const bookTagLabels = (b.tags || []).map(id => normalizeSearch(FT.tagFullLabel(id)));
    if (!tags.every(tk => bookTagLabels.some(tl => searchMatch(tl, tk)))) return false;
  }
  if (chars.length) {
    if (!chars.every(ck =>
      (b.characters || []).some(c => c.name.toLowerCase().includes(ck))
    )) return false;
  }
  if (rest && !searchMatch(titleN, rest) && !searchMatch(authorN, rest)) return false;
  return true;
};

// ── 重複書偵測：找出書名與輸入相似的現有書評 ──
// 相似 = 簡繁正規化後，一方包含另一方（且長度 >= 2）
FT.findSimilarBooks = function(title, excludeId) {
  title = String(title||'').trim();
  if (title.length < 2) return [];
  const qN = normalizeSearch(title.toLowerCase());
  return Object.values(FT.books).filter(b => {
    if (b.id === excludeId || !b.title) return false;
    const tN = normalizeSearch(b.title.toLowerCase());
    return searchMatch(tN, qN) || searchMatch(qN, tN);
  }).slice(0, 3);
};
