[English](../../../CONTRIBUTING.md) | [简体中文](../zh-CN/CONTRIBUTING.md) | **繁體中文** | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md)

# 為 Mewte 做出貢獻

感謝你撥冗協助。錯誤回報、想法、翻譯與程式碼，我們都歡迎。參與即表示你同意遵守[行為準則](CODE_OF_CONDUCT.md)。

## 回報錯誤與提議變更

- 請先搜尋[現有的 issue](https://github.com/BlackHole1/Mewte/issues)。
- 回報錯誤時，請說明你做了什麼、預期的結果以及實際發生的情況，並附上 Mewte 版本、使用的資料庫，以及執行記錄中的相關內容。切勿貼上權杖。
- 若是較大的變更，請在動手寫程式之前先開 issue，讓我們先就方向達成共識。
- 安全性問題請透過[私密漏洞回報](https://github.com/BlackHole1/Mewte/security/advisories/new)回報，不要開公開的 issue。

## 開發環境設定

你需要 [Bun](https://bun.sh) 1.4 或更新版本。只有 PostgreSQL 與 MySQL 的測試才需要 Docker。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install
bun run dev
```

`bun run dev` 會在 <http://localhost:3000> 啟動 API，並在 <http://localhost:5173> 啟動 Web 應用程式。請開啟第 2 個網址；它會將 `/api` 代理到第 1 個網址。資料會寫入 `apps/server/data`，該目錄已被 Git 忽略。

### 不使用真實的 GitHub 權杖試用

儲存庫內附一個小型的 GitHub API 替身，並帶有範例通知：

```bash
bun apps/server/src/testing/demo.ts
```

在另一個終端機中執行：

```bash
GITHUB_API_URL=http://localhost:3999 DATA_DIR=./data/demo DATABASE_URL=sqlite://./data/demo/mewte.db bun run dev
```

使用第 1 個指令印出的權杖連結帳號。

## 專案結構

| 路徑 | 內容 |
| --- | --- |
| `packages/shared` | zod schema、共用型別與規則引擎。純程式碼，不含任何 I/O。 |
| `packages/db` | 以 Kysely 存取 SQLite、PostgreSQL 與 MySQL 資料庫，另含遷移。 |
| `apps/server` | Hono API、GitHub 用戶端、排程器與執行器。 |
| `apps/web` | React 介面 (Vite、Tailwind CSS、coss ui、react-i18next)。 |
| `docs/i18n/<locale>` | 文件的翻譯。 |

## 檢查

開 pull request 之前，請先執行以下指令。CI 也會執行相同的指令。

| 指令 | 作用 |
| --- | --- |
| `bun run lint` | 以 oxlint 進行 lint 檢查。 |
| `bun run fmt` | 以 oxfmt 格式化。`bun run fmt:check` 只做檢查。 |
| `bun run typecheck` | 對每個 workspace 進行型別檢查。 |
| `bun run test` | 以 Vitest 執行測試，使用 SQLite。 |
| `bun run build` | 建置每個 workspace。 |

若也要針對 PostgreSQL 與 MySQL 執行資料庫測試：

```bash
docker compose -f compose.test.yaml up -d
cp .env.test.example .env.test
bun run test:all
```

## 準則

- **測試**：變更規則引擎時，需要為新的行為補上測試。修正錯誤時，應附上一個在未修正時會失敗的測試。
- **資料庫**：每個查詢都必須能在全部 3 種資料庫上運作。請遵循 `packages/db` 的慣例 (字串 id 由應用程式產生、時間戳記使用 epoch 毫秒、不使用 `RETURNING`)，並新增遷移，而不是修改已發布的遷移。
- **API**：請在 `packages/shared` 中以 zod schema 定義請求與回應的結構，並用 `@hono/zod-openapi` 註冊路由，讓 OpenAPI 文件保持正確。API 的描述以英文撰寫。
- **介面文字**：元件中不得寫死文案。請在 `apps/web/src/i18n/locales/en.json` 以及其他 7 個語系檔中新增鍵。這些檔案彼此不一致時，會有測試失敗。
- **介面元件**：請使用 `apps/web/src/components/ui` 中的 coss ui 元件及其色彩 token。淺色與深色主題都要檢查。
- **Commit 與 pull request**：標題請以英文撰寫，並使用祈使語氣 ("Add label condition")。每個 pull request 只處理 1 個主題，並說明為何需要這項變更。

## 翻譯

介面語言位於 `apps/web/src/i18n/locales/<locale>.json`。若要改善翻譯，請編輯該語言的檔案。鍵與 `{{placeholders}}` 必須與 `en.json` 完全一致。

若要新增語言，請將語言代碼加入 `packages/shared/src/constants.ts` 的 `LOCALES`，在 `apps/web/src/i18n/index.ts` 中加入語系檔與語言名稱，並以相同的檔名將文件翻譯到 `docs/i18n/<locale>/`。每份文件都以語言列開頭；請在每份文件的語言列中加入新語言。

一切以儲存庫根目錄的英文文件為準。修改其中任何一份時，請一併更新翻譯，或在 pull request 中註明哪些翻譯仍待更新。

## 發布

發布由 **Release** 工作流程完成，需要在 Actions 頁面針對 `main` 分支手動執行。發布不會產生任何提交。

1. **version** 留空時，會依所選的 **bump** (patch、minor 或 major) 在最新的 `vX.Y.Z` 標籤基礎上遞增；也可以直接填入確切的 `X.Y.Z`。
2. 工作流程會建置映像檔，確認它可以啟動，然後以 `X.Y.Z`、`X.Y` 和 `latest` 推送到 `ghcr.io/blackhole1/mewte`，支援 linux/amd64 與 linux/arm64。
3. 接著為該提交加上 `vX.Y.Z` 標籤，並發布附有自動產生說明的 GitHub Release。

如果在映像檔推送之後執行失敗，請選擇 **Re-run failed jobs**：標籤與 Release 只會在缺少時建立。
