[English](../../../README.md) | **简体中文** | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<p align="center"><img src="../../../apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte 让你的 GitHub 收件箱保持清净。它会定时检查各个 GitHub 账号的通知，把符合规则的通知标记为已完成，并为清理过的每条通知保留历史记录。

它是一款供个人使用的自托管工具：由你自己运行、自己登录，令牌始终不会离开你的服务器。

## 功能特性

- **多个 GitHub 账号**：每个账号都有独立的轮询间隔和“立即运行”按钮。
- **在浏览器中构建规则**：可嵌套的条件组 (全部满足、任一满足、均不满足或未全部满足)，可用的条件包括仓库、所有者、原因、类型、状态、标题、标签、作者、审查者、负责人、评论者以及是否为机器人。编辑器还会把整条规则读成一句话，嵌套逻辑一目了然。
- **Issue、Pull request 和 Discussion**：规则可以读取这 3 类通知的详细信息，包括 Discussion 是否已有回答。
- **先预览，再信任规则**：试运行会列出规则将清理当前哪些未读通知，但不会做任何更改。
- **历史记录和运行日志**：支持搜索、筛选和可配置的保留时长。GitHub 无法恢复已标记为完成的通知，因此每条历史记录都附有原始内容的链接。
- **单用户登录**：可选开启双因素认证 (TOTP 和恢复码)。
- **SQLite、PostgreSQL 或 MySQL**：默认使用 SQLite，无需任何配置。
- **8 种界面语言**：English、简体中文、繁體中文、日本語、한국어、Русский、Français、Español。提供浅色和深色主题。
- **OpenAPI 描述**：涵盖整个 HTTP API，交互式文档位于 `/api/docs`。

## 快速开始

需要安装 Docker 及其 Compose 插件。

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

打开 <http://localhost:3000>，创建管理员账号，然后：

1. 前往 **GitHub 账号**，使用个人访问令牌连接一个账号 ([如何创建令牌](#create-a-github-token))。
2. 前往 **规则**，创建一条规则，并通过 **运行预览** 查看它会清理哪些通知。
3. 等待下一次轮询，或在该账号上点击 **立即运行**。

数据存储在名为 `mewte-data` 的 Docker 卷中。请备份该卷：其中保存着数据库和用于加密令牌的密钥。

> 如果在你完成初始化页面之前，其他人就能访问到该实例，请先设置 `SETUP_TOKEN`。详见[配置](#configuration)。

<a id="create-a-github-token"></a>

## 创建 GitHub 令牌

Mewte 需要 **classic** 个人访问令牌。Fine-grained 令牌和 GitHub App 令牌无法读取通知，因此 GitHub 会拒绝将它们用于此用途。

1. 在 GitHub 上依次打开 **Settings**、**Developer settings**、**Personal access tokens**、**Tokens (classic)**。直达链接：<https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. 选择 **Generate new token (classic)**，为令牌填写名称并设置过期日期。
3. 选择作用域：

   | 作用域 | 是否需要 | 用途 |
   | --- | --- | --- |
   | `notifications` | 始终需要 | 读取通知并将其标记为已完成。 |
   | `repo` | 仅私有仓库需要 | 让规则能够读取私有仓库中 Issue、Pull request 和 Discussion 的作者、标签、状态、审查者、负责人和评论。缺少该作用域时，这些条件对私有仓库永远不会匹配。 |

4. 如果你的组织强制启用了 SAML 单点登录，请点击令牌旁的 **Configure SSO**，并为该组织授权此令牌。
5. 复制令牌，然后在 Mewte 中依次进入 **GitHub 账号**、**连接账号**，将令牌粘贴进去。

Mewte 会在加密后存储令牌，之后不会再次显示。当 GitHub 不再接受某个令牌 (已过期或已被撤销) 时，Mewte 会暂停对应的账号，并在仪表盘上标出，直到你更换令牌。

## 规则的工作方式

每条规则包含名称、优先级、适用范围 (所有账号或指定账号) 和一棵条件树。唯一的操作是“标记为已完成”。

- **顺序**：对于每条未读通知，规则按优先级数字从小到大依次检查。以第 1 条匹配的规则为准，历史记录中会记下这条规则。
- **条件组**：条件组决定其中条件的组合方式：全部满足、任一满足、均不满足，或未全部满足。条件组可以包含其他条件组。
- **文本列表**：仓库、所有者和人员类条件可以填写多个值。`*` 是通配符，因此 `acme/*` 会匹配 `acme` 下的所有仓库。匹配时不区分大小写。
- **标题**：可使用“包含”或正则表达式，并可选择区分大小写。
- **缺失的数据永不匹配**：有些条件依赖 GitHub 不会为通知提供的数据 (例如 Release 的状态，或缺少 `repo` 作用域时私有仓库的详细信息)。这样的条件既不为真也不为假，依赖它的规则不会匹配，即使取反也是如此。Mewte 宁可放过一条通知，也不愿误清理。
- **仅在必要时发起额外请求**：标签、审查者、评论者等详细信息，只有在规则缺少它们就无法判定某条通知时才会获取，并会短时间缓存。

只有未读通知才会参与匹配。

<a id="configuration"></a>

## 配置

所有设置均为环境变量。使用 Docker Compose 时，请把它们写入与 `compose.yaml` 同目录的 `.env` 文件；[.env.example](../../../.env.example) 中有每个变量的说明。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (镜像中为 `sqlite:///data/mewte.db`) | `sqlite://<path>`、`postgres://user:password@host:5432/db` 或 `mysql://user:password@host:3306/db`。 |
| `SECRET_KEY` | 使用 SQLite 时自动生成 | 用于加密已存储的 GitHub 令牌的密钥，至少 32 个字符。使用 PostgreSQL 或 MySQL 时必填。使用 SQLite 时，如果此项为空，Mewte 会在首次启动时于 `DATA_DIR` 中创建 `secret.key`。可通过 `openssl rand -base64 32` 生成。 |
| `SETUP_TOKEN` | 无 | 设置后，初始化页面会要求先输入该值，然后才创建管理员账号。 |
| `TRUST_PROXY` | `false` | 如果前面有反向代理，且该代理会设置 `X-Forwarded-For`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`，请设为 `true`。 |
| `COOKIE_SECURE` | `auto` | `auto`、`true` 或 `false`。设为 `auto` 时，如果请求通过 HTTPS 到达，会话 Cookie 会被标记为 Secure。 |
| `HOST` | `0.0.0.0` | 监听地址。 |
| `PORT` | `3000` | 监听端口。 |
| `DATA_DIR` | `./data` (镜像中为 `/data`) | 使用 SQLite 时存放 `secret.key` 的目录。 |
| `GITHUB_API_URL` | `https://api.github.com` | REST API 根地址。GitHub Enterprise Server 请使用 `https://<host>/api/v3`。 |
| `WEB_DIST` | 自动检测 | 已构建的 Web 应用所在的目录。 |

Docker Compose 还会读取 `MEWTE_PORT` (宿主机端口，默认 `3000`) 和 `MEWTE_VERSION` (镜像标签，默认 `latest`)。

更改或丢失 `SECRET_KEY` 会导致已存储的令牌无法读取，届时你需要重新输入每个令牌。

### PostgreSQL 或 MySQL

`compose.yaml` 中已包含这 2 种数据库服务，并通过 Compose profiles 按需启用。在它旁边创建一个 `.env` 文件：

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<openssl rand -hex 24 的输出>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<openssl rand -base64 32 的输出>
```

如果使用 MySQL，请改用 `COMPOSE_PROFILES=mysql` 和 `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`。然后运行 `docker compose up -d`。

如果要使用你已有的数据库服务，只需设置 `DATABASE_URL` 和 `SECRET_KEY`。Mewte 会在启动时创建并升级数据表。

使用 PostgreSQL 或 MySQL 时，支持多个 Mewte 实例连接同一个数据库：各实例通过数据库相互协调，因此同一个账号不会同时被 2 个实例轮询。SQLite 仅适用于单实例。

### 部署在反向代理之后

如果 Mewte 可以从本机以外访问，请通过 HTTPS 提供服务。保留原始的 `Host` 请求头 (Caddy 和 Traefik 默认如此；nginx 需添加 `proxy_set_header Host $host;`)，并设置 `TRUST_PROXY=true`，让 Mewte 从 `X-Forwarded-*` 请求头中读取客户端地址和协议。否则所有访问者看起来都来自代理的地址，并共用同一份登录尝试限额。

如果写请求的 `Origin` 与访问 Mewte 时所用的主机不一致，Mewte 会拒绝该请求。如果在代理之后每次保存都失败并提示“请求被拒绝”，说明代理改写了 `Host`，而你没有设置 `TRUST_PROXY=true`。

### 更新与备份

```bash
docker compose pull
docker compose up -d
```

数据库迁移会在启动时执行。使用 SQLite 时，请备份整个 `mewte-data` 卷 (数据库和 `secret.key`)。使用 PostgreSQL 或 MySQL 时，请备份数据库，并妥善保管 `SECRET_KEY`。

## 不使用 Docker 运行

需要 [Bun](https://bun.sh) 1.4 或更高版本。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

服务器监听 3000 端口，并将数据存储在 `./data` 中。Bun 会从启动时所在的目录加载 `.env` 文件。

如需自行构建 Docker 镜像：

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

Web 界面的所有操作都通过 `/api` 下的 HTTP API 完成。OpenAPI 3.1 文档位于 `/api/openapi.json`，交互式文档位于 `/api/docs`。请求通过登录后获得的会话 Cookie 进行身份验证。

## 安全说明

- 密码使用 Argon2id 进行哈希。密码、双因素认证验证码或初始化令牌错误时，会在 2 到 3 秒后才返回结果，连续失败时等待时间还会变长。15 分钟内，失败次数的上限为同一地址上的同一浏览器 5 次、同一地址 20 次、同一账号 50 次；超出后在窗口结束前会拒绝继续尝试。
- GitHub 令牌使用 AES-256-GCM 加密，API 永远不会返回令牌。
- 会话使用带有 HttpOnly 和 SameSite 属性的 Cookie。修改密码会使其他所有会话退出登录。
- Mewte 只会把令牌发送到所配置的 GitHub API 主机。

如需报告漏洞，请使用[私密漏洞报告](https://github.com/BlackHole1/Mewte/security/advisories/new)，不要提交公开的 Issue。

## 参与贡献

开发环境的搭建方法请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)，社区成员之间的相处准则请参阅 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
