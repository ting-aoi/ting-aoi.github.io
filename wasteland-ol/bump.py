#!/usr/bin/env python3
"""
廢土 Online — 版本號管理 & 打包腳本
==========================================
用法：
  python3 bump.py debug     # v0.1  → v0.1a（bug 修復）
  python3 bump.py minor     # v0.1a → v0.2 （新功能）
  python3 bump.py major     # v0.1a → v1.0 （大更新）
  python3 bump.py show      # 只顯示當前版本
  python3 bump.py pack      # 不改版本，只重新打包

更新說明流程：
  每次修改後把本次變更寫入 CHANGES.md（每行一條「- 說明」）；
  執行 bump.py 時自動讀進 assets/changelog.json，然後清空 CHANGES.md。

版本錨點：index.html 狀態列的 >vX.X< 格式。
HTML 註解等處不得出現同格式字串，否則會被誤抓。
"""

import json, re, sys, time, zipfile
from pathlib import Path
from datetime import date

ROOT    = Path(__file__).parent
INDEX   = ROOT / 'index.html'
SW      = ROOT / 'sw.js'
VERJS   = ROOT / 'assets' / 'js' / 'version.js'
CL      = ROOT / 'assets' / 'changelog.json'
CHANGES = ROOT / 'CHANGES.md'

# zip 內部頂層資料夾固定，確保「解壓即覆蓋」的部署方式不變
INNER = 'wasteland-ol'

# 打包排除：副檔名、目錄名、檔名樣式（與 verify_zip.py 的 wasteland profile 對齊）
SKIP_SUFFIX = {'.pyc', '.bak', '.zip'}
SKIP_DIRS   = {'__pycache__', '.git', 'node_modules'}
SKIP_GLOBS  = ('test_*.js', '*_test.js')
# 必含（漏掉就是打包失敗，不是警告）
MUST_HAVE   = ['index.html', 'AI-CONTEXT.md', 'CONVENTIONS.md', 'assets/icons/.nomedia']


# ── 讀取當前版本 ──
def get_version():
    txt = INDEX.read_text(encoding='utf-8')
    m = re.search(r'>v(\d+)\.(\d+)([a-z]?)<', txt)
    if not m:
        raise SystemExit('index.html 找不到 >vX.X< 版本錨點')
    return int(m.group(1)), int(m.group(2)), m.group(3)


def fmt(major, minor, letter):
    return f'v{major}.{minor}{letter}'


def bump(mode):
    major, minor, letter = get_version()
    if mode == 'debug':
        if not letter:
            return major, minor, 'a'
        if letter == 'z':
            raise SystemExit('字母已到 z，請改用 minor 升版')
        return major, minor, chr(ord(letter) + 1)
    if mode == 'minor':
        return major, minor + 1, ''
    if mode == 'major':
        return major + 1, 0, ''
    raise SystemExit(f'未知模式: {mode}')


# ── CHANGES.md ──
def read_changes():
    if not CHANGES.exists():
        return []
    items = []
    for line in CHANGES.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('- '):
            items.append(line[2:].strip())
        elif line and not line.startswith('#'):
            items.append(line)
    return [i for i in items if i]


def clear_changes(new_version):
    CHANGES.write_text(
        '# 待寫入 changelog 的更新說明\n'
        '# 每行一條 - 說明，bump.py 執行時自動讀取並清空\n'
        f'# 上次版本：{new_version}\n',
        encoding='utf-8'
    )


# ── 改寫版本與 BUILD ──
def apply_version(old_str, new_str):
    txt = INDEX.read_text(encoding='utf-8')
    if f'>{old_str}<' not in txt:
        raise SystemExit(f'index.html 找不到 >{old_str}<')
    INDEX.write_text(txt.replace(f'>{old_str}<', f'>{new_str}<'), encoding='utf-8')
    print(f'  index.html: {old_str} → {new_str}')

    v = VERJS.read_text(encoding='utf-8')
    v = re.sub(r"WOL\.VERSION = '[^']*'", f"WOL.VERSION = '{new_str}'", v)
    VERJS.write_text(v, encoding='utf-8')
    print(f'  version.js: WOL.VERSION → {new_str}')


def update_build():
    """sw.js 快取 key + index.html 資產版本戳 + version.js 的 BUILD，三處同步。

    index.html 永遠走網路、資產一律帶 ?v=BUILD —— 這組雙保護讓舊 SW
    掌控時也必定 miss 舊快取，抓到新 JS。不得降級成單一機制。
    """
    ts = str(int(time.time()))

    sw = SW.read_text(encoding='utf-8')
    sw = re.sub(r"const BUILD = '\d+'", f"const BUILD = '{ts}'", sw)
    sw = re.sub(r'// Wasteland SW — BUILD: \d+', f'// Wasteland SW — BUILD: {ts}', sw)
    SW.write_text(sw, encoding='utf-8')
    print(f'  sw.js: BUILD → {ts}')

    idx = INDEX.read_text(encoding='utf-8')
    idx, n = re.subn(r'\?v=\d+', f'?v={ts}', idx)
    INDEX.write_text(idx, encoding='utf-8')
    print(f'  index.html: 資產版本戳 ?v={ts}（{n} 處）')

    v = VERJS.read_text(encoding='utf-8')
    v = re.sub(r"WOL\.BUILD = '\d+'", f"WOL.BUILD = '{ts}'", v)
    VERJS.write_text(v, encoding='utf-8')
    print(f'  version.js: WOL.BUILD → {ts}')

    # sw.js 的 STATIC 清單必須涵蓋 index.html 實際載入的每個帶戳資產
    want = set(re.findall(r'assets/[\w/.-]+\?v=', idx))
    have = set(re.findall(r"assets/[\w/.-]+\?v='", sw.replace("' + BUILD", "'")))
    missing = {w.rstrip('?v=') for w in want} - {h.rstrip("?v='") for h in have}
    if missing:
        print(f'  ⚠️  sw.js STATIC 未涵蓋：{sorted(missing)}')


def _ver_key(v):
    m = re.match(r'v(\d+)\.(\d+)([a-z]?)', v)
    if not m:
        return (0, 0, -1)
    return (int(m.group(1)), int(m.group(2)), ord(m.group(3)) if m.group(3) else -1)


def add_changelog_entry(new_str, items):
    entries = json.loads(CL.read_text(encoding='utf-8')) if CL.exists() else []
    existing = next((e for e in entries if e['version'] == new_str), None)
    if existing:
        if items:
            existing['items'] = items
            print(f'  changelog.json: {new_str} 已更新（{len(items)} 項）')
        else:
            print(f'  changelog.json: {new_str} 已存在，跳過')
    else:
        entries.append({'version': new_str, 'date': date.today().isoformat(),
                        'items': items or ['（待填寫）']})
        print(f'  changelog.json: 新增 {new_str}（{len(items)} 項）')
    entries.sort(key=lambda e: _ver_key(e['version']), reverse=True)
    CL.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


# ── 打包 ──
def pack(version):
    for old in ROOT.glob('wasteland-ol-v*.zip'):
        old.unlink()
    out = ROOT / f'wasteland-ol-{version}.zip'

    files = []
    for f in ROOT.rglob('*'):
        if not f.is_file():
            continue
        if f.suffix in SKIP_SUFFIX:
            continue
        if any(part in SKIP_DIRS for part in f.parts):
            continue
        if any(f.match(g) for g in SKIP_GLOBS):
            continue
        files.append(f)

    rels = {str(f.relative_to(ROOT)).replace('\\', '/') for f in files}
    missing = [m for m in MUST_HAVE if m not in rels]
    if missing:
        raise SystemExit(f'打包中止，缺少必含檔案：{missing}')

    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, Path(INNER) / f.relative_to(ROOT))
    print(f'  {out.name}: {out.stat().st_size // 1024} KB（{len(files)} 檔）')


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'show'
    cur = fmt(*get_version())

    if mode == 'show':
        print(f'當前版本：{cur}')
        items = read_changes()
        if items:
            print(f'CHANGES.md 待寫入（{len(items)} 項）：')
            for it in items:
                print(f'  - {it}')
        return

    if mode == 'pack':
        print(f'打包 {cur}...')
        update_build()
        pack(cur)
        print(f'完成：wasteland-ol-{cur}.zip')
        return

    new_str = fmt(*bump(mode))
    items = read_changes()
    print(f'版本：{cur} → {new_str}')
    if not items:
        print('  ⚠️  CHANGES.md 是空的，changelog 將填入「（待填寫）」')

    apply_version(cur, new_str)
    update_build()
    add_changelog_entry(new_str, items)
    if items:
        clear_changes(new_str)
    pack(new_str)
    print(f'\n✓ 完成！版本 {new_str}')


if __name__ == '__main__':
    main()
