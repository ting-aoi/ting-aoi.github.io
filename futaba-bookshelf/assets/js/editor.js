// ═══════════════════════════════════════════════════════
// editor.js — Futaba note editor logic
// ═══════════════════════════════════════════════════════
'use strict';

var FT = window.FT;

// ── Auto-resize textareas ──
function _autoResize(el) {
  const scroller = document.querySelector('.note-scroll');
  const top = scroller ? scroller.scrollTop : 0;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  if (scroller) scroller.scrollTop = top;
}
FT.wireTextareas = function() {
  ['f-synopsis','f-review','f-notes'].forEach(id => {
    const el = FT.$(id);
    if (!el || el._resizeWired) return;
    el._resizeWired = true;
    el.addEventListener('input', () => _autoResize(el));
    _autoResize(el);
  });
};

// ── Read mode ──
FT.applyReadMode = function() {
  const ro = FT.isReadMode;
  // new-btn
  const newBtn = FT.$('new-btn');
  if (newBtn) {
    newBtn.classList.toggle('read-locked', ro);
    newBtn.textContent = ro ? '🔒 閱讀中' : '＋ 新增書評';
  }
  // badge
  const badge = FT.$('mode-badge');
  if (badge && FT.currentPage === 'note') {
    badge.style.display = 'inline-flex';
    badge.className = 'mode-badge ' + (ro ? 'read' : 'edit');
    badge.textContent = ro ? '閱 讀' : '編 輯';
  }
  // readonly fields
  ['book-title-input','f-author','f-ai-cv','f-synopsis','f-review','f-notes']
    .forEach(id => { const el = FT.$(id); if (el) el.readOnly = ro; });
  ['f-text-platform','f-audio-platform','f-cv-type','f-cv-change','f-voice-exp','f-ai-cv']
    .forEach(id => { const el = FT.$(id); if (el) el.disabled = ro; });
  document.querySelectorAll('.status-opt').forEach(b => { b.disabled = ro; });
  document.querySelectorAll('.star').forEach(s => s.style.pointerEvents = ro ? 'none' : '');
  document.querySelectorAll('.tag-chip .rm').forEach(r => r.style.display = ro ? 'none' : '');
  const addTagBtn = document.querySelector('.add-tag-btn');
  if (addTagBtn) addTagBtn.style.display = ro ? 'none' : '';
  const charAddRow = FT.$('char-add-row');
  if (charAddRow) charAddRow.style.display = ro ? 'none' : '';
  document.querySelectorAll('.char-del,.char-edit').forEach(d => d.style.display = ro ? 'none' : '');
  const deleteRow = FT.$('delete-row');
  if (deleteRow) deleteRow.style.display = ro ? 'none' : '';
  // Re-render characters: clears any in-progress edit row and drag handles
  if (FT.activeId && FT.books[FT.activeId])
    FT.renderCharList(FT.books[FT.activeId].characters || []);
};

// ── Open / load ──
FT.openBook = function(id) {
  if (!id || !FT.books[id]) { console.warn('[Futaba] openBook: invalid id', id); return; }
  FT.flushCharInputs();
  FT.saveCurrentBook();
  FT.activeId = id;
  FT.isReadMode = FT.settings.readModeDefault;
  FT.showPage('note');
  FT.loadForm(FT.books[id]);
  FT.applyReadMode();
  FT.renderList();
  FT.debSave();
};

FT.loadForm = function(b) {
  FT.$('book-title-input').value = b.title  || '';
  FT.$('f-author').value          = b.author || '';
  FT.$('f-synopsis').value        = b.synopsis  || '';
  FT.$('f-review').value          = b.review    || '';
  FT.$('f-notes').value           = b.notes     || '';
  FT.renderStatusButtons();
  FT.setStarsUI(b.rating || 0);
  FT.renderPlatformDropdowns(b.textPlatform, b.audioPlatform);
  FT.renderCvDropdowns(b.cvType, b.aiCv, b.cvChange, b.voiceExp);
  FT.updateAudioFields(b.audioPlatform || ''); // sync hidden/shown state
  const dh = FT.$opt('dup-hint'); if (dh) { dh.style.display='none'; dh.innerHTML=''; }
  FT.renderTagsRow(b.tags || []);
  FT.renderCharList(b.characters || []);
  FT.$('stat-note').textContent = b.title || '（無標題）';
  FT.$('char-name-in').value = '';
  FT.$('char-desc-in').value = '';
  setTimeout(FT.wireTextareas, 0);
};

FT.saveCurrentBook = function() {
  if (!FT.activeId || !FT.books[FT.activeId] || FT.currentPage !== 'note') return;
  const b = FT.books[FT.activeId];
  b.title         = FT.$('book-title-input').value;
  b.author        = FT.$('f-author').value;
  b.textPlatform  = FT.$('f-text-platform').value;
  b.audioPlatform = FT.$('f-audio-platform').value;
  b.cvType        = FT.$('f-cv-type').value;
  b.aiCv          = FT.$('f-ai-cv').value;
  b.cvChange      = FT.$('f-cv-change').value;
  b.voiceExp      = FT.$('f-voice-exp').value;
  b.synopsis      = FT.$('f-synopsis').value;
  b.review        = FT.$('f-review').value;
  b.notes         = FT.$('f-notes').value;
};

FT.onFieldChange = function() {
  FT.saveCurrentBook();
  if (FT.activeId && FT.books[FT.activeId]) {
    FT.$('stat-note').textContent = FT.books[FT.activeId].title || '（無標題）';
    FT.renderList();
  }
  FT.debSave();
};


// ── New / delete ──
FT.newBook = function() {
  FT.flushCharInputs();
  FT.saveCurrentBook();
  const id = 'book-' + Date.now();
  const b = FT.emptyBook(id);
  // Apply user-configured defaults for faster entry
  const d = FT.settings.newBookDefaults || {};
  if (d.textPlatform  && FT.settings.textPlatforms.includes(d.textPlatform))   b.textPlatform  = d.textPlatform;
  if (d.audioPlatform && (d.audioPlatform==='無' || FT.settings.audioPlatforms.includes(d.audioPlatform))) b.audioPlatform = d.audioPlatform;
  FT.books[id] = b;
  FT.isReadMode = false;
  FT.openBook(id);
  setTimeout(() => FT.$('book-title-input').focus(), 60);
};

FT.softDelete = function() {
  if (!FT.activeId) return;
  const b = FT.books[FT.activeId];
  if (!confirm(`將「${b.title||'此筆記'}」移至回收桶？`)) return;
  FT.saveCurrentBook();
  b.deletedAt = Date.now();
  FT.trash[b.id] = b;
  delete FT.books[b.id];
  FT.activeId = null;
  FT.showPage('home');
  FT.renderList();
  FT.saveAll();
};

// Flush pending char-add-row inputs before switching notes
FT.flushCharInputs = function() {
  if (!FT.activeId || !FT.books[FT.activeId]) return;
  const nameIn = FT.$('char-name-in');
  const descIn = FT.$('char-desc-in');
  if (!nameIn || !descIn) return;
  const name = (nameIn.value || '').trim().replace(/^@/, '');
  const desc = (descIn.value || '').trim();
  if (name) {
    FT.books[FT.activeId].characters = FT.books[FT.activeId].characters || [];
    FT.books[FT.activeId].characters.push({ name, desc });
    nameIn.value = '';
    descIn.value = '';
    FT.renderCharList(FT.books[FT.activeId].characters);
  }
};

// ── Status ──
// Status groups config (mirrored from settings.js _STATUS_GROUPS)
const _SG = [
  { key:'workStatusOptions',  field:'workStatus',  label:'作品狀態', id:'status-row-work'  },
  { key:'audioStatusOptions', field:'audioStatus', label:'聽書狀態', id:'status-row-audio' },
  { key:'myProgressOptions',  field:'myProgress',  label:'我的進度', id:'status-row-progress' },
];

FT.renderStatusButtons = function() {
  if (!FT.activeId) return;
  const b = FT.books[FT.activeId];
  _SG.forEach(g => {
    const el = FT.$(g.id);
    if (!el) return;
    el.innerHTML = (FT.settings[g.key]||[]).map(s =>
      '<button class="status-opt ' + (b[g.field]===s?'active':'') + '" onclick="FT.setStatus(\'' + g.field + '\',\'' + FT.escA(s) + '\')">'+FT.escH(s)+'</button>'
    ).join('');
  });
};
FT.setStatus = function(field, val) {
  if (!FT.activeId || FT.isReadMode) return;
  FT.books[FT.activeId][field] = FT.books[FT.activeId][field] === val ? '' : val;
  FT.renderStatusButtons();
  FT.debSave();
};

// ── Stars ──
const _starLabels = ['','不推','普通','還好','推薦','強推'];
FT.setStarsUI = function(v) {
  document.querySelectorAll('.star').forEach(s => s.classList.toggle('on', +s.dataset.v <= v));
  FT.$('star-label').textContent = _starLabels[v] || '';
};
FT.initStars = function() {
  document.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => {
      if (!FT.activeId || FT.isReadMode) return;
      const v = +s.dataset.v;
      FT.books[FT.activeId].rating = FT.books[FT.activeId].rating === v ? 0 : v;
      FT.setStarsUI(FT.books[FT.activeId].rating);
      FT.debSave();
    });
    s.addEventListener('mouseover', () => { if (!FT.isReadMode) FT.setStarsUI(+s.dataset.v); });
    s.addEventListener('mouseleave', () => FT.setStarsUI(FT.activeId ? FT.books[FT.activeId].rating : 0));
  });
};

// ── Platform dropdowns ──
FT.renderPlatformDropdowns = function(selText, selAudio) {
  const mk = (list, cur) => `<option value="">── 選擇平台 ──</option>` +
    list.map(p => `<option value="${FT.escH(p)}" ${p===cur?'selected':''}>${FT.escH(p)}</option>`).join('');
  FT.$('f-text-platform').innerHTML  = mk(FT.settings.textPlatforms, selText);
  // Audio platform: always prepend fixed '無' option (not deletable from settings)
  const audioOpts = `<option value="">── 選擇平台 ──</option>`
    + `<option value="無" ${'無'===selAudio?'selected':''}>無</option>`
    + FT.settings.audioPlatforms.map(p =>
        `<option value="${FT.escH(p)}" ${p===selAudio?'selected':''}>${FT.escH(p)}</option>`
      ).join('');
  FT.$('f-audio-platform').innerHTML = audioOpts;
};

FT.renderCvDropdowns = function(selType, selAiCv, selChange, selVoice) {
  const mk = (list, cur) => `<option value="">── 選擇 ──</option>` +
    list.map(p => `<option value="${FT.escH(p)}" ${p===cur?'selected':''}>${FT.escH(p)}</option>`).join('');
  FT.$('f-cv-type').innerHTML   = mk(FT.settings.cvTypeOptions,   selType);
  FT.$('f-ai-cv').innerHTML     = mk(FT.settings.aiCvOptions||[], selAiCv);
  FT.$('f-cv-change').innerHTML = mk(FT.settings.cvChangeOptions, selChange);
  FT.$('f-voice-exp').innerHTML = mk(FT.settings.voiceExpOptions, selVoice);
};

// ── Tags (new object-based) ──
FT.renderTagsRow = function(tagIds) {
  FT.$('tags-row').innerHTML =
    (tagIds || []).filter(id => id != null).map(id => {
      const t = FT.tagById(id);
      if (!t) return '';
      return `<span class="tag-chip">${t.group ? `<span class="tag-group-prefix">${FT.escH(t.group)}·</span>` : ''}${FT.escH(t.label)}<span class="rm" onclick="FT.removeTagFromBook('${FT.escA(id)}')">✕</span></span>`;
    }).join('') +
    `<button class="add-tag-btn" onclick="FT.openTagModal()">＋ 標籤</button>`;
};

FT.removeTagFromBook = function(tagId) {
  if (!FT.activeId || FT.isReadMode) return;
  FT.books[FT.activeId].tags = (FT.books[FT.activeId].tags || []).filter(id => id !== tagId);
  FT.renderTagsRow(FT.books[FT.activeId].tags);
  FT.debSave();
};

FT.openTagModal = function() {
  if (FT.isReadMode) return;
  FT.$('tag-modal').classList.add('on');
  FT.$('tag-input').value   = '';
  FT.$('tag-group-input').value = '';
  FT.renderTagCloud();
  FT._updateGroupDatalist && FT._updateGroupDatalist();
  setTimeout(() => FT.$('tag-input').focus(), 100);
};
FT.closeTagModal = function() { FT.$('tag-modal').classList.remove('on'); FT._batchTagging = false; };

FT.renderTagCloud = function() {
  const bookTagIds = FT.activeId ? (FT.books[FT.activeId]?.tags || []) : [];
  const q = FT.$('tag-input').value.toLowerCase();
  const filtered = q
    ? FT.settings.tagDict.filter(t => t.label.toLowerCase().includes(q) || t.group.toLowerCase().includes(q))
    : FT.settings.tagDict;

  if (filtered.length === 0 && q) {
    FT.$('tag-cloud').innerHTML =
      `<span style="font-size:12px;color:var(--ink3)">按「新增」建立此標籤</span>`;
    return;
  }

  // Group display
  const groups = {};
  filtered.forEach(t => { (groups[t.group] = groups[t.group] || []).push(t); });
  const grpKeys = Object.keys(groups).sort();

  FT.$('tag-cloud').innerHTML = grpKeys.map(grp => {
    const header = grp
      ? `<div style="width:100%;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink4);margin:6px 0 2px;font-family:'Playfair Display',serif">${FT.escH(grp)}</div>`
      : '';
    return header + groups[grp].map(t =>
      `<button class="tag-opt ${bookTagIds.includes(t.id)?'selected':''}" onclick="FT.toggleTag('${FT.escA(t.id)}')">${FT.escH(t.label)}</button>`
    ).join('');
  }).join('');
};

FT.toggleTag = function(tagId) {
  // Batch mode: add the tag to every selected book (add-only, no removal)
  if (FT._batchTagging && FT.batchMode) {
    let n = 0;
    FT.batchSel.forEach(id => {
      const b = FT.books[id];
      if (b && !(b.tags||[]).includes(tagId)) { (b.tags = b.tags||[]).push(tagId); n++; }
    });
    FT.closeTagModal();
    FT._batchTagging = false;
    FT.saveAll(); FT.exitBatch();
    FT.toast(`已為 ${n} 本加上 #${FT.tagLabel(tagId)}`);
    return;
  }
  if (!FT.activeId) return;
  const tags = FT.books[FT.activeId].tags;
  const i = tags.indexOf(tagId);
  if (i >= 0) tags.splice(i, 1); else tags.push(tagId);
  FT.renderTagsRow(FT.books[FT.activeId].tags);
  FT.renderTagCloud();
  FT.debSave();
};

FT.addTagFromModal = function() {
  const label = FT.$('tag-input').value.trim().replace(/^#/, '');
  const group = FT.$('tag-group-input').value.trim();
  if (!label) return;
  const id = FT.addTagToDict(label, group);
  if (FT.activeId && !FT.books[FT.activeId].tags.includes(id)) {
    FT.books[FT.activeId].tags.push(id);
    FT.renderTagsRow(FT.books[FT.activeId].tags);
  }
  FT.$('tag-input').value = '';
  FT.renderTagCloud();
  FT.debSave();
};

// ── Characters ──
FT.renderCharList = function(chars) {
  FT.$('char-list').innerHTML = (chars || []).map((ch, i) => `
    <div class="char-item" id="char-item-${i}">
      ${FT.isReadMode || (chars.length<2) ? '' : `<span class="char-drag" onpointerdown="FT.charDragStart(${i}, event)" title="拖動排序">⠿</span>`}
      <div class="char-name">@${FT.escH(ch.name)}</div>
      <div class="char-desc">${FT.escH(ch.desc) || '<span style="color:var(--ink4);font-style:italic">無描述</span>'}</div>
      <div class="char-actions">
        <button class="char-edit" onclick="FT.editChar(${i})" title="編輯" style="${FT.isReadMode?'display:none':''}">修</button>
        <button class="char-del"  onclick="FT.removeChar(${i})" title="刪除" style="${FT.isReadMode?'display:none':''}">✕</button>
      </div>
    </div>`).join('');
};

FT.editChar = function(idx) {
  if (!FT.activeId || FT.isReadMode) return;
  const ch = FT.books[FT.activeId].characters[idx];
  const item = FT.$('char-item-' + idx);
  if (!item) return;
  item.classList.add('editing');
  item.innerHTML = `
    <input class="char-name-edit" value="${FT.escH(ch.name)}" placeholder="@人名" id="cedit-name-${idx}"
           onblur="FT.charEditBlur(${idx})">
    <input class="char-desc-edit" value="${FT.escH(ch.desc)}" placeholder="角色描述…" id="cedit-desc-${idx}"
           onkeydown="if(event.key==='Enter')FT.saveChar(${idx})"
           onblur="FT.charEditBlur(${idx})">
    <div class="char-actions">
      <button class="char-save" onclick="FT.saveChar(${idx})" title="儲存">✓</button>
      <button class="char-del"  onclick="FT.renderCharList(FT.books[FT.activeId].characters)" title="取消">✕</button>
    </div>`;
  FT.$('cedit-name-' + idx)?.focus();
};

FT.saveChar = function(idx) {
  if (!FT.activeId) return;
  const nameEl = FT.$('cedit-name-' + idx);
  const descEl = FT.$('cedit-desc-' + idx);
  if (!nameEl) return;
  const name = (nameEl.value || '').trim().replace(/^@/, '');
  const desc = (descEl?.value || '').trim();
  if (!name) return;
  FT.books[FT.activeId].characters[idx] = { name, desc };
  FT.renderCharList(FT.books[FT.activeId].characters);
  FT.debSave();
};

FT.addChar = function() {
  if (!FT.activeId || FT.isReadMode) return;
  const nameIn = FT.$('char-name-in');
  const descIn = FT.$('char-desc-in');
  const name = (nameIn.value || '').trim().replace(/^@/, '');
  const desc = (descIn.value || '').trim();
  if (!name) return;
  FT.books[FT.activeId].characters = FT.books[FT.activeId].characters || [];
  FT.books[FT.activeId].characters.push({ name, desc });
  nameIn.value = ''; descIn.value = '';
  FT.renderCharList(FT.books[FT.activeId].characters);
  FT.debSave();
};

FT.removeChar = function(idx) {
  if (!FT.activeId || FT.isReadMode) return;
  const name = FT.books[FT.activeId].characters[idx]?.name || '此角色';
  if (!confirm(`確定刪除角色「@${name}」？`)) return;
  FT.books[FT.activeId].characters.splice(idx, 1);
  FT.renderCharList(FT.books[FT.activeId].characters);
  FT.debSave();
};


// ── Audio platform: disable audio fields when '無' is selected ──
const _AUDIO_FIELD_IDS = ['f-audio-status-row','f-cv-type','f-ai-cv','f-cv-change','f-voice-exp'];
const _AUDIO_STATUS_ROW = 'status-row-audio';

FT.updateAudioFields = function(platform) {
  const hide = (platform === '無');
  // Hide/show: audio status row
  const audioStatusEl = FT.$opt('audio-status-section');
  if (audioStatusEl) audioStatusEl.style.display = hide ? 'none' : '';
  // Hide/show: CV fields section
  const cvSectionEl = FT.$opt('cv-fields-section');
  if (cvSectionEl) cvSectionEl.style.display = hide ? 'none' : '';
  // Clear values when hiding
  if (hide && FT.activeId && FT.books[FT.activeId]) {
    FT.books[FT.activeId].audioStatus = '';
    FT.books[FT.activeId].cvType      = '';
    FT.books[FT.activeId].aiCv        = '';
    FT.books[FT.activeId].cvChange    = '';
    FT.books[FT.activeId].voiceExp    = '';
    FT.renderStatusButtons();
  }
};

// ── 智慧貼上：從複製文字解析「書名＋作者」──
// 支援書站常見格式：《書名》作者、書名(作者)、書名 作者：XXX、Title by Author
FT.parseTitlePaste = function(text) {
  text = String(text).replace(/\s+/g, ' ').trim();
  if (!text || text.length > 120) return null;
  let m;
  // 《書名》作者：XXX ／《書名》XXX著 ／《書名》XXX
  if ((m = text.match(/^《(.+?)》\s*(?:作者\s*[:：]\s*)?(.*?)(?:\s*著)?$/))) {
    return { title: m[1].trim(), author: (m[2]||'').trim() };
  }
  // 書名（作者）／ 書名(作者)
  if ((m = text.match(/^(.+?)\s*[（(]([^（()）]{1,20})[）)]$/))) {
    return { title: m[1].trim(), author: m[2].replace(/\s*著$/, '').trim() };
  }
  // 書名 作者：XXX
  if ((m = text.match(/^(.+?)\s+作者\s*[:：]\s*(.+)$/))) {
    return { title: m[1].trim(), author: m[2].trim() };
  }
  // Title by Author
  if ((m = text.match(/^(.+?)\s+by\s+(.+)$/i))) {
    return { title: m[1].trim(), author: m[2].trim() };
  }
  return null;
};

// Paste handler on the title input: if the pasted text contains an author,
// split it into title + author fields automatically.
FT.initSmartPaste = function() {
  const titleEl = FT.$opt('book-title-input');
  if (!titleEl) return;
  titleEl.addEventListener('paste', ev => {
    const text = (ev.clipboardData || window.clipboardData)?.getData('text') || '';
    const parsed = FT.parseTitlePaste(text);
    if (!parsed || !parsed.author) return;     // plain title → default paste
    ev.preventDefault();
    titleEl.value = parsed.title;
    const authorEl = FT.$opt('f-author');
    if (authorEl && !authorEl.value.trim()) authorEl.value = parsed.author;
    FT.saveCurrentBook();
    FT.debSave();
  });
};

// ── 重複書提示（書名輸入時即時檢查）──
let _dupTimer = null;
FT.checkDuplicateTitle = function() {
  clearTimeout(_dupTimer);
  _dupTimer = setTimeout(() => {
    const el = FT.$opt('dup-hint');
    const titleEl = FT.$opt('book-title-input');
    if (!el || !titleEl) return;
    const sims = FT.findSimilarBooks(titleEl.value, FT.activeId);
    if (!sims.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.innerHTML = FT.icon('warn') + ' 書庫中已有相似書名：' + sims.map(b =>
      `<a href="javascript:void(0)" onclick="FT.openBook('${FT.escA(b.id)}')">《${FT.escH(b.title)}》</a>`
    ).join('、');
    el.style.display = 'block';
  }, 350);
};

// ── 重要角色拖動排序（pointer-based，行動裝置友善）──
FT.charDragStart = function(idx, ev) {
  if (FT.isReadMode || !FT.activeId) return;
  ev.preventDefault();
  const list  = FT.$opt('char-list');
  if (!list) return;
  const items = [...list.children];
  const el    = items[idx];
  if (!el) return;
  // Row pitch = distance between adjacent rows (height + gap)
  const pitch = items.length > 1
    ? items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top
    : el.offsetHeight;
  const startY = ev.clientY;
  let cur = idx;
  el.classList.add('char-dragging');

  const onMove = e2 => {
    const dy = e2.clientY - startY;
    el.style.transform = `translateY(${dy}px)`;
    const target = Math.min(items.length - 1, Math.max(0, idx + Math.round(dy / pitch)));
    if (target !== cur) {
      cur = target;
      items.forEach((it, i) => {
        if (it === el) return;
        let shift = 0;
        if (idx < cur ? (i > idx && i <= cur) : (i >= cur && i < idx))
          shift = idx < cur ? -pitch : pitch;
        it.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    el.classList.remove('char-dragging');
    const chars = FT.books[FT.activeId].characters;
    if (cur !== idx) {
      const [moved] = chars.splice(idx, 1);
      chars.splice(cur, 0, moved);
      FT.debSave();
    }
    FT.renderCharList(chars);   // also clears transforms
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
};

// 編輯列 blur：僅當焦點真正離開「兩個編輯輸入框」時才自動儲存。
// 名字→描述的焦點切換不會觸發（鍵盤保持開啟）。
FT.charEditBlur = function(idx) {
  setTimeout(() => {
    const ae = document.activeElement;
    if (ae && (ae.id === 'cedit-name-' + idx || ae.id === 'cedit-desc-' + idx)) return;
    FT.saveChar(idx);   // inputs 已不存在時內部安全跳過
  }, 120);
};
