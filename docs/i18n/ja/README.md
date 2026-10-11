<div align="center">

[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | **日本語** | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

GitHub の受信トレイを静かに保つ: ルールに従って通知を完了としてマークするセルフホスト型ツール。

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../../docs/screenshots/ja/dashboard-dark.png">
  <img src="../../../docs/screenshots/ja/dashboard.png" alt="Mewte のダッシュボード" width="820">
</picture>

</div>

Mewte は GitHub アカウントの通知を定期的に確認し、ルールに一致したものを完了としてマークして、履歴を残します。自分で動かすので、トークンがサーバーの外に出ることはありません。

## 機能

- 複数の GitHub アカウントに対応し、アカウントごとにポーリング間隔を設定できます。
- ルールはブラウザーで作成します。リポジトリ、理由、種類、状態、タイトル、ラベル、作成者などの条件を入れ子にできます。
- ルールは YAML ファイルにもなっているので、ブラウザーを開かずに自分や AI アシスタントが変更できます。
- Issue、プルリクエスト、ディスカッションに対応しています。
- ルールを信頼する前に、どの通知が処理されるかをプレビューできます。
- 処理した通知はすべて履歴に残り、元のスレッドへのリンクが付きます。
- 1人用のサインインで、2要素認証も利用できます。
- SQLite、PostgreSQL、MySQL に対応しています。
- 8つの表示言語と、ライト / ダークテーマ。

## スクリーンショット

<table>
  <tr>
    <td rowspan="2" width="50%" valign="top">
      <img src="../../../docs/screenshots/ja/rule-editor.png" alt="ネストした条件と、ルールが処理する通知のプレビュー"><br>
      <sub>ネストした条件と、ルールが処理する通知のプレビュー</sub>
    </td>
    <td width="50%" valign="top">
      <img src="../../../docs/screenshots/ja/rules.png" alt="ルールは上から順に判定されます"><br>
      <sub>ルールは上から順に判定されます</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="../../../docs/screenshots/ja/history.png" alt="ルールが処理したすべての通知"><br>
      <sub>ルールが処理したすべての通知</sub>
    </td>
  </tr>
</table>

## クイックスタート

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

<http://localhost:3000> を開き、オーナーアカウントを作成して GitHub アカウントを接続し、ルールを追加します。

データは `mewte-data` ボリュームに保存され、トークンを暗号化するキーも含まれます。バックアップを取ってください。

## GitHub トークン

Mewte には **classic** の個人アクセストークンが必要です ([作成する](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte))。Fine-grained トークンと GitHub App トークンは通知を読み取れません。

| スコープ | 必要な場合 |
| --- | --- |
| `notifications` | 常に必要 |
| `repo` | ルールがプライベートリポジトリの詳細を読み取る場合のみ |

トークンは暗号化して保存され、再表示されません。SAML シングルサインオンを使う組織では、その組織に対してトークンを承認してください。

## ルール

- ルールは優先度の順に確認され、最初に一致したものが適用されます。既読と未読の通知は同じように扱われます。
- Mewte がアカウントの監視を始めた時点ですでに既読だった通知は処理されません。処理するには、アカウントのメニューで「既読の通知を整理」を使用します。
- グループは、条件のすべて、いずれか、どれにも一致しない、またはすべてには一致しない場合に一致します。グループは入れ子にできます。
- `*` はワイルドカードです。`acme/*` は `acme` のすべてのリポジトリに一致します。
- GitHub が提供しないデータを必要とする条件は決して一致しないため、誤って処理されることはありません。
- GitHub は完了としてマークした通知を元に戻せません。履歴にはそれぞれのリンクが残ります。

### ルールファイル

ルールはデータディレクトリの `rules.yaml` に同期されます。ファイルが変更されると Mewte が読み込み、ブラウザーでルールを保存するとファイルが書き直されます。コピーを編集し、検証してから元のファイルを置き換えてください。

```bash
docker compose exec mewte mewte validate-rules /data/rules.new.yaml
```

形式の説明はインスタンスの `/llms.txt` にあり、AI アシスタントにそのまま編集を任せられるように書かれています。

## 設定

設定はすべて環境変数です。Docker Compose では、`compose.yaml` と同じ場所の `.env` ファイルに記述します。すべての変数は [.env.example](../../../.env.example) にあります。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | データボリューム内の SQLite | `sqlite://<path>`、`postgres://...`、`mysql://...` のいずれか |
| `SECRET_KEY` | SQLite では自動生成 | 保存されるトークンを暗号化します。PostgreSQL または MySQL では必須です。 |
| `SETUP_TOKEN` | なし | 設定すると、セットアップページはオーナーアカウントを作成する前にこの値の入力を求めます。 |
| `TRUST_PROXY` | `false` | リバースプロキシの背後では `true` にします。 |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub Enterprise Server では `https://<host>/api/v3` を指定します。 |
| `RULES_FILE` | SQLite ではデータボリューム内の `rules.yaml`、それ以外はなし | ルールファイルのパス。`off` で無効にします。 |
| `MEWTE_PORT` | `3000` | Docker Compose が使うホスト側のポート。 |

`SECRET_KEY` を失うと、保存済みのトークンは読み取れなくなります。

### PostgreSQL または MySQL

`compose.yaml` には、Compose プロファイルとして両方が含まれています。`.env` に次のように記述します。

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

MySQL の場合は `COMPOSE_PROFILES=mysql` と `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte` を使います。

### リバースプロキシ

Mewte は HTTPS で公開し、元の `Host` ヘッダーを維持して、`TRUST_PROXY=true` を設定してください。

### アップデート

```bash
docker compose pull
docker compose up -d
```

## Docker を使わない場合

[Bun](https://bun.sh) 1.4 以降が必要です。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

Web インターフェースは `/api` 以下の HTTP API を使います。対話型ドキュメントは `/api/docs`、OpenAPI ドキュメントは `/api/openapi.json` にあります。

## セキュリティ

- パスワードは Argon2id でハッシュ化されます。GitHub トークンは AES-256-GCM で暗号化され、API から返されることはありません。
- サインインの失敗には遅延を挟んで応答し、ブラウザー、アドレス、アカウントごとに試行回数を制限します。
- 脆弱性は、公開の Issue ではなく[プライベート脆弱性レポート](https://github.com/BlackHole1/Mewte/security/advisories/new)で報告してください。

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md) と [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) を参照してください。

## ライセンス

[MIT](../../../LICENSE)
