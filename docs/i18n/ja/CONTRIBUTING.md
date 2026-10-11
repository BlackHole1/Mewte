[English](../../../CONTRIBUTING.md) | [简体中文](../zh-CN/CONTRIBUTING.md) | [繁體中文](../zh-TW/CONTRIBUTING.md) | **日本語** | [한국어](../ko/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md)

# Mewte へのコントリビューション

時間を割いてご協力いただき、ありがとうございます。バグ報告、アイデア、翻訳、コードのいずれも歓迎します。参加にあたっては、[行動規範](CODE_OF_CONDUCT.md)に従うことに同意したものとみなされます。

## バグの報告と変更の提案

- まず[既存の Issue](https://github.com/BlackHole1/Mewte/issues) を検索してください。
- バグの場合は、行った操作、期待した結果、実際に起きたことを記述してください。Mewte のバージョン、使用しているデータベース、実行ログの該当行も含めてください。トークンは絶対に貼り付けないでください。
- 大きな変更の場合は、方向性について合意できるよう、コードを書く前に Issue を作成してください。
- セキュリティ上の問題は、公開の Issue ではなく[プライベート脆弱性レポート](https://github.com/BlackHole1/Mewte/security/advisories/new)で報告してください。

## 開発環境のセットアップ

[Bun](https://bun.sh) 1.4 以降が必要です。Docker が必要になるのは、PostgreSQL と MySQL のテストを実行する場合だけです。

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install
bun run dev
```

`bun run dev` は、API を <http://localhost:3000> で、Web アプリを <http://localhost:5173> で起動します。2つ目のアドレスを開いてください。こちらが `/api` を1つ目のアドレスにプロキシします。データは `apps/server/data` に保存され、このディレクトリは Git で無視されます。

### 実際の GitHub トークンなしで試す

リポジトリには、サンプルの通知を返す、GitHub API の簡易的な代替サーバーが含まれています。

```bash
bun apps/server/src/testing/demo.ts
```

別のターミナルで、次のコマンドを実行します。

```bash
GITHUB_API_URL=http://localhost:3999 DATA_DIR=./data/demo DATABASE_URL=sqlite://./data/demo/mewte.db bun run dev
```

1つ目のコマンドが出力するトークンを使って、アカウントを接続します。

## プロジェクト構成

| パス | 内容 |
| --- | --- |
| `packages/shared` | zod スキーマ、共有の型、ルールエンジン。I/O を伴わない純粋なコードです。 |
| `packages/db` | Kysely による SQLite、PostgreSQL、MySQL 向けのデータベースアクセスと、マイグレーション。 |
| `apps/server` | Hono による API、GitHub クライアント、スケジューラー、ランナー。 |
| `apps/web` | React 製のインターフェース (Vite、Tailwind CSS、coss ui、react-i18next)。 |
| `docs/i18n/<locale>` | ドキュメントの翻訳。 |

## チェック

プルリクエストを作成する前に、以下のコマンドを実行してください。CI でも同じコマンドが実行されます。

| コマンド | 内容 |
| --- | --- |
| `bun run lint` | oxlint でリントを実行します。 |
| `bun run fmt` | oxfmt でフォーマットします。`bun run fmt:check` は検証のみを行います。 |
| `bun run typecheck` | すべてのワークスペースを型チェックします。 |
| `bun run test` | SQLite を使い、Vitest でテストを実行します。 |
| `bun run build` | すべてのワークスペースをビルドします。 |

データベースのテストを PostgreSQL と MySQL に対しても実行するには、次のコマンドを使います。

```bash
docker compose -f compose.test.yaml up -d
cp .env.test.example .env.test
bun run test:all
```

## ガイドライン

- **テスト**: ルールエンジンへの変更には、新しい動作に対するテストが必要です。バグ修正には、その修正がなければ失敗するテストを添えてください。
- **データベース**: すべてのクエリは、3つのデータベースすべてで動作する必要があります。`packages/db` の規約 (ID はアプリが生成する文字列、タイムスタンプはエポックミリ秒、`RETURNING` は使わない) に従い、リリース済みのマイグレーションは編集せずに、新しいマイグレーションを追加してください。
- **API**: リクエストとレスポンスの形式は `packages/shared` に zod スキーマとして定義し、OpenAPI ドキュメントが正確に保たれるよう、ルートは `@hono/zod-openapi` で登録してください。API の説明は英語で記述します。
- **インターフェースの文言**: コンポーネントに文言をハードコードしないでください。キーを `apps/web/src/i18n/locales/en.json` と、他の7つのロケールファイルに追加します。ファイル間にずれが生じると、テストが失敗します。
- **インターフェースコンポーネント**: `apps/web/src/components/ui` にある coss ui のコンポーネントと、そのカラートークンを使ってください。ライトテーマとダークテーマの両方で確認してください。
- **コミットとプルリクエスト**: タイトルは英語の命令形で記述します ("Add label condition")。1つのプルリクエストは1つのトピックに絞り、その変更が必要な理由を説明してください。

## 翻訳

インターフェースの言語ファイルは `apps/web/src/i18n/locales/<locale>.json` にあります。翻訳を改善するには、その言語のファイルを編集してください。キーと `{{placeholders}}` は、`en.json` とまったく同じに保ってください。

言語を追加するには、`packages/shared/src/constants.ts` の `LOCALES` にその言語コードを追加し、`apps/web/src/i18n/index.ts` にロケールファイルと言語名を追加したうえで、ドキュメントを同じファイル名で `docs/i18n/<locale>/` に翻訳します。各ドキュメントは言語バーから始まります。すべてのドキュメントの言語バーに、新しい言語を追加してください。

リポジトリのルートにある英語のドキュメントが正となります。英語のドキュメントを変更した場合は、翻訳も更新するか、更新が必要な翻訳をプルリクエストに明記してください。
