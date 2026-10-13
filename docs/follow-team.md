# Issue #32 — 我關注的球隊

## 功能與邊界
- 公開首頁最上方（主視覺下）可自行選擇一隊，不強制選擇、不需登入、不代表球員所屬隊伍。
- 使用球隊代碼及賽季隔離的 LocalStorage key `wuriLeagueFollow:<seasonCode>`，可更換、取消及跨同源分頁同步；不跨裝置同步。
- 顯示目前公開資料的組內排名，以及臺灣時間尚未開始且尚無正式賽果的下一場比賽、時間與對手。
- 排名使用既有預設積分排序，不跟著使用者在戰績頁選擇的欄位排序變化；不新增晉級規則或魔術數字。
- 現有公開資料契約未提供桌號，因此顯示「桌號待公布」。正式桌號資料接入屬 #24 的範圍，本功能不推算桌號。
- 無後續賽程、球隊不再參賽、資料未載入與儲存不可用均有安全提示；儲存失敗仍可在目前分頁使用。
- 無資料庫、Auth、比分、帳號或任何伺服器端寫入。

## 自動驗證
```sh
node --test tests/follow-team.test.cjs
npm test
npm audit --omit=dev
node --check scripts/verify-follow-team-browser.cjs
git diff --check
```

可重複的 Chrome 驗證（macOS Google Chrome；使用獨立臨時 profile，不接觸個人登入）：
```sh
node scripts/verify-follow-team-browser.cjs <public-url> <evidence-directory>
```
涵蓋 320 / 390 / 768 / 1280px、中文／英文、淺色／深色共 16 組；重新載入保留、更換、取消及焦點、球隊導覽、已移除球隊、無後續賽程與儲存失敗。邊界情境只改驗證瀏覽器的記憶體，不修改遠端資料。瀏覽器幾何與操作驗證不替代實機及美觀驗收。證據與隔離 Chrome profile 保留在工作／scratch 目錄。

完整套件可能因 `OFFICIAL_XLSX` 未設定略過私人工作簿整合；外層 skipped=0 不代表該整合已執行。npm audit 不完整涵蓋 vendored browser bundles。

## 使用者 Test 驗收
1. 打開固定 Test 首頁，在「我關注的球隊」選一隊。
2. 確認出現該隊、組內排名、下一場日期／時間與對手（若沒有後續賽程則顯示提示）。
3. 重新整理，確認保留同一隊；改選另一隊，確認摘要同步更新。
4. 按「查看球隊賽程」，確認打開的是選定隊伍。
5. 回首頁按「取消關注」，重新整理後確認恢復未選擇。
6. 手機查看是否易讀；可切換 EN 與深色模式。

回覆格式：`#32 驗收通過`，或指出裝置／步驟／畫面問題。Test 驗收不等於正式站部署授權。
