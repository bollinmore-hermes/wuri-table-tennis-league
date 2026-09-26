# 烏日桌球聯賽網站

本專案包含公開網站、賽務管理後台、Excel 匯入模組，以及 Supabase schema／RLS。

Test build、Supabase backend contract、repository 與 deterministic official seed 的操作及未驗證邊界請見 [`TEST-DEVELOPMENT.md`](TEST-DEVELOPMENT.md)。

## 本機展示模式

```bash
npm install
npm run generate:excel
npm test
npm run serve
```

開啟：

- 公開網站：http://127.0.0.1:8765/
- 管理後台：http://127.0.0.1:8765/admin.html

後台預設為 `local` 模式，不需要帳密。資料保存在瀏覽器 `localStorage`。請下載或使用：

`templates/wuri-league-demo-import.xlsx`

此檔的 `Results` 工作表有兩筆明確標示的假賽果，只供測試。合法團體比分為 `3–0`、`0–3`、`2–1`、`1–2`。

## Excel 工作表

後台會自動辨識兩種格式：

1. 標準匯入範本：

- `Teams`：球隊代碼、名稱、組別
- `Schedule`：賽事代碼、日期、時間、主客隊
- `Results`：比分與備註
- `StandingsSnapshot`：缺少歷史逐場比分時的官方基準戰績

2. 正式成績表：

- `A組成績`：A 組日期、對戰與比分
- `B組成績`：B 組日期、對戰與比分
- `即時排名`：A、B 組最新排名

正式成績表中的 `-`、`:`、`：` 與空白視為未完成；匯入時會以逐場比分重新計算排名並核對「即時排名」。

匯入採 upsert，不會因 Excel 缺少某一筆資料就刪除資料庫既有紀錄。檔案上限為 5 MB；非法比分、未知隊伍與未知賽事會阻止整批匯入。

## Supabase 模式

1. 啟動 Docker Desktop（Supabase CLI 已包含在專案 devDependencies，不需全域安裝）。
2. 執行 `npx supabase start` 與 `npx supabase db reset`。
3. 在 Supabase Auth 建立使用者。
4. 在 `profiles` 為使用者設定 `admin` 或 `scorer`；新帳號不會自動取得權限。
5. 編輯 `assets/js/config.js`：

```js
window.LEAGUE_CONFIG = Object.freeze({
  mode: "supabase",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_ANON_KEY",
  seasonCode: "2026-autumn-second-half"
});
```

`supabaseUrl` 與 anon/publishable key 可公開；**絕不可**把 service-role key、資料庫密碼或管理員密碼放進 GitHub Repository。

## 權限

- `admin`：Excel 匯入、比分登錄、操作紀錄。
- `scorer`：比分登錄；無法執行 Excel 匯入。
- 未設定 profile role：無後台權限。

安全規則位於 `supabase/migrations/`。`004_test_management_backend.sql` 新增 curated public RPC、管理 RPC contract、optimistic version/lock/audit 與 team-logo Storage policy；尚需在專用 Test project 做 runtime RLS 驗證。

## GitHub Pages

目前 Production GitHub Pages build 固定使用受版本控制的官方 static dataset，且排除全部管理資產。Test public build 才會依產物內生成的設定使用 Supabase 公開 RPC；不得把 Test 設定或管理後台混入 Production artifact。
