<div align="center">

[English](../../../README.md) | [简体中文](../zh-CN/README.md) | **繁體中文** | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

讓 GitHub 收件匣保持清靜：依你的規則自動把通知標示為完成的自架工具。

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../../docs/screenshots/zh-TW/dashboard-dark.png">
  <img src="../../../docs/screenshots/zh-TW/dashboard.png" alt="Mewte 儀表板" width="820">
</picture>

</div>

Mewte 會定時檢查你的 GitHub 帳號通知，把符合規則的標示為完成，並保留歷史記錄。它由你自己執行，權杖不會離開你的伺服器。

## 功能

- 支援多個 GitHub 帳號，各自設定輪詢間隔。
- 在瀏覽器中設定規則，條件可巢狀，涵蓋儲存庫、原因、類型、狀態、標題、標籤、作者等。
- 規則同時也是一個 YAML 檔案，你或 AI 助理不必開啟瀏覽器就能修改。
- 支援 Issue、Pull request 與 Discussion。
- 信任一條規則之前，可以先預覽它會清除哪些通知。
- 清除過的通知都有歷史記錄，並附上原始連結。
- 單一使用者登入，可啟用雙重驗證。
- 支援 SQLite、PostgreSQL 與 MySQL。
- 8 種介面語言，淺色與深色主題。

## 螢幕截圖

<table>
  <tr>
    <td rowspan="2" width="50%" valign="top">
      <img src="../../../docs/screenshots/zh-TW/rule-editor.png" alt="巢狀條件，並可預覽規則會清除哪些通知"><br>
      <sub>巢狀條件，並可預覽規則會清除哪些通知</sub>
    </td>
    <td width="50%" valign="top">
      <img src="../../../docs/screenshots/zh-TW/rules.png" alt="規則由上而下依序比對"><br>
      <sub>規則由上而下依序比對</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="../../../docs/screenshots/zh-TW/history.png" alt="規則清除過的每一則通知"><br>
      <sub>規則清除過的每一則通知</sub>
    </td>
  </tr>
</table>

## 快速開始

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

開啟 <http://localhost:3000>，建立擁有者帳號，連結 GitHub 帳號，然後新增規則。

資料儲存在 `mewte-data` 磁碟區，其中包含加密權杖的金鑰，請務必備份。

## GitHub 權杖

Mewte 需要 **classic** 個人存取權杖 ([按此建立](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte))。Fine-grained 權杖與 GitHub App 權杖無法讀取通知。

| 權限範圍 | 是否需要 |
| --- | --- |
| `notifications` | 一律需要 |
| `repo` | 僅在規則要讀取私人儲存庫的詳細資訊時 |

權杖會加密儲存，之後不會再顯示。如果組織啟用了 SAML 單一登入，還需為該組織授權權杖。

## 規則

- 規則依優先順序逐一檢查，以第 1 條符合的為準。只處理未讀通知。
- 條件群組可以要求其中的條件全部符合、任一符合、全部不符合或未全部符合，並且可以巢狀。
- `*` 是萬用字元：`acme/*` 會比對 `acme` 底下的所有儲存庫。
- 條件所需的資料如果 GitHub 沒有提供，該條件永遠不會符合，以免誤清除。
- GitHub 無法還原已標示為完成的通知，歷史記錄中保留了每則通知的連結。

### 規則檔案

規則會同步到資料目錄下的 `rules.yaml`。檔案有變更時 Mewte 會自動載入，在瀏覽器中儲存規則時則會重寫該檔案。請先修改一份副本，驗證通過後再取代原檔案：

```bash
docker compose exec mewte mewte validate-rules /data/rules.new.yaml
```

檔案格式的說明位於你的執行個體的 `/llms.txt`，寫法方便直接交給 AI 助理來修改。

## 設定

所有設定都是環境變數。使用 Docker Compose 時，請寫入與 `compose.yaml` 同目錄的 `.env` 檔案。完整清單請見 [.env.example](../../../.env.example)。

| 變數 | 預設值 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | 資料磁碟區中的 SQLite | `sqlite://<path>`、`postgres://...` 或 `mysql://...` |
| `SECRET_KEY` | 使用 SQLite 時自動產生 | 用來加密已儲存的權杖。使用 PostgreSQL 或 MySQL 時為必填。 |
| `SETUP_TOKEN` | 無 | 設定後，初始設定頁面會先要求輸入此值，才會建立擁有者帳號。 |
| `TRUST_PROXY` | `false` | 位於反向代理之後時請設為 `true`。 |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub Enterprise Server 請使用 `https://<host>/api/v3`。 |
| `RULES_FILE` | 使用 SQLite 時為資料磁碟區中的 `rules.yaml`，否則無 | 規則檔案的路徑。設為 `off` 可停用。 |
| `MEWTE_PORT` | `3000` | Docker Compose 使用的主機連接埠。 |

遺失 `SECRET_KEY` 後，已儲存的權杖將無法讀取。

### PostgreSQL 或 MySQL

`compose.yaml` 以 Compose profile 內建了這兩種資料庫。在 `.env` 中寫入：

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

使用 MySQL 時，請改為 `COMPOSE_PROFILES=mysql` 與 `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`。

### 反向代理

請透過 HTTPS 提供服務，保留原始的 `Host` 標頭，並設定 `TRUST_PROXY=true`。

### 更新

```bash
docker compose pull
docker compose up -d
```

## 不使用 Docker

需要 [Bun](https://bun.sh) 1.4 或更新版本。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

網頁介面透過 `/api` 底下的 HTTP API 運作。互動式文件位於 `/api/docs`，OpenAPI 文件位於 `/api/openapi.json`。

## 安全性

- 密碼以 Argon2id 雜湊。GitHub 權杖以 AES-256-GCM 加密，API 不會回傳權杖。
- 登入失敗會延遲回應，並依瀏覽器、位址與帳號限制嘗試次數。
- 回報漏洞請使用[私密漏洞回報](https://github.com/BlackHole1/Mewte/security/advisories/new)，不要開公開的 issue。

## 參與貢獻

請參閱 [CONTRIBUTING.md](CONTRIBUTING.md) 與 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 授權條款

[MIT](../../../LICENSE)
