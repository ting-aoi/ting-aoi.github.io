/**
 * dom-stub.js — Node headless smoke test 用瀏覽器環境樁（Ting 專案共用）
 *
 * 用法（臨時測試檔開頭）：
 *   const stub = require('/mnt/skills/.../scripts/dom-stub.js');
 *   stub.install();                      // 掛到 globalThis
 *   // 需要假資料時：stub.setFetchResponse('/api/file/download?path=x', { json: {...} });
 *   // 之後再 require / eval 待測模組
 *
 * 涵蓋：window、document（元素樁）、localStorage、fetch、history、location(hash)、
 *       navigator、requestAnimationFrame、CustomEvent。
 * 測試檔用完即刪，打包前必須刪除。
 */
'use strict';

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    toggle: c => (set.has(c) ? (set.delete(c), false) : (set.add(c), true)),
    contains: c => set.has(c),
    _set: set,
  };
}

function makeElement(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '', value: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, children: [], attributes: {},
    classList: makeClassList(),
    parentNode: null,
    hidden: false, disabled: false, checked: false,
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    insertBefore(c, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); c.parentNode = this; return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {}, blur() {}, click() { this.dispatchEvent({ type: 'click', target: this }); },
    scrollIntoView() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    _listeners: listeners,
  };
  return el;
}

function makeStorage() {
  let store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { store = {}; },
    key: i => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
    _dump: () => ({ ...store }),
  };
}

// fetch 樁：以「URL 包含指定子字串」比對，回傳預設或註冊的回應
const fetchRoutes = [];
function setFetchResponse(urlSubstring, { json, text = '', status = 200 } = {}) {
  fetchRoutes.push({ urlSubstring, json, text, status });
}
function makeFetch(log) {
  return async function fetchStub(url, opts = {}) {
    log.push({ url: String(url), method: (opts.method || 'GET').toUpperCase(), body: opts.body });
    const hit = fetchRoutes.find(r => String(url).includes(r.urlSubstring));
    const status = hit ? hit.status : 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (hit && 'json' in hit ? hit.json : {}),
      text: async () => (hit ? (hit.text || JSON.stringify(hit.json ?? '')) : ''),
      blob: async () => ({ size: 0 }),
    };
  };
}

function install(target = globalThis) {
  const elementsById = {};
  const location = {
    hash: '', href: 'http://localhost/', pathname: '/', search: '',
    reload() {}, assign() {}, replace() {},
  };
  const historyStack = [];
  const history = {
    pushState(s, t, url) { historyStack.push(url); if (typeof url === 'string' && url.includes('#')) location.hash = '#' + url.split('#')[1]; },
    replaceState(s, t, url) { historyStack[historyStack.length - 1] = url; },
    back() { historyStack.pop(); win.dispatchEvent({ type: 'popstate', state: null }); },
    get length() { return historyStack.length; },
    _stack: historyStack,
  };
  const docListeners = {};
  const document = {
    body: makeElement('body'),
    head: makeElement('head'),
    documentElement: makeElement('html'),
    title: '',
    getElementById: id => elementsById[id] || (elementsById[id] = Object.assign(makeElement(), { id })),
    createElement: tag => makeElement(tag),
    createTextNode: text => ({ textContent: text }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener(type, fn) { if (docListeners[type]) docListeners[type] = docListeners[type].filter(f => f !== fn); },
    dispatchEvent(ev) { (docListeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    _elementsById: elementsById,
  };
  const winListeners = {};
  const fetchLog = [];
  const win = {
    document, location, history,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    navigator: { userAgent: 'node-smoke-test', onLine: true, serviceWorker: undefined },
    innerWidth: 390, innerHeight: 844,
    addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
    removeEventListener(type, fn) { if (winListeners[type]) winListeners[type] = winListeners[type].filter(f => f !== fn); },
    dispatchEvent(ev) { (winListeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    cancelAnimationFrame: id => clearTimeout(id),
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert() {}, confirm: () => true, prompt: () => null,
    CustomEvent: function CustomEvent(type, init = {}) { this.type = type; this.detail = init.detail; },
    fetch: makeFetch(fetchLog),
    _fetchLog: fetchLog,
  };
  win.window = win;

  // 掛到 target（globalThis），讓待測模組直接取用。
  // 注意:新版 Node 上 navigator/localStorage 等可能是唯讀 getter,
  // 一律用 defineProperty 強制覆蓋。
  const globals = {
    window: win,
    document,
    location,
    history,
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    navigator: win.navigator,
    fetch: win.fetch,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    CustomEvent: win.CustomEvent,
  };
  for (const [k, v] of Object.entries(globals)) {
    Object.defineProperty(target, k, { value: v, writable: true, configurable: true });
  }
  return win;
}

module.exports = { install, setFetchResponse, makeElement, makeStorage };
