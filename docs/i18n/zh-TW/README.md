[English](../../../README.md) | [简体中文](../zh-CN/README.md) | **繁體中文** | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<p align="center"><img src="../../../apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte 讓你的 GitHub 收件匣保持清靜。它會依排程檢查你各個 GitHub 帳號的通知，把符合規則的通知標示為完成，並為清除的每則通知留下歷史記錄。

這是一套供單一使用者自行架設的工具：由你自己執行、自己登入，權杖永遠不會離開你的伺服器。

## 功能

- **多個 GitHub 帳號**，每個帳號都有各自的輪詢間隔與「立即執行」按鈕。
- **在瀏覽器中建立規則**：以巢狀的條件群組 (全部符合、任一符合、皆不符合或未全部符合)，針對儲存庫、擁有者、原因、類型、狀態、標題、標籤、作者、審查者、受指派者、留言者與機器人偵測進行比對。編輯器還會把整條規則讀成一句話，巢狀邏輯一目了然。
- **Issue、Pull request 與 Discussion**：規則可以讀取這 3 類通知的詳細資訊，包括 Discussion 是否已有回答。
- **先預覽，再信任規則**：試跑 (dry run) 會顯示規則將清除目前哪些未讀通知，而不會變更任何內容。
- **歷史記錄與執行記錄**，支援搜尋與篩選，保留期限可自行設定。GitHub 無法還原已標示為完成的通知，因此每筆歷史記錄都會連結回原始討論串。
- **單一使用者登入**，可選擇開啟雙重驗證 (TOTP 與復原碼)。
- **SQLite、PostgreSQL 或 MySQL**。預設使用 SQLite，不需任何設定。
- **8 種介面語言**：English、简体中文、繁體中文、日本語、한국어、Русский、Français、Español。提供淺色與深色主題。
- HTTP API 的 **OpenAPI 描述**，並在 `/api/docs` 提供互動式文件。

## 快速開始

你需要安裝 Docker 與 Compose 外掛程式。

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

開啟 <http://localhost:3000>，建立擁有者帳號，接著：

1. 前往 **GitHub 帳號**，使用個人存取權杖連結帳號 ([如何建立權杖](#create-a-github-token))。
2. 前往 **規則**，建立一條規則，並用 **執行預覽** 確認它會清除哪些通知。
3. 等待下一次輪詢，或在該帳號上按下 **立即執行**。

資料存放在 `mewte-data` 這個 Docker volume 中。請備份這個 volume：裡面有資料庫，以及用來加密權杖的金鑰。

> 如果在你完成初始設定頁面之前，其他人就能連上這個執行個體，請先設定 `SETUP_TOKEN`。請參閱[設定](#configuration)。

<a id="create-a-github-token"></a>

## 建立 GitHub 權杖

Mewte 需要 **classic** 個人存取權杖。Fine-grained 權杖與 GitHub App 權杖無法讀取通知，因此 GitHub 會拒絕將它們用於此用途。

1. 在 GitHub 上依序開啟 **Settings**、**Developer settings**、**Personal access tokens**、**Tokens (classic)**。直接連結：<https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. 選擇 **Generate new token (classic)**，為權杖命名並設定到期日。
3. 選取權限範圍 (scopes)：

   | 權限範圍 | 是否需要 | 原因 |
   | --- | --- | --- |
   | `notifications` | 一律需要 | 讀取通知並將其標示為完成。 |
   | `repo` | 僅私有儲存庫需要 | 讓規則能讀取私有儲存庫中 issue、pull request 與 discussion 的作者、標籤、狀態、審查者、受指派者與留言。少了它，這些條件對私有儲存庫永遠不會符合。 |

4. 如果你的組織強制使用 SAML 單一登入，請選擇權杖旁的 **Configure SSO**，並授權該權杖存取該組織。
5. 複製權杖，然後在 Mewte 中依序前往 **GitHub 帳號**、**連結帳號**，將權杖貼上。

Mewte 會先將權杖加密再儲存，之後不會再次顯示。當 GitHub 不再接受某個權杖時 (已過期或遭撤銷)，Mewte 會暫停該帳號，並在儀表板上加以標示，直到你更換權杖為止。

## 規則的運作方式

一條規則包含名稱、優先順序、套用範圍 (所有帳號或指定帳號) 以及條件樹。唯一的動作是「標示為完成」。

- **順序**：針對每則未讀通知，規則會依優先順序的數字由小到大逐一檢查。以第一條符合的規則為準，歷史記錄也會記下這條規則。
- **群組**：群組決定其中條件的組合方式：全部符合、任一符合、皆不符合，或未全部符合。群組可以包含其他群組。
- **文字清單**：儲存庫、擁有者與人員類的條件可接受多個值。`*` 是萬用字元，因此 `acme/*` 會符合 `acme` 的所有儲存庫。比對時不區分大小寫。
- **標題**：「包含」或正規表示式，可選擇是否區分大小寫。
- **缺少資料時永遠不會符合**：有些條件需要 GitHub 不會隨通知提供的資料 (例如 release 的狀態，或是沒有 `repo` 權限範圍時私有儲存庫的詳細資料)。這類條件既不為真也不為假，依賴它的規則不會符合，即使經過反向也一樣。Mewte 寧可放著一則通知不處理，也不願誤清。
- **只在必要時才發出額外請求**：標籤、審查者或留言者等詳細資料，只會針對規則少了這些資料就無法判定的通知擷取，並會短暫快取。

只有未讀通知會納入考量。

<a id="configuration"></a>

## 設定

所有設定都透過環境變數指定。使用 Docker Compose 時，請將它們寫入 `compose.yaml` 旁的 `.env` 檔案；[.env.example](../../../.env.example) 說明了每一項設定。

| 變數 | 預設值 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (映像檔中為 `sqlite:///data/mewte.db`) | `sqlite://<path>`、`postgres://user:password@host:5432/db` 或 `mysql://user:password@host:3306/db`。 |
| `SECRET_KEY` | 使用 SQLite 時自動產生 | 用來加密已儲存 GitHub 權杖的金鑰，至少 32 個字元。使用 PostgreSQL 或 MySQL 時為必填。使用 SQLite 時，如果此值為空，Mewte 會在首次啟動時於 `DATA_DIR` 中建立 `secret.key`。可用 `openssl rand -base64 32` 產生。 |
| `SETUP_TOKEN` | 無 | 設定後，初始設定頁面會先要求輸入此值，才會建立擁有者帳號。 |
| `TRUST_PROXY` | `false` | 若位於會設定 `X-Forwarded-For`、`X-Forwarded-Host` 與 `X-Forwarded-Proto` 的反向代理之後，請設為 `true`。 |
| `COOKIE_SECURE` | `auto` | `auto`、`true` 或 `false`。`auto` 會在請求經由 HTTPS 送達時，將工作階段 cookie 標記為 Secure。 |
| `HOST` | `0.0.0.0` | 監聽的位址。 |
| `PORT` | `3000` | 監聽的連接埠。 |
| `DATA_DIR` | `./data` (映像檔中為 `/data`) | 使用 SQLite 時存放 `secret.key` 的位置。 |
| `GITHUB_API_URL` | `https://api.github.com` | REST API 的根網址。GitHub Enterprise Server 請使用 `https://<host>/api/v3`。 |
| `WEB_DIST` | 自動偵測 | 建置後的 Web 應用程式所在目錄。 |

Docker Compose 還會讀取 `MEWTE_PORT` (主機連接埠，預設為 `3000`) 與 `MEWTE_VERSION` (映像檔標籤，預設為 `latest`)。

變更或遺失 `SECRET_KEY` 會使已儲存的權杖無法讀取，屆時你必須重新輸入每個權杖。

### PostgreSQL 或 MySQL

`compose.yaml` 內建這兩種資料庫伺服器，並以 Compose profile 控制是否啟用。請在它旁邊建立 `.env` 檔案：

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<output of: openssl rand -base64 32>
```

若使用 MySQL，請改用 `COMPOSE_PROFILES=mysql` 與 `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`。接著執行 `docker compose up -d`。

若要使用你已在執行的資料庫伺服器，只需設定 `DATABASE_URL` 與 `SECRET_KEY`。Mewte 會在啟動時建立並升級資料表。

使用 PostgreSQL 與 MySQL 時，支援讓多個 Mewte 執行個體連到同一個資料庫：各執行個體會透過資料庫互相協調，因此同一個帳號絕不會同時被其中 2 個輪詢。SQLite 則只適用於單一執行個體。

### 置於反向代理之後

當 Mewte 可從你的機器以外連線時，請透過 HTTPS 提供服務。請保留原始的 `Host` 標頭 (Caddy 與 Traefik 預設如此；nginx 需加上 `proxy_set_header Host $host;`)，並設定 `TRUST_PROXY=true`，讓 Mewte 從 `X-Forwarded-*` 標頭讀取用戶端位址與通訊協定。否則所有訪客看起來都來自代理的位址，並共用同一份登入嘗試額度。

如果寫入請求的 `Origin` 與存取 Mewte 時所用的主機不符，Mewte 會加以拒絕。如果在代理之後每次儲存都失敗，並出現「此請求遭到拒絕」的訊息，表示代理改寫了 `Host`，卻沒有設定 `TRUST_PROXY=true`。

### 更新與備份

```bash
docker compose pull
docker compose up -d
```

資料庫遷移會在啟動時執行。使用 SQLite 時，請備份整個 `mewte-data` volume (資料庫與 `secret.key`)。使用 PostgreSQL 或 MySQL 時，請備份資料庫，並將 `SECRET_KEY` 妥善保存。

## 不使用 Docker 執行

你需要 [Bun](https://bun.sh) 1.4 或更新版本。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

伺服器會監聽 3000 連接埠，並將資料存放在 `./data`。Bun 會從你啟動它的目錄載入 `.env` 檔案。

若要自行建置 Docker 映像檔：

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

Web 介面的所有操作都透過 `/api` 底下的 HTTP API 進行。OpenAPI 3.1 文件位於 `/api/openapi.json`，互動式文件位於 `/api/docs`。請求會以登入後取得的工作階段 cookie 進行驗證。

## 安全性說明

- 密碼以 Argon2id 進行雜湊。密碼、雙重驗證的驗證碼或初始設定權杖錯誤時，會在 2 到 3 秒後才回傳結果，連續失敗時等待時間還會變長。15 分鐘內，失敗次數的上限為同一位址上的同一瀏覽器 5 次、同一位址 20 次、同一帳號 50 次；超過後在時間窗結束前會拒絕繼續嘗試。
- GitHub 權杖以 AES-256-GCM 加密，API 絕不會回傳權杖。
- 工作階段使用 HttpOnly、SameSite 的 cookie。變更密碼後，其他所有工作階段都會被登出。
- Mewte 只會將權杖傳送至所設定的 GitHub API 主機。

如要回報漏洞，請使用[私密漏洞回報](https://github.com/BlackHole1/Mewte/security/advisories/new)，不要開公開的 issue。

## 參與貢獻

開發環境的設定方式請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)，我們彼此相待的方式請參閱 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
