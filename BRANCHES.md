# 分支策略 — ting-aoi.github.io

> 這個 repo 是**一站多專案**。動任何 git 之前先讀完本檔。
> （本檔放在根目錄是有原因的：原本規則只寫在 `futaba-bookshelf` 分支的 AI-CONTEXT 裡、
> 從未併進 `main`，導致從 main 開的新工作階段完全看不到，分支名因此走鐘過一次。）

## 前提

- GitHub Pages **只從 `main` 部署**。
- 各專案是 main 底下互不重疊的子資料夾：
  - `futaba-bookshelf/` → <https://ting-aoi.github.io/futaba-bookshelf/>
  - `wasteland-ol/` → <https://ting-aoi.github.io/wasteland-ol/>
- 所以 **`main` 本來就會包含全部專案**。那是整合分支＝部署分支，不是被污染。
  線上版要更新，就一定得合併進 main。

## 鐵則

1. **`main` 只接受合併，不直接提交。**
2. **合併一律走 PR，且由 Ting 親自按合併。**
   AI 只負責推分支＋開草稿 PR，**不得自行合併、不得直推 main**。
   Ting 要在手機上看完整 diff 才決定線上版何時更新。
3. **各專案只碰自己的分支與自己的資料夾。** 雙葉不動廢土的分支，廢土也不動雙葉的。

## 分支一覽

| 分支 | 樹內容 | 角色 |
|---|---|---|
| `main` | 全部專案 | 整合＋Pages 部署 |
| `futaba-bookshelf` | `.nojekyll` ＋ `futaba-bookshelf/` | 雙葉書庫開發（從 main 長出） |
| `wasteland-ol` | **只有廢土本體**（分支根＝專案根） | 廢土開發、事實來源。**orphan，與 main 無共同祖先** |
| `wasteland-ol-release` | main 完整樹 ＋ `wasteland-ol/` | 廢土上線用，**衍生物、永不手改** |

## 為什麼廢土要兩條分支

Ting 要求「分支內只留廢土」。從 main 長出來的分支若刪掉 `futaba-bookshelf/`，
**合併時會把雙葉從線上站台一併刪掉**——merge 是套用差異，分支裡的「刪除」會原封套到 main。

唯一能讓樹裡真的只有廢土又不誤傷雙葉的做法是 orphan 分支；
但 orphan 與 main 無共同祖先，GitHub 建不出 PR（422 No commits between），
會破壞「一律走 PR 由 Ting 合併」的鐵則。故拆成兩條：orphan 開發、release 上線。

`wasteland-ol` 由 `git subtree split --prefix=wasteland-ol` 切出，
**不是** `git checkout --orphan`——後者會丟掉全部版本歷史。

## 廢土上線同步流程

```bash
git fetch origin main wasteland-ol
git checkout -B wasteland-ol-release origin/main
git rm -r --quiet --cached wasteland-ol 2>/dev/null || true   # 整包移除→確保是鏡像而非疊加
git read-tree --prefix=wasteland-ol/ -u wasteland-ol
git commit -m "廢土 Online vX.Yz：自 wasteland-ol 分支同步"
git push -u origin wasteland-ol-release
# 開草稿 PR：wasteland-ol-release → main
```

**推送前必驗**（守住「合併不會刪掉雙葉」這條命）：

```bash
git diff --name-only origin/main...HEAD | cut -d/ -f1 | sort -u     # 只能有 wasteland-ol
git diff --name-only origin/main...HEAD -- futaba-bookshelf | wc -l # 必須是 0
```

合併後 PR 的 Files changed 也要親眼確認不含任何 `futaba-bookshelf/` 檔案。
