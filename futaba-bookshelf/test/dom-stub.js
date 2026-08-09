// dom-stub.js — 無頭測試用的瀏覽器環境模擬（Node 22）
// 用法：const { makeEnv } = require('./dom-stub'); const env = makeEnv(); require('../assets/js/...');
//
// 雷點備忘（血淚）：
//  1. Node 22 的 navigator 是唯讀內建 → 必須用 Object.defineProperty 覆蓋
//  2. app.js 的 boot 是 async IIFE → require 後要 await env.settle() 才驗綁定
//  3. mock 元素需先經 getElementById 建立才能操作

function mkEl(id, tag) {
  const el = {
    id: id || '', tagName: (tag || 'div').toUpperCase(), dataset: {},
    innerHTML: '', textContent: '', value: '', style: {}, offsetWidth: 100, offsetHeight: 100,
    children: [], _listeners: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, v) {
        if (v === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
        else { v ? this._s.add(c) : this._s.delete(c); }
      },
    },
    addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
    removeEventListener() {},
    dispatch(ev, e) { (this._listeners[ev] || []).forEach(fn => fn(e || {})); },
    appendChild(n) { this.children.push(n); return n; },
    removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); },
    remove() {},
    cloneNode() { return mkEl(this.id, tag); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }; },
    setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {}, click() { this.dispatch('click'); },
  };
  return el;
}

function makeEnv(opts = {}) {
  const els = {};
  const docListeners = {};
  const winListeners = {};
  const state = { alerts: [], confirms: true, redirect: null, put: [], del: [], fetches: [] };

  global.window = global;
  global.screen = {};
  global.location = {
    pathname: opts.pathname || '/index.html', origin: 'http://localhost:8080', hash: opts.hash || '',
    replace(u) { state.redirect = u; }, reload() { state.redirect = 'reload'; },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      serviceWorker: {
        getRegistrations: async () => (opts.swRegs || []),
        register: async () => ({ addEventListener() {} }),
        addEventListener() {},
        controller: null,
      },
    },
    configurable: true, writable: true,
  });
  global.caches = {
    _keys: (opts.cacheKeys || []).slice(),
    async keys() { return this._keys; },
    async delete(k) { this._keys = this._keys.filter(x => x !== k); return true; },
    async open() { return { match: async () => null, put: async () => {} }; },
  };
  global.document = {
    getElementById: id => (els[id] ||= mkEl(id)),
    createElement: tag => mkEl('', tag),
    addEventListener(ev, fn) { (docListeners[ev] ||= []).push(fn); },
    removeEventListener() {},
    querySelector: sel => (opts.querySelector ? opts.querySelector(sel) : null),
    querySelectorAll: sel => (opts.querySelectorAll ? opts.querySelectorAll(sel) || [] : []),
    body: { appendChild() {}, removeChild() {}, classList: mkEl('body').classList },
    hidden: false, visibilityState: 'visible',
  };
  global.addEventListener = (ev, fn) => { (winListeners[ev] ||= []).push(fn); };
  global.localStorage = {
    _d: Object.assign({}, opts.localStorage),
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  global.history = {
    state: null,
    _log: [],
    pushState(s, _, u) { this.state = s; this._log.push('push:' + (s && s.page || '?')); },
    replaceState(s) { this.state = s; this._log.push('repl:' + (s && s.page || '?')); },
    back() { this._log.push('back'); },
  };
  global.alert = m => state.alerts.push(String(m));
  global.confirm = () => state.confirms;
  global.Blob = class { constructor(parts) { this.parts = parts; } };
  global.FormData = class { constructor() { this._f = []; } append(k, v, n) { this._f.push([k, v, n]); } };
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  global.fetch = opts.fetch || (async (url, init) => {
    state.fetches.push({ url: String(url), init });
    if (String(url).includes('/api/file/upload')) { state.put.push(String(url)); return { ok: true, status: 204 }; }
    if (String(url).includes('/api/file/delete')) { state.del.push(init && init.body); return { ok: true, status: 204 }; }
    if (String(url).includes('/api/file/list')) return { ok: true, status: 200, json: async () => (opts.listResult || []) };
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  });

  return {
    els, state,
    el: id => document.getElementById(id),
    html: id => document.getElementById(id).innerHTML,
    fireDoc(ev, e) { (docListeners[ev] || []).forEach(fn => fn(e || {})); },
    fireWin(ev, e) { (winListeners[ev] || []).forEach(fn => fn(e || {})); },
    fireEl(id, ev, e) { document.getElementById(id).dispatch(ev, e); },
    hasDocListener: ev => !!(docListeners[ev] || []).length,
    settle: (ms = 80) => new Promise(r => setTimeout(r, ms)),
  };
}

module.exports = { makeEnv, mkEl };
