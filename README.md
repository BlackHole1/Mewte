**English** | [简体中文](docs/i18n/zh-CN/README.md) | [繁體中文](docs/i18n/zh-TW/README.md) | [日本語](docs/i18n/ja/README.md) | [한국어](docs/i18n/ko/README.md) | [Русский](docs/i18n/ru/README.md) | [Français](docs/i18n/fr/README.md) | [Español](docs/i18n/es/README.md)

<p align="center"><img src="apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte keeps your GitHub inbox quiet. It checks the notifications of your GitHub accounts on a schedule, marks the ones that match your rules as done, and keeps a history of everything it cleared.

It is a self-hosted tool for one person: you run it, you sign in to it, and your tokens never leave your server.

## Features

- **Several GitHub accounts**, each with its own polling interval and a "Run now" button.
- **Rules built in the browser**: nested condition groups (all, any, none or not all of the conditions) over repository, owner, reason, type, state, title, labels, author, reviewers, assignees, commenters and bot detection. The editor also spells the whole rule out as one sentence, so nested logic is easy to check.
- **Issues, pull requests and discussions**: rules can read the details of all three, including whether a discussion has been answered.
- **Preview before you trust a rule**: a dry run shows which of your current unread notifications it would clear, without changing anything.
- **History and run logs** with search, filters and a configurable retention period. GitHub cannot restore a notification that was marked as done, so every history entry links to the original thread.
- **Single-user sign-in** with an optional two-factor step (TOTP and recovery codes).
- **SQLite, PostgreSQL or MySQL**. SQLite is the default and needs no setup.
- **8 interface languages**: English, 简体中文, 繁體中文, 日本語, 한국어, Русский, Français, Español. Light and dark themes.
- **OpenAPI description** of the HTTP API, with interactive documentation at `/api/docs`.

## Quick start

You need Docker with the Compose plugin.

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Open <http://localhost:3000>, create the owner account, then:

1. Go to **GitHub accounts** and connect an account with a personal access token ([how to create one](#create-a-github-token)).
2. Go to **Rules**, create a rule and use **Run preview** to check what it would clear.
3. Wait for the next poll, or press **Run now** on the account.

Data is stored in the `mewte-data` Docker volume. Back that volume up: it holds the database and the key that encrypts your tokens.

> If the instance is reachable by other people before you finish the setup page, set `SETUP_TOKEN` first. See [Configuration](#configuration).

## Create a GitHub token

Mewte needs a **classic** personal access token. Fine-grained tokens and GitHub App tokens cannot read notifications, so GitHub rejects them for this purpose.

1. On GitHub, open **Settings**, then **Developer settings**, then **Personal access tokens**, then **Tokens (classic)**. Direct link: <https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. Choose **Generate new token (classic)** and give it a name and an expiration date.
3. Select scopes:

   | Scope | Needed | Why |
   | --- | --- | --- |
   | `notifications` | Always | Read notifications and mark them as done. |
   | `repo` | Only for private repositories | Lets rules read the author, labels, state, reviewers, assignees and comments of issues, pull requests and discussions in private repositories. Without it, those conditions never match for private repositories. |

4. If your organization enforces SAML single sign-on, choose **Configure SSO** next to the token and authorize it for that organization.
5. Copy the token and paste it into Mewte under **GitHub accounts**, then **Connect account**.

Mewte encrypts the token before storing it and never shows it again. When GitHub stops accepting a token (it expired or was revoked), Mewte pauses that account and marks it on the dashboard until you replace the token.

## How rules work

A rule has a name, a priority, an account scope (all accounts or selected ones) and a condition tree. The only action is "mark as done".

- **Order**: for each unread notification, rules are checked from the lowest priority number to the highest. The first rule that matches wins, and the history records it.
- **Groups**: a group says how its conditions combine: all of them match, any of them matches, none of them matches, or not all of them match. A group can contain other groups.
- **Text lists**: repository, owner and people conditions accept several values. `*` is a wildcard, so `acme/*` matches every repository of `acme`. Matching ignores case.
- **Title**: "contains" or a regular expression, optionally case sensitive.
- **Missing data never matches**: some conditions need data that GitHub does not provide for a notification (for example the state of a release, or details of a private repository without the `repo` scope). Such a condition is neither true nor false, and a rule that depends on it does not match, even when negated. Mewte prefers leaving a notification alone over clearing it by mistake.
- **Extra requests only when needed**: details such as labels, reviewers or commenters are fetched only for notifications that a rule cannot decide without them, and are cached for a short time.

Only unread notifications are considered.

## Configuration

All settings are environment variables. With Docker Compose, put them in a `.env` file next to `compose.yaml`; [.env.example](.env.example) documents each one.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (`sqlite:///data/mewte.db` in the image) | `sqlite://<path>`, `postgres://user:password@host:5432/db` or `mysql://user:password@host:3306/db`. |
| `SECRET_KEY` | generated for SQLite | Key that encrypts stored GitHub tokens, at least 32 characters. Required with PostgreSQL or MySQL. With SQLite, Mewte creates `secret.key` in `DATA_DIR` on first start if this is empty. Generate one with `openssl rand -base64 32`. |
| `SETUP_TOKEN` | none | If set, the setup page asks for this value before it creates the owner account. |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy that sets `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`. |
| `COOKIE_SECURE` | `auto` | `auto`, `true` or `false`. `auto` marks the session cookie as Secure when the request arrived over HTTPS. |
| `HOST` | `0.0.0.0` | Address to listen on. |
| `PORT` | `3000` | Port to listen on. |
| `DATA_DIR` | `./data` (`/data` in the image) | Where `secret.key` is kept for SQLite setups. |
| `GITHUB_API_URL` | `https://api.github.com` | REST API root. For GitHub Enterprise Server use `https://<host>/api/v3`. |
| `WEB_DIST` | detected | Directory of the built web app. |

Docker Compose also reads `MEWTE_PORT` (host port, default `3000`) and `MEWTE_VERSION` (image tag, default `latest`).

Changing or losing `SECRET_KEY` makes the stored tokens unreadable. You would have to enter each token again.

### PostgreSQL or MySQL

`compose.yaml` ships both database servers behind Compose profiles. Create a `.env` file next to it:

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<output of: openssl rand -base64 32>
```

For MySQL, use `COMPOSE_PROFILES=mysql` and `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`. Then run `docker compose up -d`.

To use a database server you already run, set only `DATABASE_URL` and `SECRET_KEY`. Mewte creates and upgrades its tables on start.

Running more than one Mewte instance against the same database is supported with PostgreSQL and MySQL: instances coordinate through the database, so an account is never polled by two of them at once. SQLite is meant for a single instance.

### Behind a reverse proxy

Serve Mewte over HTTPS when it is reachable from outside your machine. Keep the original `Host` header (the default in Caddy and Traefik; in nginx add `proxy_set_header Host $host;`) and set `TRUST_PROXY=true` so Mewte reads the client address and scheme from the `X-Forwarded-*` headers. Without it, every visitor appears to come from the proxy's address and shares one sign-in attempt limit.

Mewte refuses write requests whose `Origin` does not match the host it was reached on. If every save fails with a "request refused" message behind a proxy, the proxy is rewriting `Host` without `TRUST_PROXY=true` being set.

### Updating and backups

```bash
docker compose pull
docker compose up -d
```

Database migrations run on start. For SQLite, back up the whole `mewte-data` volume (the database and `secret.key`). For PostgreSQL or MySQL, back up the database and keep `SECRET_KEY` somewhere safe.

## Running without Docker

You need [Bun](https://bun.sh) 1.4 or later.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

The server listens on port 3000 and stores its data in `./data`. Bun loads a `.env` file from the directory you start it in.

To build the Docker image yourself:

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

Everything the web interface does goes through an HTTP API under `/api`. The OpenAPI 3.1 document is served at `/api/openapi.json`, and interactive documentation at `/api/docs`. Requests are authenticated with the session cookie you get by signing in.

## Security notes

- Passwords are hashed with Argon2id. A wrong password, two-factor code or setup token is answered only after 2 to 3 seconds, and the wait grows with repeated failures. Within 15 minutes, failed attempts are limited to 5 per browser on an address, 20 per address and 50 per account; further attempts are refused until the window ends.
- GitHub tokens are encrypted with AES-256-GCM and are never returned by the API.
- Sessions are HttpOnly, SameSite cookies. Changing the password signs out every other session.
- Mewte sends tokens only to the configured GitHub API host.

To report a vulnerability, use [private vulnerability reporting](https://github.com/BlackHole1/Mewte/security/advisories/new) instead of a public issue.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for how we treat each other.
