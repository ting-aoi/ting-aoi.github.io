// ═══════════════════════════════════════════════════════
// search.js — Futaba search utilities
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT;

// SC2TC_MAP: { char: [variant1, variant2, ...] }
let SC2TC_MAP = {};

// v3.7a：載入失敗原本完全靜默，搜尋悄悄失去簡繁互通、使用者只覺得「搜不到」。
// 記錄狀態供開機時提示（不擋流程，搜尋仍以原字比對）。
FT.sc2tcReady = false;
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
    FT.sc2tcReady = Object.keys(SC2TC_MAP).length > 0;
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

// Full-text match: haystack is long free text (review/notes…), so it must NOT
// go through sc2tcVariants (the 64-variant cap would truncate it). Only the
// needle is variant-expanded; the haystack is matched as plain lowercase.
function fullTextMatch(hayRaw, needleN) {
  const hay = String(hayRaw).toLowerCase();
  return needleN.split('|').some(n => hay.includes(n));
}

// v3.7a：前綴只在「詞首」（字串開頭或空白後）才生效——否則 abc:def、a#b
// 這類夾在字中間的符號會被誤當成前綴，把查詢拆爛。前導空白原樣保留，
// 免得相鄰的兩個前綴黏成一個詞。
const PREFIX = ch => new RegExp('(^|\\s)' + ch + '(\\S+)', 'g');
FT.parseSearch = function(q) {
  const tags = [], chars = [], fulls = [], stats = [];
  const rest = q
    .replace(PREFIX('#'), (_, sp, t)  => { tags.push(normalizeSearch(t));  return sp; })
    .replace(PREFIX('@'), (_, sp, ch) => { chars.push(normalizeSearch(ch)); return sp; })
    .replace(PREFIX('~'), (_, sp, f)  => { fulls.push(normalizeSearch(f)); return sp; })
    .replace(PREFIX(':'), (_, sp, s)  => { stats.push(normalizeSearch(s)); return sp; })
    .trim();
  return { tags, chars, fulls, stats, rest: normalizeSearch(rest) };
};


// Match a book against parsed search tokens
FT.bookMatchesSearch = function(b, parsed) {
  const { tags, chars, fulls, stats, rest } = parsed;
  const titleN  = normalizeSearch(b.title  || '');
  const authorN = normalizeSearch(b.author || '');

  if (tags.length) {
    const bookTagLabels = (b.tags || []).map(id => normalizeSearch(FT.tagFullLabel(id)));
    if (!tags.every(tk => bookTagLabels.some(tl => searchMatch(tl, tk)))) return false;
  }
  if (chars.length) {
    if (!chars.every(ck =>
      (b.characters || []).some(c => searchMatch(normalizeSearch(c.name || ''), ck))
    )) return false;
  }
  if (stats && stats.length) {
    // :狀態 — 比對作品狀態＋聽書狀態＋我的進度，多詞 AND
    const statFields = [b.workStatus, b.audioStatus, b.myProgress]
                       .filter(Boolean).map(s => normalizeSearch(s));
    if (!stats.every(sk => statFields.some(sf => searchMatch(sf, sk)))) return false;
  }
  if (fulls && fulls.length) {
    // ~keyword full-text: 簡介＋心得＋備註＋角色描述，多詞 AND（與 #tag 一致）
    const body = [b.synopsis, b.review, b.notes,
                  ...(b.characters || []).map(c => c.desc)]
                 .filter(Boolean).join('\n');
    if (!fulls.every(fk => fullTextMatch(body, fk))) return false;
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
