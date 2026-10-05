# #54：完整戰績表格圖片複製

## 已確認的需求

- 保留排名頁原有表格排版、字級、欄寬、排序及水平捲動。
- 各組右上角只增加複製圖示按鈕；不開 popup。
- 複製該組完整表格的 PNG 圖片，包含所有列、欄位與隊徽，不包含按鈕。
- 不複製文字、不下載、不存檔、不提供原生分享替代流程。
- 複製時不修改原表格或其捲動位置；提示以固定位置通知顯示，不推移表格。
- 不支援圖片剪貼簿或權限被拒絕時顯示中英文提示，保留重試能力。

## 實作

`assets/js/standings-image.js` 在點擊時凍結表格 DOM、排序、尺寸及 computed styles，將同來源隊徽轉成內嵌 PNG，再利用 SVG foreignObject 與 Canvas 輸出 2 倍解析度 PNG。輸出背景沿用原表格外層容器底色，避免透明背景貼到聊天軟體後失去對比。

剪貼簿寫入在原生點擊事件中立即開始，`ClipboardItem` 接收 PNG Promise，以保留 WebKit 所需的使用者操作情境。圖片只在瀏覽器記憶體中處理；不會上傳或自動儲存。

新模組已納入全部三種公開建置：靜態 Pages、本地 Test 與 Supabase Test／Production Pages。

## 驗證方法

```sh
npm ci --ignore-scripts
npm test
npm run build:pages
python3 -m http.server 8755 --bind 127.0.0.1
```

另開終端執行瀏覽器驗證（需預先安裝 Playwright 模組與 Chromium／WebKit；不會自動修改專案依賴）：

```sh
# Playwright 已可由 Node resolve 時不必設定 PLAYWRIGHT_MODULE_PATH。
# 若使用獨立測試工具，將 PLAYWRIGHT_MODULE_PATH 指向該工具的模組位置。
node scripts/verify-standings-image.cjs
```

可選環境變數：

- `PLAYWRIGHT_MODULE_PATH`：外部 Playwright 模組位置。
- `PLAYWRIGHT_BROWSERS_PATH`：測試瀏覽器安裝位置。
- `STANDINGS_TEST_URL`：測試的建置成品網址，預設本機 8755 的 `/pages-dist/`。
- `STANDINGS_EVIDENCE_DIR`：測試圖片與 JSON 輸出目錄。

瀏覽器驗證矩陣涵蓋 Chromium／WebKit、390／820／1280px、中文／英文、淺色／深色與 A／B 組，共 48 個案例。使用 `origin/main:index.html` 作為本次變更的排版基準，測量每格尺寸、文字、字型與顏色，並在測試中停用動畫以排除主題切換過渡造成的偽差異。

原生剪貼簿驗證：Chromium 使用寫入後讀回 PNG；WebKit 使用原生寫入後在測試專用可編輯區觸發貼上，讀回圖片 MIME 與大小。權限拒絕與重試路徑採注入失敗測試，與原生成功驗證分開。

## 驗證界線

Playwright 的 WebKit 與手機裝置模擬不等於 iPhone Safari 實機驗證。正式發布前仍需在 iPhone 的 HTTPS 頁面複製並貼到目標通訊／筆記 App 驗收。Telegram HTML 附件預覽若未執行 JavaScript，不能用來驗證複製功能。

本功能沒有資料庫、帳號、後端設定或正式部署變更。
