# Issues #26 / #27 — 第一階段：獨立賽事規則頁

## 範圍與資訊架構

- 以使用者已驗收的兩頁預覽為基準。首頁原季後賽卡片替換為 `賽事規則 →` 跨頁入口，不在首頁追加席位、Q 說明或頂部導覽項目。
- 獨立 `event-rules.html` 集中競賽規程、季後賽與資訊公布狀態。戰績頁保留摺疊說明並提供完整規則連結。
- 保留實際賽程、完整精簡戰績、球隊與名冊及場館入口；沒有帶入預覽佔位賽事。
- 已確認事項由使用者提供；沒有正式規程附件。未提供條款明確標示待確認／尚未公布。

## 已確認內容

適用賽季 `2026-autumn-second-half`：

- 每場三點，順序雙打、單打、單打，三點必須全部打完。
- 每點五戰三勝；每局十一分，十平後需領先兩分。
- A、B 組各前三名晉級。只列席位，不以暫時排名填入球隊。
- 季後賽日期 2026-12-06；詳細時間待公布。
- Q 代表主辦已確認並正式公布晉級，不依暫時前三自動推定。

## 明確未完成的後續範圍

1. #26：正式積分算法、同分比較、棄權／缺賽與其他例外、用球規格，待主辦確認。沒有改動現有計分／排序。
2. #27：首輪配對、種子、輪空、各輪路徑、季軍／名次賽、時間與桌次，待公布。沒有虛構完整對陣圖。
3. #27：管理者確認／公布 Q 的後台、資料儲存與權限流程未實作；這一階段只有意義與公布條件說明。
4. 使用者驗收 Test 後，正式合併與版本發布另行確認。兩個 Issue 保持開啟；PR 不使用自動關閉指令。

## 變更檔案

- `index.html`、`assets/js/app.js`：入口、排名說明、中英文字與安全的四個既有頁面 hash 導覽。
- `event-rules.html`、`assets/css/event-rules.css`：獨立頁與已驗收版面。
- `assets/js/event-rules-data.js`：已確認事實、中英字典及 `null` 的待確認政策。
- `assets/js/event-rules.js`：安全 DOM 呈現，不呼叫聯賽 RPC、不取得名冊、不寫入賽事資料。
- 三個 public builders：明確納入規則頁與資源 allowlist。
- `tests/event-rules.test.cjs`、`scripts/verify-event-rules-browser.cjs`：內容、隔離、資源、雙語與瀏覽器互動回歸。

## 驗證

- `npm test`：110 項通過；測試檔內的私人 `OFFICIAL_XLSX` 工作簿整合測試未設定，仍略過。
- `npm audit --omit=dev`：0 vulnerabilities。這不等同完整審計 vendored SDK。
- 靜態、local Test、backend-enabled Test／Production builders 的結構測試通過；沒有操作 Production 部署。
- 實際建置瀏覽器矩陣：360／390／768／1280 px × 中文／英文 × 淺色／深色，兩頁共 32 組。
- 160 次跨頁操作、16 次 Enter 鍵入口操作；測試所有四個返回導覽、戰績規則入口、locale／theme 保留、無水平溢出與 JS 例外。
- 額外驗證系統主題變更、localStorage 被阻擋、聯賽資料 disabled 時規則頁仍可使用。
- 線上 Test 的 commit、部署 run 與 live verification 結果記錄於 PR 驗證留言；不能把本機驗證當成線上部署證據。

瀏覽器驗證需要可使用內建 `WebSocket` 的 Node、在 `127.0.0.1:9222` 開啟 CDP 的 Chrome，以及已存在的證據輸出目錄。它使用隔離 browser context，不登入管理者、不呼叫任何資料寫入 API：

```sh
node scripts/verify-event-rules-browser.cjs <site-root-with-trailing-slash> <evidence-json>
```

## 副作用與回復

新增靜態頁、資源、測試與文件；無新增套件、migration、資料庫寫入或正式設定變更。Test 僅由已確認 feature commit 部署；需回復時，可重新 dispatch 上次已驗證的 Test source SHA。Production 維持既有正式版本。
