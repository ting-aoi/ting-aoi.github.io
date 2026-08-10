# 分支策略 — ting-aoi.github.io

> 這個 repo 是**一站多專案**。動任何 git 之前先讀完本檔。
> （本檔放在根目錄是有原因的：原本規則只寫在 `futaba-bookshelf` 分支的 AI-CONTEXT 裡、
> 從未併進 `main`，導致從 main 開的新工作階段完全看不到，分支名因此走鐘過一次。）

## 模型：一個專案一條分支，都回 main

```
futaba-bookshelf ─┐
                  ├─ PR ─→ main ─→ GitHub Pages
wasteland-ol ─────┘
```

- **一個專案一條分支，一個工作階段只碰自己那條。**
  雙葉書庫的 session 操作 `futaba-bookshelf`；廢土的 session 操作 `wasteland-ol`。
- **兩邊都把成果合併回 `main`**，線上版才會更新。
- 分支都是**從 main 正常長出來**的，所以合併不會有意外。

## 前提

- GitHub Pages **只從 `main` 部署**。
- 各專案是 main 底下互不重疊的子資料夾：
  - `futaba-bookshelf/` → <https://ting-aoi.github.io/futaba-bookshelf/>
  - `wasteland-ol/` → <https://ting-aoi.github.io/wasteland-ol/>
- 所以 **`main` 本來就會包含全部專案**。那是整合分支＝部署分支，不是被污染。

## 鐵則

1. **`main` 只接受合併，不直接提交。** 這條對所有專案都成立。
2. **合併權：兩個專案現在都是「AI 推完即自動合併」。**

   | 專案 | 合併權 |
   |---|---|
   | 雙葉書庫 `futaba-bookshelf` | **AI 推完即自動合併**（Ting 2026-08-10 指示，推翻同日稍早「由 Ting 親自按」的決定）。 |
   | 廢土 `wasteland-ol` | **AI 推完即自動合併**（Ting 2026-08-10 明確指示）。 |

   廢土的流程：推分支 → 確保 PR 存在且改為 ready → 合併進 main → 線上版更新。
   雙葉的流程：推分支 → `git merge --no-ff futaba-bookshelf` 進 main → 推送。
   兩者都留下可回溯的整合紀錄，不是把改動直接提交在 main 上。
3. **只碰自己專案的資料夾。**
   分支的檔案樹裡會看得到別的專案（那是從 main 繼承來的，正常），
   但**一行都不要動**。雙葉不碰廢土，廢土不碰雙葉。

## ⚠️ 絕對不要做的事

**不要為了「讓分支看起來乾淨」而刪掉別的專案資料夾。**

merge 是套用差異：分支裡的「刪除」會原封套到 main。在 `wasteland-ol` 分支刪掉
`futaba-bookshelf/`，合併之後**雙葉書庫就會從線上站台消失**。

分支的檔案樹包含全站內容是 git 的本質（分支是整棵樹的快照，不是資料夾）。
真正重要的是**差異**，推送前用這兩道檢查確認：

```bash
git diff --name-only origin/main...HEAD | cut -d/ -f1 | sort -u   # 只該有自己的專案資料夾
git diff --name-only origin/main...HEAD -- <別的專案> | wc -l      # 必須是 0
```

## 上線流程

```bash
git fetch origin main
git checkout -B <專案分支> origin/main   # 或 git merge origin/main 把 main 併進來
# …在自己的資料夾裡改…
git push -u origin <專案分支>
# 合併回 main（兩個專案現在都由 AI 推完即自動合併，見「鐵則 2」）
```
