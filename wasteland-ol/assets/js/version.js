// ═══════════════════════════════════════════════════════
// version.js — 廢土 Online 版本常數
// VERSION 由 bump.py 依 index.html 的版本錨點同步改寫；BUILD 為打包秒數時戳。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  WOL.VERSION = 'v0.1a';
  WOL.BUILD = '1786401398';
})(typeof window !== 'undefined' ? window : globalThis);
