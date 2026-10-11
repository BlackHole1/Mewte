[English](../../../CONTRIBUTING.md) | **简体中文** | [繁體中文](../zh-TW/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md)

# 为 Mewte 做贡献

感谢你抽出时间提供帮助。无论是 Bug 报告、想法、翻译还是代码，我们都欢迎。参与本项目即表示你同意遵守[行为准则](CODE_OF_CONDUCT.md)。

## 报告 Bug 与提议更改

- 请先搜索[已有的 Issue](https://github.com/BlackHole1/Mewte/issues)。
- 报告 Bug 时，请说明你做了什么、预期的结果以及实际发生的情况。请附上 Mewte 版本、所用的数据库以及运行日志中的相关内容。切勿粘贴令牌。
- 如果是较大的改动，请在写代码之前先提交 Issue，以便我们就方向达成一致。
- 安全问题请通过[私密漏洞报告](https://github.com/BlackHole1/Mewte/security/advisories/new)提交，不要发布在公开的 Issue 中。

## 搭建开发环境

需要 [Bun](https://bun.sh) 1.4 或更高版本。只有运行 PostgreSQL 和 MySQL 测试时才需要 Docker。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install
bun run dev
```

`bun run dev` 会在 <http://localhost:3000> 启动 API，在 <http://localhost:5173> 启动 Web 应用。请打开第 2 个地址，它会把 `/api` 代理到第 1 个地址。数据保存在 `apps/server/data` 中，该目录已被 Git 忽略。

### 不使用真实的 GitHub 令牌进行试用

仓库中自带一个小型的 GitHub API 替身，并附带示例通知：

```bash
bun apps/server/src/testing/demo.ts
```

在另一个终端中运行：

```bash
GITHUB_API_URL=http://localhost:3999 DATA_DIR=./data/demo DATABASE_URL=sqlite://./data/demo/mewte.db bun run dev
```

使用第 1 条命令输出的令牌连接一个账号。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `packages/shared` | zod schema、共享类型和规则引擎。纯代码，不含任何 I/O。 |
| `packages/db` | 基于 Kysely 的数据库访问层，支持 SQLite、PostgreSQL 和 MySQL，另含数据库迁移。 |
| `apps/server` | Hono API、GitHub 客户端、调度器和运行器。 |
| `apps/web` | React 界面 (Vite、Tailwind CSS、coss ui、react-i18next)。 |
| `docs/i18n/<locale>` | 文档的翻译。 |

## 检查

提交 Pull request 之前请运行以下命令。CI 运行的也是这些命令。

| 命令 | 作用 |
| --- | --- |
| `bun run lint` | 使用 oxlint 进行代码检查。 |
| `bun run fmt` | 使用 oxfmt 进行格式化。`bun run fmt:check` 只检查，不修改。 |
| `bun run typecheck` | 对所有工作区进行类型检查。 |
| `bun run test` | 使用 Vitest 运行测试，数据库为 SQLite。 |
| `bun run build` | 构建所有工作区。 |

如果还想针对 PostgreSQL 和 MySQL 运行数据库测试：

```bash
docker compose -f compose.test.yaml up -d
cp .env.test.example .env.test
bun run test:all
```

## 开发规范

- **测试**：对规则引擎的改动需要为新行为编写测试。修复 Bug 时应附带一个在未修复时会失败的测试。
- **数据库**：每条查询都必须能在全部 3 种数据库上运行。请遵循 `packages/db` 中的约定 (由应用生成的字符串 id、以 epoch 毫秒表示的时间戳、不使用 `RETURNING`)，并且应新增迁移，而不是修改已发布的迁移。
- **API**：请求和响应的结构应在 `packages/shared` 中定义为 zod schema，并使用 `@hono/zod-openapi` 注册路由，以确保 OpenAPI 文档始终准确。API 描述使用英文撰写。
- **界面文案**：不要在组件中硬编码文案。请在 `apps/web/src/i18n/locales/en.json` 以及其他 7 个语言文件中添加对应的键。这些文件不一致时，会有测试失败。
- **界面组件**：使用 `apps/web/src/components/ui` 中的 coss ui 组件及其颜色 token。浅色和深色主题都要检查。
- **提交与 Pull request**：标题使用英文，并采用祈使语气 (例如“Add label condition”)。每个 Pull request 只处理 1 个主题，并说明为什么需要这项改动。

## 翻译

界面语言文件位于 `apps/web/src/i18n/locales/<locale>.json`。如需改进某种语言的翻译，编辑该语言对应的文件即可。键和 `{{placeholders}}` 必须与 `en.json` 完全一致。

如需新增语言，请把语言代码添加到 `packages/shared/src/constants.ts` 的 `LOCALES` 中，添加对应的语言文件，并在 `apps/web/src/i18n/index.ts` 中添加语言名称，然后将各文档翻译到 `docs/i18n/<locale>/` 下，文件名保持不变。每份文档都以语言栏开头，请在所有文档的语言栏中加入新语言。

仓库根目录下的英文文档是权威版本。修改其中某份文档时，请同步更新各语言的翻译，或在 Pull request 中说明哪些翻译仍待更新。

## 发布

发布由 **Release** 工作流完成，需要在 Actions 页面针对 `main` 分支手动运行。发布不会产生任何提交。

1. **version** 留空时，会按所选的 **bump** (patch、minor 或 major) 在最新的 `vX.Y.Z` 标签基础上递增；也可以直接填写确切的 `X.Y.Z`。首次发布使用根目录 `package.json` 中的版本号。
2. 工作流会构建镜像，确认它可以启动，然后以 `X.Y.Z`、`X.Y` 和 `latest` 推送到 `ghcr.io/blackhole1/mewte`，支持 linux/amd64 和 linux/arm64。
3. 随后为该提交打上 `vX.Y.Z` 标签，并发布带有自动生成说明的 GitHub Release。

如果在镜像推送之后运行失败，请选择 **Re-run failed jobs**：标签和 Release 只会在缺失时创建。
