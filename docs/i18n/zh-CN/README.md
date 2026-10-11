<div align="center">

[English](../../../README.md) | **简体中文** | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

让 GitHub 收件箱保持清净：按你的规则自动把通知标记为已完成的自托管工具。

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

</div>

Mewte 定时检查你的 GitHub 账号通知，把符合规则的标记为已完成，并保留历史记录。它由你自己运行，令牌不会离开你的服务器。

## 功能特性

- 支持多个 GitHub 账号，各自设置轮询间隔。
- 在浏览器中配置规则，条件可嵌套，涵盖仓库、原因、类型、状态、标题、标签、作者等。
- 规则同时也是一个 YAML 文件，你或 AI 助手不打开浏览器就能修改。
- 支持 Issue、Pull request 和 Discussion。
- 信任一条规则之前，可以先预览它会清理哪些通知。
- 清理过的通知都有历史记录，并附原始链接。
- 单用户登录，可开启双因素认证。
- 支持 SQLite、PostgreSQL 和 MySQL。
- 8 种界面语言，浅色和深色主题。

## 快速开始

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

打开 <http://localhost:3000>，创建所有者账号，连接 GitHub 账号，然后添加规则。

数据保存在 `mewte-data` 卷中，其中包含加密令牌的密钥，请做好备份。

## GitHub 令牌

Mewte 需要 **classic** 个人访问令牌 ([点此创建](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte))。Fine-grained 令牌和 GitHub App 令牌无法读取通知。

| 作用域 | 何时需要 |
| --- | --- |
| `notifications` | 始终需要 |
| `repo` | 仅当规则要读取私有仓库的详细信息时 |

令牌加密存储，之后不会再显示。如果组织启用了 SAML 单点登录，还需为该组织授权令牌。

## 规则

- 规则按优先级依次检查，以第 1 条匹配的为准。只处理未读通知。
- 条件组可以要求其中的条件全部满足、任一满足、均不满足或未全部满足，并且可以嵌套。
- `*` 是通配符：`acme/*` 匹配 `acme` 下的所有仓库。
- 条件所需的数据如果 GitHub 没有提供，该条件永不匹配，以免误清理。
- GitHub 无法恢复已标记为完成的通知，历史记录中保留了每条通知的链接。

### 规则文件

规则会同步到数据目录下的 `rules.yaml`。文件有改动时 Mewte 会自动加载，在浏览器中保存规则时则会重写该文件。请先修改一份副本，校验通过后再替换原文件：

```bash
docker compose exec mewte mewte validate-rules /data/rules.new.yaml
```

文件格式的说明位于你的实例的 `/llms.txt`，写法便于直接交给 AI 助手来修改。

## 配置

所有设置都是环境变量。使用 Docker Compose 时，请写入 `compose.yaml` 同目录的 `.env` 文件。完整列表见 [.env.example](../../../.env.example)。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 数据卷中的 SQLite | `sqlite://<path>`、`postgres://...` 或 `mysql://...` |
| `SECRET_KEY` | 使用 SQLite 时自动生成 | 用于加密已保存的令牌。使用 PostgreSQL 或 MySQL 时必填。 |
| `SETUP_TOKEN` | 无 | 设置后，初始化页面会先要求输入该值，才会创建所有者账号。 |
| `TRUST_PROXY` | `false` | 部署在反向代理之后时设为 `true`。 |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub Enterprise Server 请使用 `https://<host>/api/v3`。 |
| `RULES_FILE` | 使用 SQLite 时为数据卷中的 `rules.yaml`，否则无 | 规则文件的路径。设为 `off` 可关闭。 |
| `MEWTE_PORT` | `3000` | Docker Compose 使用的宿主机端口。 |

丢失 `SECRET_KEY` 后，已保存的令牌将无法读取。

### PostgreSQL 或 MySQL

`compose.yaml` 通过 Compose profile 内置了这两种数据库。在 `.env` 中写入：

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

使用 MySQL 时，请改为 `COMPOSE_PROFILES=mysql` 和 `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`。

### 反向代理

请通过 HTTPS 提供服务，保留原始的 `Host` 请求头，并设置 `TRUST_PROXY=true`。

### 更新

```bash
docker compose pull
docker compose up -d
```

## 不使用 Docker

需要 [Bun](https://bun.sh) 1.4 或更高版本。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

Web 界面通过 `/api` 下的 HTTP API 工作。交互式文档位于 `/api/docs`，OpenAPI 文档位于 `/api/openapi.json`。

## 安全

- 密码使用 Argon2id 哈希。GitHub 令牌使用 AES-256-GCM 加密，API 不会返回令牌。
- 登录失败会延迟响应，并按浏览器、地址和账号限制尝试次数。
- 报告漏洞请使用[私密漏洞报告](https://github.com/BlackHole1/Mewte/security/advisories/new)，不要提交公开的 Issue。

## 参与贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

[MIT](../../../LICENSE)
