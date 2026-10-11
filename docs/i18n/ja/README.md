[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | **日本語** | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<p align="center"><img src="../../../apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte は GitHub の受信トレイを静かに保ちます。GitHub アカウントの通知をスケジュールに従って確認し、ルールに一致したものを完了としてマークして、処理したすべての通知の履歴を残します。

1人で使うためのセルフホスト型ツールです。自分で動かし、自分でサインインするので、トークンがサーバーの外に出ることはありません。

## 機能

- **複数の GitHub アカウント**: アカウントごとにポーリング間隔を設定でき、それぞれに「今すぐ実行」ボタンがあります。
- **ブラウザーで組み立てるルール**: リポジトリ、所有者、理由、種類、状態、タイトル、ラベル、作成者、レビュー担当者、担当者、コメント投稿者、ボット判定を対象に、条件グループ (すべてを満たす、いずれかを満たす、いずれも満たさない、すべては満たさない) を入れ子にして組み立てられます。エディターはルール全体を 1 つの文としても表示するため、入れ子のロジックを簡単に確認できます。
- **Issue、プルリクエスト、ディスカッション**: ルールはこの 3 種類すべての詳細を読み取れます。ディスカッションに回答が付いたかどうかも判定できます。
- **ルールを信頼する前にプレビュー**: ドライランで、現在の未読通知のうちどれが処理されるかを確認できます。変更は一切行われません。
- **履歴と実行ログ**: 検索、フィルター、保持期間の設定に対応しています。完了としてマークされた通知を GitHub で復元することはできないため、履歴の各エントリには元のスレッドへのリンクが付いています。
- **シングルユーザーのサインイン**: 任意で2要素認証 (TOTP とリカバリーコード) を追加できます。
- **SQLite、PostgreSQL、MySQL のいずれか**: SQLite が既定で、セットアップは不要です。
- **8つのインターフェース言語**: English, 简体中文, 繁體中文, 日本語, 한국어, Русский, Français, Español。ライトテーマとダークテーマがあります。
- **OpenAPI による HTTP API の記述**: `/api/docs` でインタラクティブなドキュメントを利用できます。

## クイックスタート

Compose プラグイン付きの Docker が必要です。

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

<http://localhost:3000> を開いてオーナーアカウントを作成し、続けて次の手順を行います。

1. **GitHub アカウント** を開き、personal access token でアカウントを接続します ([作成方法](#create-a-github-token))。
2. **ルール** を開いてルールを作成し、**プレビューを実行** でどの通知が処理されるかを確認します。
3. 次回のポーリングを待つか、アカウントの **今すぐ実行** を押します。

データは Docker ボリューム `mewte-data` に保存されます。このボリュームにはデータベースと、トークンを暗号化するキーが入っているので、必ずバックアップしてください。

> セットアップページでの作業を終える前に他の人がインスタンスにアクセスできる場合は、先に `SETUP_TOKEN` を設定してください。詳しくは[設定](#configuration)を参照してください。

<a id="create-a-github-token"></a>

## GitHub トークンを作成する

Mewte には **classic** の personal access token が必要です。fine-grained トークンと GitHub App トークンは通知を読み取れないため、この用途では GitHub に拒否されます。

1. GitHub で **Settings**、**Developer settings**、**Personal access tokens**、**Tokens (classic)** の順に開きます。直接リンク: <https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. **Generate new token (classic)** を選択し、名前と有効期限を設定します。
3. スコープを選択します。

   | スコープ | 必要な場合 | 理由 |
   | --- | --- | --- |
   | `notifications` | 常に必要 | 通知を読み取り、完了としてマークするために使います。 |
   | `repo` | プライベートリポジトリを扱う場合のみ | プライベートリポジトリの Issue、プルリクエスト、ディスカッションについて、作成者、ラベル、状態、レビュー担当者、担当者、コメントをルールが読み取れるようにします。このスコープがないと、プライベートリポジトリではこれらの条件が一致することはありません。 |

4. Organization で SAML シングルサインオンが強制されている場合は、トークンの横にある **Configure SSO** を選択し、その Organization に対してトークンを承認します。
5. トークンをコピーし、Mewte の **GitHub アカウント**、**アカウントを接続** の順に開いて貼り付けます。

Mewte はトークンを暗号化してから保存し、再表示することはありません。GitHub がトークンを受け付けなくなった場合 (有効期限切れ、または取り消し)、Mewte はそのアカウントを一時停止し、トークンを置き換えるまでダッシュボードにその旨を表示します。

## ルールの仕組み

ルールは、名前、優先度、適用先のアカウント (すべてのアカウント、または選択したアカウント)、条件ツリーで構成されます。アクションは「完了としてマーク」のみです。

- **順序**: 未読通知ごとに、優先度の数値が小さいルールから大きいルールへと順に照合されます。最初に一致したルールが適用され、そのルールが履歴に記録されます。
- **グループ**: グループは、含まれる条件の組み合わせ方を決めます。すべてを満たす、いずれかを満たす、いずれも満たさない、すべては満たさない、のいずれかです。グループには別のグループを含めることもできます。
- **テキストリスト**: リポジトリ、所有者、ユーザーに関する条件には複数の値を指定できます。`*` はワイルドカードで、`acme/*` は `acme` のすべてのリポジトリに一致します。大文字と小文字は区別されません。
- **タイトル**: 「含む」または正規表現で指定し、必要に応じて大文字と小文字を区別できます。
- **データがなければ一致しない**: 条件によっては、GitHub が通知に対して提供しないデータが必要になります (リリースの状態や、`repo` スコープがない場合のプライベートリポジトリの詳細など)。このような条件は真でも偽でもなく、それに依存するルールは、否定されていても一致しません。Mewte は、誤って通知を処理するよりも、そのまま残しておくことを優先します。
- **追加のリクエストは必要なときだけ**: ラベル、レビュー担当者、コメント投稿者などの詳細は、それがないとルールが判定できない通知についてのみ取得され、短時間キャッシュされます。

対象となるのは未読通知のみです。

<a id="configuration"></a>

## 設定

設定はすべて環境変数で行います。Docker Compose を使う場合は、`compose.yaml` と同じ場所に置いた `.env` ファイルに記述します。各変数の説明は [.env.example](../../../.env.example) にあります。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (イメージでは `sqlite:///data/mewte.db`) | `sqlite://<path>`、`postgres://user:password@host:5432/db`、`mysql://user:password@host:3306/db` のいずれか。 |
| `SECRET_KEY` | SQLite では自動生成 | 保存される GitHub トークンを暗号化するキーで、32文字以上が必要です。PostgreSQL または MySQL では必須です。SQLite では、この値が空の場合、Mewte が初回起動時に `DATA_DIR` に `secret.key` を作成します。`openssl rand -base64 32` で生成できます。 |
| `SETUP_TOKEN` | なし | 設定すると、セットアップページはオーナーアカウントを作成する前にこの値の入力を求めます。 |
| `TRUST_PROXY` | `false` | `X-Forwarded-For`、`X-Forwarded-Host`、`X-Forwarded-Proto` を設定するリバースプロキシの背後で動かす場合は `true` にします。 |
| `COOKIE_SECURE` | `auto` | `auto`、`true`、`false` のいずれか。`auto` では、リクエストが HTTPS で届いた場合にセッション Cookie を Secure としてマークします。 |
| `HOST` | `0.0.0.0` | 待ち受けるアドレス。 |
| `PORT` | `3000` | 待ち受けるポート。 |
| `DATA_DIR` | `./data` (イメージでは `/data`) | SQLite を使う構成で `secret.key` を保存する場所。 |
| `GITHUB_API_URL` | `https://api.github.com` | REST API のルート。GitHub Enterprise Server では `https://<host>/api/v3` を指定します。 |
| `WEB_DIST` | 自動検出 | ビルド済み Web アプリのディレクトリ。 |

Docker Compose は `MEWTE_PORT` (ホスト側のポート、既定値は `3000`) と `MEWTE_VERSION` (イメージタグ、既定値は `latest`) も読み取ります。

`SECRET_KEY` を変更したり紛失したりすると、保存済みのトークンは読み取れなくなります。その場合は、各トークンを入力し直す必要があります。

### PostgreSQL または MySQL

`compose.yaml` には、両方のデータベースサーバーが Compose のプロファイルとして含まれています。`compose.yaml` と同じ場所に `.env` ファイルを作成します。

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<output of: openssl rand -base64 32>
```

MySQL の場合は、`COMPOSE_PROFILES=mysql` と `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte` を使います。その後、`docker compose up -d` を実行します。

すでに運用しているデータベースサーバーを使う場合は、`DATABASE_URL` と `SECRET_KEY` だけを設定します。Mewte は起動時にテーブルの作成とアップグレードを行います。

PostgreSQL と MySQL では、同じデータベースに対して複数の Mewte インスタンスを動かすことができます。インスタンス同士がデータベースを介して調整するため、1つのアカウントが2つのインスタンスから同時にポーリングされることはありません。SQLite は単一インスタンス向けです。

### リバースプロキシの背後で動かす

自分のマシンの外からアクセスできる場合は、Mewte を HTTPS で提供してください。元の `Host` ヘッダーを維持し (Caddy と Traefik では既定の動作です。nginx では `proxy_set_header Host $host;` を追加します)、`TRUST_PROXY=true` を設定して、Mewte がクライアントのアドレスとスキームを `X-Forwarded-*` ヘッダーから読み取れるようにします。設定しない場合、すべての訪問者がプロキシのアドレスから来たものとして扱われ、サインイン試行の上限を共有することになります。

Mewte は、`Origin` がアクセスに使われたホストと一致しない書き込みリクエストを拒否します。プロキシの背後で、保存のたびに「このリクエストは拒否されました」というメッセージが出て失敗する場合は、`TRUST_PROXY=true` が設定されないまま、プロキシが `Host` を書き換えています。

### アップデートとバックアップ

```bash
docker compose pull
docker compose up -d
```

データベースのマイグレーションは起動時に実行されます。SQLite の場合は、`mewte-data` ボリューム全体 (データベースと `secret.key`) をバックアップしてください。PostgreSQL または MySQL の場合は、データベースをバックアップし、`SECRET_KEY` を安全な場所に保管してください。

## Docker を使わずに実行する

[Bun](https://bun.sh) 1.4 以降が必要です。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

サーバーはポート 3000 で待ち受け、データを `./data` に保存します。Bun は、起動したディレクトリにある `.env` ファイルを読み込みます。

Docker イメージを自分でビルドするには、次のコマンドを実行します。

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

Web インターフェースが行う操作はすべて、`/api` 以下の HTTP API を経由します。OpenAPI 3.1 ドキュメントは `/api/openapi.json` で、インタラクティブなドキュメントは `/api/docs` で提供されます。リクエストは、サインインすると発行されるセッション Cookie で認証されます。

## セキュリティに関する注意事項

- パスワードは Argon2id でハッシュ化されます。パスワード、2要素認証のコード、セットアップトークンが誤っている場合、応答は 2 から 3 秒後に返され、失敗が続くほど待ち時間は長くなります。失敗した試行は 15 分間で、同じアドレスの同じブラウザーにつき 5 回、アドレスにつき 20 回、アカウントにつき 50 回までに制限され、上限に達するとその時間枠が終わるまで拒否されます。
- GitHub トークンは AES-256-GCM で暗号化され、API から返されることはありません。
- セッションには HttpOnly と SameSite を指定した Cookie を使います。パスワードを変更すると、他のすべてのセッションがサインアウトされます。
- Mewte がトークンを送信するのは、設定された GitHub API ホストだけです。

脆弱性を報告する場合は、公開の Issue ではなく[プライベート脆弱性レポート](https://github.com/BlackHole1/Mewte/security/advisories/new)を利用してください。

## コントリビューション

開発環境のセットアップについては [CONTRIBUTING.md](CONTRIBUTING.md) を、お互いへの接し方については [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) を参照してください。
