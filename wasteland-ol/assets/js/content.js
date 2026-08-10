// ═══════════════════════════════════════════════════════
// content.js — 遊戲資料載入與 schema 驗證（零 DOM，Node 可直接 require）
// 內容表（怪物／道具／地點／配方）由 Ting 提供；**空表必須驗證通過**，
// UI 據此顯示「內容資料未載入」而不是壞掉。
// ═══════════════════════════════════════════════════════
(function (root) {
  'use strict';
  var WOL = root.WOL = root.WOL || {};
  var K = WOL.content = {};

  K.FILES = [
    { key: 'attributes', file: 'rules.attributes.json', kind: 'rules', need: ['attributes', 'derived'] },
    { key: 'survival',   file: 'rules.survival.json',   kind: 'rules', need: ['phases', 'overnight', 'debuffs'] },
    { key: 'combat',     file: 'rules.combat.json',     kind: 'rules', need: ['actions', 'retreat'] },
    { key: 'monsters',   file: 'monsters.json',  kind: 'table', list: 'monsters',  need: ['id', 'name', 'hp', 'atk', 'def', 'spd'] },
    { key: 'items',      file: 'items.json',     kind: 'table', list: 'items',     need: ['id', 'name', 'kind'] },
    { key: 'locations',  file: 'locations.json', kind: 'table', list: 'locations', need: ['id', 'name', 'actions'] },
    { key: 'recipes',    file: 'recipes.json',   kind: 'table', list: 'recipes',   need: ['id', 'name', 'cost', 'output'] }
  ];

  K.SCHEMA_VERSION = 1;

  K.spec = function (key) {
    for (var i = 0; i < K.FILES.length; i++) if (K.FILES[i].key === key) return K.FILES[i];
    return null;
  };

  // 回傳 { ok, errors:[] }。空的內容表是合法狀態，不算錯誤。
  K.validate = function (key, obj) {
    var spec = K.spec(key);
    var errors = [];
    if (!spec) return { ok: false, errors: ['未知資料檔：' + key] };
    if (!obj || typeof obj !== 'object') return { ok: false, errors: [spec.file + '：不是物件'] };
    if (obj.schemaVersion !== K.SCHEMA_VERSION)
      errors.push(spec.file + '：schemaVersion 應為 ' + K.SCHEMA_VERSION + '，實為 ' + obj.schemaVersion);

    if (spec.kind === 'rules') {
      spec.need.forEach(function (k) {
        if (obj[k] == null) errors.push(spec.file + '：缺少 ' + k);
      });
    } else {
      var list = obj[spec.list];
      if (!Array.isArray(list)) {
        errors.push(spec.file + '：' + spec.list + ' 應為陣列');
      } else {
        var seen = {};
        list.forEach(function (row, i) {
          var where = spec.file + ' [' + i + ']';
          if (!row || typeof row !== 'object') { errors.push(where + '：不是物件'); return; }
          spec.need.forEach(function (f) {
            if (row[f] == null) errors.push(where + '：缺少欄位 ' + f);
          });
          if (row.id != null) {
            if (seen[row.id]) errors.push(where + '：id 重複（' + row.id + '）');
            seen[row.id] = true;
          }
        });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  };

  // fetchFn(url) → Promise<物件>。瀏覽器傳 fetch 包裝，Node 測試可傳讀檔函式。
  K.loadAll = function (fetchFn, baseDir) {
    baseDir = baseDir == null ? './assets/data/' : baseDir;
    var data = {}, errors = [];
    return Promise.all(K.FILES.map(function (spec) {
      return Promise.resolve(fetchFn(baseDir + spec.file)).then(function (obj) {
        var v = K.validate(spec.key, obj);
        if (!v.ok) errors = errors.concat(v.errors);
        data[spec.key] = obj;
      }, function (e) {
        errors.push(spec.file + '：載入失敗（' + (e && e.message ? e.message : e) + '）');
        data[spec.key] = null;
      });
    })).then(function () {
      K.data = data;
      K.errors = errors;
      return { data: data, errors: errors };
    });
  };

  K.rows = function (key) {
    var spec = K.spec(key);
    var obj = K.data && K.data[key];
    if (!spec || !obj) return [];
    return obj[spec.list] || [];
  };

  K.byId = function (key, id) {
    var list = K.rows(key);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  // 內容表全空 → UI 顯示「內容資料未載入」，而不是給一個空選單讓人以為壞了
  K.isEmpty = function () {
    return K.rows('monsters').length === 0
        && K.rows('items').length === 0
        && K.rows('locations').length === 0;
  };

  // 給 state / rules / time / combat 用的規則包
  K.cfgs = function () {
    var d = K.data || {};
    return { attributes: d.attributes || {}, survival: d.survival || {}, combat: d.combat || {} };
  };
})(typeof window !== 'undefined' ? window : globalThis);
