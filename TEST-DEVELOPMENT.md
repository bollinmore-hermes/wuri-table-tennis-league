# Test 開發與 Supabase backend contract

## 邊界

此階段建立可在本機與 CI 驗證的 Test build、資料 repository、migration contract 與 deterministic seed。它**沒有**完成 Supabase Cloud 部署，也**沒有**在真實 Postgres/Auth/Storage 上驗證 RLS。Docker daemon 與 Supabase Cloud 登入可用後，必須另做 runtime 驗證，才可宣稱權限已上線。

Production `npm run build:pages` 保持 static data source，輸出 `pages-dist/`，且不含管理後台、Supabase config、Excel 或管理程式。

## Test build

不帶 secrets 的結構驗證（產物為 `disabled`，public/admin 都 fail closed）：

```bash
npm run build:test
```

使用專用 **Test Supabase** 的前端公開設定：

```bash
SUPABASE_TEST_URL=https://YOUR_TEST_PROJECT.supabase.co \
SUPABASE_TEST_PUBLISHABLE_KEY=YOUR_TEST_PUBLISHABLE_KEY \
npm run build:test
```

輸出：

- `test-dist/public/`：公開網站，透過 `get_public_league` RPC 讀取 published 資料。
- `test-dist/admin/`：管理殼層與 Auth/RPC client；本階段不代表完整 CRUD UI 已完成。

正式 Test 發布流程必須加 `TEST_DEPLOYMENT=1`；缺少 URL/key 時 build 直接失敗：

```bash
TEST_DEPLOYMENT=1 SUPABASE_TEST_URL=... SUPABASE_TEST_PUBLISHABLE_KEY=... npm run build:test
```

Browser artifact 只允許 publishable/anon key。禁止 database password、JWT secret、service-role key。不要將 `.env.test.local` commit。

## Backend 與 seed

依序套用 `supabase/migrations/001...004`；`004_test_management_backend.sql` 是本階段新增 contract。它包含：

- curated public read RPC；browser 不直接讀 league base tables；
- admin/scorer fail-closed role checks、輸入限制、optimistic version、lock 與 audit；
- 球隊、賽事、賽果、角色與 transaction import RPC contract；
- `team-logos` public-read/admin-write Storage policy，只接受 PNG/WebP；圖像尺寸必須由 frontend 加未來的 server/Edge upload endpoint 驗證；
- Auth user 建立保留給未來 Edge Function；SQL/browser 不持有 privileged secret。

官方 seed 的唯一資料來源是 `assets/js/official-data.js`：

```bash
npm run generate:seed
```

產生 `supabase/seed-official.sql`（12 隊、60 場、26 筆比分），使用 conflict upsert，可重複執行。它不讀私人 Excel。

## 驗證

```bash
node --check assets/js/official-data.js
node --check assets/js/league-repository.js
node --check assets/js/app.js
node --check assets/js/admin.js
node --check scripts/build-pages.cjs
node --check scripts/build-test.cjs
node --check scripts/generate-official-seed.cjs
npm test
npm run build:pages
SUPABASE_TEST_URL=https://wuri-test.supabase.co \
SUPABASE_TEST_PUBLISHABLE_KEY=test-publishable-browser-key-000001 \
npm run build:test
npm audit
git diff --check
```

## 尚待 runtime 驗證

取得專用 Test project URL/key 與登入權限後，至少驗證 anon/authenticated/admin/scorer 四種角色、RPC grants、直接 table access 阻擋、optimistic conflict、locked result、audit、transaction rollback、Storage MIME/role policy，以及公開 RPC 不含 profile/audit/private contact。Production Supabase 不可用於這項測試。
