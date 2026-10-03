# 公開資料快照與批次發布

## 操作
- 後台「儲存比分」只寫入 Supabase；不會觸發部署。公開網站只讀同站 public-league.json，不建立 Supabase client。
- 啟用中的 admin 才可按「更新公開資料」，再以「查詢發布狀態」確認。派送成功僅表示 queued，不等於已發布。
- 快照顯示臺北時間的最後發布時間。發布失敗保留已發布 artifact，比分不受影響。
- 儲存結果不明時保留本次頁面記憶體中的草稿、封鎖重送，先按重新查核。草稿不保存到瀏覽器持久儲存，重整／登出後不保證保留。
- 匯入結果不明時不許重送；重新解析前先成功載入後端，核對差異後才可再次確認。

## 安全與依賴
- migration 010 增加環境內共用發布紀錄、service-only 預約函式、稽核及冷卻；不改既有比分或名冊。
- Edge Function publish-public-snapshot 以 Auth getUser 驗證 JWT，重新查核 active admin；repository、workflow、project 與 site 固定白名單。
- SNAPSHOT_GITHUB_TOKEN 必須為專用 fine-grained token，只允許對應 repository Actions read/write；不得使用既有廣權限 gh 認證，不得放前端或 Git。
- 未提供 token 時函式回覆 publication_not_configured，不派送任何 workflow。
- 生成資料只呼叫公開 RPC，逐欄白名單投影、名冊遮罩與資料一致性驗證；不下載 admin dataset，不含完整姓名、帳號或稽核內容。
- 公開 JSON 為部署 artifact，不 commit；程式版本與資料時間分離。

## 版本／併發
- refresh-public-snapshot.yml 在與程式發布相同的 concurrency group 內執行，cancel-in-progress=false。
- 先讀現行站點 release-manifest.json 與快照；checkout 精確 sourceCommit，不用最新 main。
- 正式版須有語意版本 tag，解析 annotated tag 的 commit 並驗證；Test 可使用完整功能 commit。
- 發布前重讀現行程式版本及 snapshotId；發現改變立即拒绝舊 artifact。部署後驗證精確 snapshotId 與 requestId。
- 初次啟用須先發布帶 manifest 的完整程式 artifact；舊站沒有 manifest 時拒絕猜測版本。
- GitHub 手動入口保留作為按鈕故障備援，但同樣需要 Supabase 公開資料可讀。

## Test repository 安裝
- Test 是部署 repository，不另存一份應用程式。
- 將 .github/deployment-templates/refresh-test-public-snapshot.yml 的 __ORCHESTRATOR_SHA__ 換成已 review／push 的完整 source SHA，放到 Test repository .github/workflows/refresh-public-snapshot.yml。
- 既有 Test pages.yml 的 concurrency 必須同為 test-pages、cancel-in-progress=false；手動部署用精確 source_ref SHA。
- Test 憑證只選 Test repository；正式憑證與正式 migration／函式部署另需確認。

## 本次驗收界線
- 本機自動測試涵蓋快照投影、拒絕跨環境／私密欄位、管理員限制、拒絕任意部署目標、儲存與刷新分離、斷線防重送。
- 私人工作簿整合依 OFFICIAL_XLSX，未設定時內層测试略過；npm audit 不涵蓋所有 vendored bundles。
- Test migration／Edge Function 部署曾遭授權確認逾時攔阻，未執行；須使用者重新確認，不能換工具繞過。
- 未配置專用 token；因此按鈕→Edge→Actions 的實際端到端驗收尚未完成。
- 不合併、不建立正式 tag、不部署正式站，不修改正式 DB、SMTP 或既有原目錄草稿。
