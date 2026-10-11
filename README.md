<div align="center">

**English** | [简体中文](docs/i18n/zh-CN/README.md) | [繁體中文](docs/i18n/zh-TW/README.md) | [日本語](docs/i18n/ja/README.md) | [한국어](docs/i18n/ko/README.md) | [Русский](docs/i18n/ru/README.md) | [Français](docs/i18n/fr/README.md) | [Español](docs/i18n/es/README.md)

<img src="apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

Keep your GitHub inbox quiet: a self-hosted tool that marks notifications as done by your rules.

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/dashboard-dark.png">
  <img src="docs/screenshots/en/dashboard.png" alt="The Mewte dashboard" width="820">
</picture>

</div>

Mewte checks the notifications of your GitHub accounts on a schedule, marks the ones that match your rules as done, and keeps a history. You run it yourself, so your tokens never leave your server.

## Features

- Several GitHub accounts, each with its own polling interval.
- Rules built in the browser, with nested conditions on repository, reason, type, state, title, labels, author and more.
- The rules are also a YAML file, so you or an AI assistant can change them without the browser.
- Issues, pull requests and discussions.
- Preview what a rule would clear before you trust it.
- A history of everything cleared, with a link to each thread.
- Single-user sign-in with optional two-factor authentication.
- SQLite, PostgreSQL or MySQL.
- 8 interface languages, light and dark themes.

## Screenshots

<table>
  <tr>
    <td rowspan="2" width="50%" valign="top">
      <img src="docs/screenshots/en/rule-editor.png" alt="Nested conditions, with a preview of what the rule would clear"><br>
      <sub>Nested conditions, with a preview of what the rule would clear</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/en/rules.png" alt="Rules, checked from top to bottom"><br>
      <sub>Rules, checked from top to bottom</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="docs/screenshots/en/history.png" alt="Everything a rule has cleared"><br>
      <sub>Everything a rule has cleared</sub>
    </td>
  </tr>
</table>

## Quick start

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Open <http://localhost:3000>, create the owner account, connect a GitHub account, then add a rule.

Data is stored in the `mewte-data` volume, including the key that encrypts your tokens. Back it up.

## GitHub token

Mewte needs a **classic** personal access token ([create one](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte)). Fine-grained and GitHub App tokens cannot read notifications.

| Scope | Needed |
| --- | --- |
| `notifications` | Always |
| `repo` | Only for rules that read details of private repositories |

Tokens are stored encrypted and never shown again. With SAML single sign-on, also authorize the token for your organization.

## Rules

- Rules are checked in priority order and the first match wins. Read and unread notifications are treated alike.
- Notifications that were already read when Mewte started watching an account are left alone. To handle them, use "Clear read backlog" in the account's menu.
- A group matches when all, any, none or not all of its conditions match. Groups can be nested.
- `*` is a wildcard: `acme/*` matches every repository of `acme`.
- A condition that needs data GitHub does not provide never matches, so nothing is cleared by mistake.
- GitHub cannot restore a notification that was marked as done. The history keeps a link to each one.

### Rules file

The rules are mirrored in `rules.yaml` in the data directory. Mewte loads the file when it changes and rewrites it when you save a rule in the browser. Edit a copy and check it before you replace the file:

```bash
docker compose exec mewte mewte validate-rules /data/rules.new.yaml
```

The format is described at `/llms.txt` on your instance, written so that an AI assistant can make the edit.

## Configuration

Settings are environment variables. With Docker Compose, put them in a `.env` file next to `compose.yaml`. [.env.example](.env.example) lists all of them.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | SQLite in the data volume | `sqlite://<path>`, `postgres://...` or `mysql://...` |
| `SECRET_KEY` | generated for SQLite | Encrypts stored tokens. Required with PostgreSQL or MySQL. |
| `SETUP_TOKEN` | none | If set, the setup page asks for it before creating the owner account. |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy. |
| `GITHUB_API_URL` | `https://api.github.com` | For GitHub Enterprise Server, use `https://<host>/api/v3`. |
| `RULES_FILE` | `rules.yaml` in the data volume with SQLite, none otherwise | Path of the rules file. `off` disables it. |
| `MEWTE_PORT` | `3000` | Host port used by Docker Compose. |

Losing `SECRET_KEY` makes the stored tokens unreadable.

### PostgreSQL or MySQL

`compose.yaml` ships both behind Compose profiles. In `.env`:

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

For MySQL, use `COMPOSE_PROFILES=mysql` and `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`.

### Reverse proxy

Serve Mewte over HTTPS, keep the original `Host` header and set `TRUST_PROXY=true`.

### Updating

```bash
docker compose pull
docker compose up -d
```

## Without Docker

You need [Bun](https://bun.sh) 1.4 or later.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

The web interface uses an HTTP API under `/api`. Interactive documentation is at `/api/docs`, the OpenAPI document at `/api/openapi.json`.

## Security

- Passwords are hashed with Argon2id. GitHub tokens are encrypted with AES-256-GCM and never returned by the API.
- Failed sign-ins are answered with a delay and limited per browser, address and account.
- Report vulnerabilities through [private vulnerability reporting](https://github.com/BlackHole1/Mewte/security/advisories/new), not a public issue.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
