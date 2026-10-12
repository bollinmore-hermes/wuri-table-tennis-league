# Issue 53：裁判回報與賽果核對

## 範圍與界線

- 一個賽季／日期共用一個匿名能力連結，`/referee/#token=…`；fragment 不加入 HTTP 路徑，並設定 no-referrer。
- 裁判回報只寫入獨立的回報／請求表；不寫正式結果，不發布，不辨識裁判身分。
- 有效 admin/scorer 在登入後的「比分登錄」列表操作；保留原有桌面表格（日期／時間、組別、對戰、比分、狀態、操作）及手機卡片。scorer 可改他人未鎖定結果；連結管理及鎖定只允許 admin。
- 列表保留日期／組別／搜尋／狀態篩選；狀態下拉依序為「全部、需核對、待登錄、完成」，場次狀態與按鈕對應「需核對→核對、待登錄→登錄、完成→修改」；比分輸入及候選回報不在列表展開。依場次狀態按「核對／登錄／修改」開啟該場比分 popup，不新增另一個比分作業頁面，賽程管理仍只讀比分。
- 工作狀態保留「需核對／待登錄／完成」及「全部」篩選：有待處理回報且無正式結果為需核對；無回報且無正式結果為待登錄；正式結果存在優先歸完成，不依鎖定／發布或回報衝突區分。
- Popup 顯示日期、時間、組別、場次、左右隊名、候選比分與回報時間，以及「自行輸入／依紙本補登」。單筆合法回報預選，衝突不預選；選候選填入兩邊比分但不寫入，手改比分自動切為自行輸入。每隊名在 popup 只列一次。
- Popup 唯一比分主按鈕為「儲存」；取消、關閉、Escape 及背景點擊不寫入並捨棄未儲存草稿。儲存成功且原請求讀回驗證通過後關閉 popup、更新列表並保留場次／比分回饋。已確認儲存後刷新失敗，不當作未寫入。
- 寫入中／結果不確定／讀回查證期間禁止關閉、換場或重送；保留原請求，查證後才解凍。已鎖定 scorer 禁止開啟編輯，handler 與後端仍強制同樣限制。鎖定、儲存及公開發布保持不同操作。
- `scripts/verify-review-layout-browser.cjs` 使用真實 Test admin 登入及既有 60 場唯讀資料驗證原列表與 popup；採用回報／手動／取消／儲存更新的互動用頁面內模型，不呼叫遠端比分 mutation。檢查 360/390/768/1280 寬度、Tab 焦點、Escape／關閉與背景捲動恢復。
- `014_daily_score_reporting.sql` 已在 Test 套用；Production 未套用，PR 維持 Draft，Issue 保持 Open。
- 本次不修改出場序原表。實際原檔／產生器未提供，僅交付可下載／列印的日期 QR 區塊。

## 比分 popup 驗收（已驗收的介面契約）

- 主畫面依原有桌面表格／手機卡片，入口為「比分登錄」，場次按鈕依狀態顯示「核對／登錄／修改」，比分作業不使用「登入」。
- 人工先做不寫入驗收：切「需核對」，按「核對」開有回報的場次，選一筆確認兩邊比分帶入；改下拉應選中自行輸入；按取消再開應回復未儲存前資料。切「待登錄」應顯示「登錄」並可直接輸入；切「完成」應顯示「修改」。
- 比分 popup 交付時完整回歸 240 項通過；`npm audit --omit=dev` 零弱點。私人正式工作簿的選用整合測試未執行。
- Chrome 唯讀原始 Test 資料 + 頁面記憶體互動模型驗證，涵蓋 360/390/768/1280 寬度；遠端比分寫入為零。本輪未新增 DB fixture、migration、依賴或 Production 部署。
- 實際 Test 部署來源 SHA、Actions run 與 hosted 驗證結果另記 PR #57 留言；本機證據不代表 hosted 成功。

## 回報連結整合至賽程管理

- 移除側邊「回報連結管理」及獨立頁面；賽程管理每個日期標題提供 admin-only「回報連結」。日期取自該群組的完整原始日期，與組別／搜尋篩選無關。
- Popup 自動查核原日期，不再提供日期下拉。無有效連結時只顯示「產生回報連結」；有效時顯示 QR、「複製連結／下載 QR」，次要操作「預覽回報頁／列印」。正常畫面不常駐重查按鈕，讀取或顯示失敗才顯示「重試」。
- 「停用／換發」放在預設折疊的進階管理，保留失效警告与確認。不確定 mutation 及 mutation 讀回期間禁止關閉、換日及重送；唯讀載入可關閉，舊查詢回應不能蓋掉新日期。
- Popup 開啟不自動產生連結，不改後端權限／交易；比分登錄保持已驗收的狀態、按鈕與 popup。admin DOM helper 以 `setAttribute` 設定多詞 `data-report-date`，避免瀏覽器拒絕非法 DOMStringMap key。
- 本輪完整回歸 254 項通過；`npm audit --omit=dev` 零弱點。未執行私人正式工作簿選用整合測試。
- 主要驗證器為 `scripts/verify-schedule-links-browser.cjs`：真實 Test admin、每個既有日期的原生唯讀查核、四寬度 modal／焦點與日期綁定。create／rotate／revoke／未知結果恢復及分享操作在記憶體模型中測試；QR 截圖為明確合成連結，不代表遠端 mutation。
- 原有 `verify-daily-reporting-browser.cjs` 是早期寫入驗證器，其獨立連結頁選擇器不適用新流程；本輪不執行，也不因視覺驗收建立遠端 fixture。手機實機複製、下载及列印仍待人工驗收。
- 已確認既有賽程列在 768px 有整頁橫向溢出（修改前 hosted `bcc0072` 同樣存在），本輪不修改該賽程列布局；新 popup 在該寬度仍無內容溢出、可關閉與操作。

## 儲存與交易

`confirm_reported_result` 以同一交易執行既有正式比分寫入、回報處理狀態、請求收據及稽核；關閉回報由正式結果存在與否決定，不改動同日其他場次。保留原始回報、採用來源與正式更正前後資料。

匿名提交依當日連結與場次 row locks 序列化，合法比分、版本、角色／鎖定、原請求識別都由伺服器檢查。相同比分保留單一回報，不同比分保留候選。每個日連結每 10 分鐘最多 120 次新提交（原請求重送不增加次數）。這是 capability 級別限流，持有連結的人仍可能消耗共享額度；不是已驗證裁判身份或 IP 級反濫用系統。

所有正式儲存先讀回原請求收據，再回報已確認儲存；載入失敗不撤銷成功寫入。未確認的 transport failure 凍結原場次、比分及請求，先查證才能重送。匿名返回清單也受凍結限制。連結換發結果不確定時亦禁止再次 mutation，先重新查核。

儲存、鎖定及公開發布為獨立操作。沿用既有 snapshot／發布工作流，不因匿名回報自動公開。草稿只保存於目前頁面記憶體，重新整理不保證保留；不將私人資料或憑證存為草稿。

## 驗證與證據

- `npm test`：完整回歸，包括正式 artifact allowlist、比分 popup handler、裁判 handler、連結 handler 與網路例外。
- `node scripts/verify-reporting-mutations.cjs`：隔離複本恢復四種錯誤行為，確認新測試會失敗，原始碼不被修改。
- `node scripts/verify-reporting-authorization-mutation.cjs`：僅對 Test，在可回滾交易中將 queue guard 替換為 NULL-unsafe predicate，確認權限回歸測試抓到，再驗證正常 guards；不是 Production 操作。
- `npx --no-install supabase db query --linked --project-ref vppjcjfbcoxzofcuxmzz --file scripts/verify-daily-reporting.sql`：真實 PostgreSQL 角色 context、admin/scorer／無角色、跨日／跨季、去重／衝突、限流、來源與版本、鎖定與交易／Audit；全部 fixture changes 回滾。這不等於真實 scorer JWT 驗證。
- `node scripts/verify-daily-reporting-api.cjs`：真實 Test admin Auth、匿名 PostgREST、直接表存取拒絕、正式公開 projection hash 不變。每次執行留下一個獨立合成賽季、4 隊、4 場及回報資料。
- `node scripts/verify-daily-reporting-browser.cjs [artifact-base]`：真實 Chrome、Auth/RPC、卡片操作／讀回、360/390/768/1280 寬度、QR canvas 解碼及實際剪貼簿讀回。
- `docs/evidence/issue-53/` 是 pre-commit 本機 artifact 的功能證據，並非部署 commit 證明。確切來源 SHA、Test Actions run 與 live byte comparison 記錄在 PR 的部署留言。
- Browser verifier 僅將 `seasonCode` 指向獨立合成賽季；介面、Auth、網路與 DB 均真實。截圖顯示合成队伍與遮罩管理者名稱，不保存 token／帳密。
- Hosted 再驗證可用 `REPORTING_EVIDENCE_DIR=.private/hosted-evidence`，避免將未清理的遠端／憑證檔納入提交。日連結 token 只在 gitignored `.private/issue53-fixture.json`；不可分享或提交該檔。
- API/browser 驗證資料與稽核保留在 Test，不自動刪除；browser 完成後停用合成日期連結。既有賽季資料不得拿來自動試寫。

### 仍需人工驗收

- 真實受邀 scorer 在 hosted Test 的登入／操作；目前 SQL role context 與 UI handler 已驗證，未宣稱 scorer JWT／瀏覽器全流程完成。Test 目前沒有停用 profile，因此停用後保留舊 JWT 的拒絕路徑只有既有授權契約覆蓋，尚未做真實帳號操作；不為測試停用既有使用者。
- 手機實機掃描下載的 QR、實際列印與紙張可讀性；Chrome 解碼成功不能代替實物驗收。
- 出場序原檔整合，等待原檔及另外批准。
- Production migration、merge、tag 與發布，都未在本次批准範圍。

## Test 人工操作清單

入口：`https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/admin/`。

1. admin 登入後開「比分登錄」；保留桌面表格／手機卡片，日期／組別／搜尋取交集。依狀態按「核對／登錄／修改」才開 popup，數字不得被箭頭遮住。
2. 開「賽程管理」，按指定日期標題旁的「回報連結」；先驗收日期與自動查核，已有連結可複製及下載 QR，重複取用保持相同連結。無連結時須另外按「產生回報連結」，才會留下 Test 連結及稽核。用手機掃碼確認免登入選場；不要對已確認場次要求一般回報。
3. 若送一筆測試回報，應顯示待核對、尚非正式結果；管理者可看到候選，選擇／手改下拉不應立即存成正式結果。此動作會留下 Test 回報，不可把它當作正式賽事資料。
4. 若要人工驗證儲存，可選一場已有正式结果且未鎖定的 Test 場次，先記下原比分與備註；改成另一個合法比分並按「儲存」，應看到場次與比分的持續回饋。立刻還原原比分與備註，再按「儲存」。不按鎖定；無須手動發布。兩次更正均留下稽核，且既有自動發布可能暫時將更動公開在 Test 網站，與 Production 無關。
5. scorer 登入應只可核對／更正未鎖定結果，不可管理帳號／球隊／賽程／連結；已鎖定場次不可更正。

回覆格式：`手機型號／瀏覽器；掃碼：通過或問題；比分 popup：通過或問題；scorer：通過或未測；如有更正：已還原／未操作`。

## 相依套件與回復

新增 `qrcode@1.5.4`（本機 QR，無外部 QR service）；開發驗證使用 `esbuild@0.25.12`、`jsqr@1.4.0`、`linkedom@0.18.12`。QR browser bundle 與 MIT license 一併保存；`node scripts/build-report-qr.cjs` 可重建。既有套件未因本功能任意升級。

Test frontend 可重新 dispatch 先前已驗證、與目前 schema 相容的 source SHA 回復；新增表可保留，不在回復時破壞稽核。Production 只能走另行批准的 migration／tag-only 正式發布流程。
