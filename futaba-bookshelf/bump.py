#!/usr/bin/env python3
"""
雙葉書庫 Futaba — 版本號管理 & 打包腳本
==========================================
用法：
  python3 bump.py debug     # v1.2b → v1.2c（bug 修復）
  python3 bump.py minor     # v1.2b → v1.3（新功能）
  python3 bump.py major     # v1.2b → v2.0（大更新）
  python3 bump.py show      # 只顯示當前版本
  python3 bump.py pack      # 不改版本，只重新打包

更新說明流程：
  每次修改程式碼後，把本次變更寫入 CHANGES.md（每行一條「- 說明」）
  執行 bump.py 時自動讀取 CHANGES.md 寫入 changelog.json，然後清空 CHANGES.md
"""

import json, re, sys, zipfile
from pathlib import Path
from datetime import date

ROOT    = Path(__file__).parent
INDEX   = ROOT / 'index.html'
SW      = ROOT / 'sw.js'
CL      = ROOT / 'assets' / 'changelog.json'
CHANGES = ROOT / 'CHANGES.md'

# ── 讀取當前版本 ──
def get_version():
    txt = INDEX.read_text(encoding='utf-8')
    # 錨定狀態列的 >vX.X< 格式，避免誤抓註解或其他地方的版本字樣
    m = re.search(r'>v(\d+)\.(\d+)([a-z]?)<', txt)
    if not m:
        raise SystemExit('找不到版本號')
    return int(m.group(1)), int(m.group(2)), m.group(3)

def fmt(major, minor, letter):
    return f'v{major}.{minor}{letter}'

# ── 遞增版本 ──
def bump(mode):
    major, minor, letter = get_version()
    if mode == 'debug':
        if not letter:
            return major, minor, 'a'
        elif letter == 'z':
            raise SystemExit('字母已到 z，請改用 minor 升版')
        else:
            return major, minor, chr(ord(letter) + 1)
    elif mode == 'minor':
        return major, minor + 1, ''
    elif mode == 'major':
        return major + 1, 0, ''
    else:
        raise SystemExit(f'未知模式: {mode}')

# ── 從 CHANGES.md 讀取說明條目 ──
def read_changes():
    if not CHANGES.exists():
        return []
    lines = CHANGES.read_text(encoding='utf-8').splitlines()
    items = []
    for line in lines:
        line = line.strip()
        if line.startswith('- '):
            items.append(line[2:].strip())
        elif line and not line.startswith('#'):
            items.append(line)
    return [i for i in items if i]

def clear_changes(new_version):
    """Clear CHANGES.md after writing to changelog, leave template comment."""
    CHANGES.write_text(
        f'# 待寫入 changelog 的更新說明\n'
        f'# 每行一條 - 說明，bump.py 執行時自動讀取並清空\n'
        f'# 上次版本：{new_version}\n',
        encoding='utf-8'
    )

# ── 更新 index.html 版本號 ──
def apply_version(old_str, new_str):
    txt = INDEX.read_text(encoding='utf-8')
    if f'>{old_str}<' not in txt:
        raise SystemExit(f'index.html 找不到 >{old_str}<')
    txt = txt.replace(f'>{old_str}<', f'>{new_str}<')
    INDEX.write_text(txt, encoding='utf-8')
    print(f'  index.html: {old_str} → {new_str}')

# ── 更新 sw.js 快取 key + index.html 資產版本戳 ──
def update_sw():
    import time
    ts = int(time.time())
    sw_txt = SW.read_text(encoding='utf-8')
    sw_txt = re.sub(r"const BUILD = '\d+'", f"const BUILD = '{ts}'", sw_txt)
    sw_txt = re.sub(r'// Futaba SW — BUILD: \d+', f'// Futaba SW — BUILD: {ts}', sw_txt)
    SW.write_text(sw_txt, encoding='utf-8')
    print(f'  sw.js: BUILD → {ts}')
    # index.html 的 css/js 連結帶 ?v=BUILD：index 永遠走網路，
    # 新 HTML 帶新查詢字串 → 舊快取必 miss → 即使舊 SW 掌控也會抓到新 JS
    idx_txt = INDEX.read_text(encoding='utf-8')
    idx_txt, n = re.subn(r'\?v=\d+', f'?v={ts}', idx_txt)
    INDEX.write_text(idx_txt, encoding='utf-8')
    print(f'  index.html: 資產版本戳 ?v={ts}（{n} 處）')

# ── 新增 changelog 條目 ──
def _ver_key(v):
    import re as _re
    m = _re.match(r'v(\d+)\.(\d+)([a-z]?)', v)
    if not m: return (0, 0, -1)
    maj, mn, lt = int(m.group(1)), int(m.group(2)), m.group(3)
    return (maj, mn, ord(lt) if lt else -1)

def add_changelog_entry(new_str, items):
    today = date.today().isoformat()
    entries = json.loads(CL.read_text(encoding='utf-8')) if CL.exists() else []
    # Upsert
    existing = next((e for e in entries if e['version'] == new_str), None)
    if existing:
        if items:
            existing['items'] = items
            print(f'  changelog.json: {new_str} 已更新（{len(items)} 項）')
        else:
            print(f'  changelog.json: {new_str} 已存在，跳過')
    else:
        entries.append({'version': new_str, 'date': today, 'items': items or ['（待填寫）']})
        print(f'  changelog.json: 新增 {new_str}（{len(items)} 項）')
    # Always sort descending after any change
    entries.sort(key=lambda e: _ver_key(e['version']), reverse=True)
    CL.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf-8')

# ── 打包 ZIP ──
def pack(version):
    # zip 檔名帶版本號（如 futaba-pwa-v2.9a.zip）；zip 內部頂層資料夾名固定為
    # booknotes-pwa，確保「解壓即覆蓋」的部署方式不變。
    out = ROOT / f'futaba-pwa-{version}.zip'
    # 清掉舊的成品 zip（含舊命名與其他版本號），避免殘留、也避免被打進新包
    for old_zip in ROOT.glob('futaba-pwa*.zip'):
        old_zip.unlink()
    skip = {'.pyc', '.bak', '.zip'}
    skip_names = {'__pycache__', '.git'}
    # Files to exclude from the distributable package
    skip_files = {'data/index.json', 'data/settings.json'}
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in ROOT.rglob('*'):
            if not f.is_file(): continue
            if f.suffix in skip: continue
            if any(s in f.parts for s in skip_names): continue
            rel = str(f.relative_to(ROOT))
            if rel in skip_files: continue
            # 頂層資料夾寫死 booknotes-pwa，不跟隨 repo 資料夾實際名稱
            # （repo 已改名 futaba-bookshelf，但 Ting 的 shttps 部署目錄仍是 booknotes-pwa）
            zf.write(f, Path('booknotes-pwa') / f.relative_to(ROOT))
    print(f'  {out.name}: {out.stat().st_size // 1024} KB')

# ── Main ──
def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'show'
    major, minor, letter = get_version()
    cur = fmt(major, minor, letter)

    if mode == 'show':
        print(f'當前版本：{cur}')
        items = read_changes()
        if items:
            print(f'待寫入 CHANGES.md（{len(items)} 項）：')
            for it in items: print(f'  - {it}')
        return

    if mode == 'pack':
        print(f'打包 {cur}...')
        update_sw()
        pack(cur)
        print(f'完成：futaba-pwa-{cur}.zip')
        return

    new_major, new_minor, new_letter = bump(mode)
    new_str = fmt(new_major, new_minor, new_letter)
    items = read_changes()

    print(f'版本：{cur} → {new_str}')
    if not items:
        print('  ⚠️  CHANGES.md 是空的，changelog 將填入「（待填寫）」')
    
    apply_version(cur, new_str)
    update_sw()
    add_changelog_entry(new_str, items)
    if items:
        clear_changes(new_str)
    pack(new_str)
    print(f'\n✓ 完成！版本 {new_str}')
    if not items:
        print('  請記得在 CHANGES.md 填寫說明，再跑一次 pack 更新 changelog。')

if __name__ == '__main__':
    main()

