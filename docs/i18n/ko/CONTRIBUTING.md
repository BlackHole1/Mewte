[English](../../../CONTRIBUTING.md) | [简体中文](../zh-CN/CONTRIBUTING.md) | [繁體中文](../zh-TW/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | **한국어** | [Русский](../ru/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | [Español](../es/CONTRIBUTING.md)

# Mewte에 기여하기

시간을 내어 도와주셔서 감사합니다. 버그 보고, 아이디어, 번역, 코드 모두 환영합니다. 참여하시면 [행동 강령](CODE_OF_CONDUCT.md)을 따르는 데 동의하는 것으로 봅니다.

## 버그 보고와 변경 제안

- 먼저 [기존 이슈](https://github.com/BlackHole1/Mewte/issues)를 검색해 보세요.
- 버그라면 무엇을 했는지, 무엇을 기대했는지, 실제로 어떤 일이 일어났는지 설명해 주세요. Mewte 버전, 사용 중인 데이터베이스, 실행 로그의 관련 줄도 함께 적어 주세요. 토큰은 절대 붙여넣지 마세요.
- 규모가 큰 변경이라면 코드를 작성하기 전에 이슈를 열어 방향을 먼저 합의해 주세요.
- 보안 문제는 공개 이슈가 아니라 [비공개 취약성 보고](https://github.com/BlackHole1/Mewte/security/advisories/new)를 통해 알려 주세요.

## 개발 환경 설정

[Bun](https://bun.sh) 1.4 이상이 필요합니다. Docker는 PostgreSQL 및 MySQL 테스트에만 필요합니다.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install
bun run dev
```

`bun run dev`는 API를 <http://localhost:3000>에서, 웹 앱을 <http://localhost:5173>에서 시작합니다. 두 번째 주소를 여세요. 이 주소는 `/api`를 첫 번째 주소로 프록시합니다. 데이터는 `apps/server/data`에 저장되며, Git은 이 디렉터리를 무시합니다.

### 실제 GitHub 토큰 없이 사용해 보기

이 리포지토리에는 샘플 알림이 들어 있는, GitHub API를 대신하는 작은 모의 서버가 포함되어 있습니다.

```bash
bun apps/server/src/testing/demo.ts
```

다른 터미널에서 다음 명령을 실행합니다.

```bash
GITHUB_API_URL=http://localhost:3999 DATA_DIR=./data/demo DATABASE_URL=sqlite://./data/demo/mewte.db bun run dev
```

첫 번째 명령이 출력하는 토큰으로 계정을 연결합니다.

## 프로젝트 구조

| 경로 | 내용 |
| --- | --- |
| `packages/shared` | zod 스키마, 공유 타입, 규칙 엔진입니다. I/O가 없는 순수 코드입니다. |
| `packages/db` | Kysely를 사용한 SQLite, PostgreSQL, MySQL 데이터베이스 접근 코드와 마이그레이션입니다. |
| `apps/server` | Hono API, GitHub 클라이언트, 스케줄러, 러너입니다. |
| `apps/web` | React 인터페이스입니다(Vite, Tailwind CSS, coss ui, react-i18next). |
| `docs/i18n/<locale>` | 문서 번역본입니다. |

## 검사

pull request를 열기 전에 아래 명령을 실행하세요. CI에서도 같은 명령을 실행합니다.

| 명령 | 하는 일 |
| --- | --- |
| `bun run lint` | oxlint로 린트를 수행합니다. |
| `bun run fmt` | oxfmt로 포맷합니다. `bun run fmt:check`는 검사만 합니다. |
| `bun run typecheck` | 모든 워크스페이스의 타입을 검사합니다. |
| `bun run test` | SQLite를 사용하여 Vitest로 테스트를 실행합니다. |
| `bun run build` | 모든 워크스페이스를 빌드합니다. |

데이터베이스 테스트를 PostgreSQL과 MySQL에서도 실행하려면 다음과 같이 합니다.

```bash
docker compose -f compose.test.yaml up -d
cp .env.test.example .env.test
bun run test:all
```

## 가이드라인

- **테스트**: 규칙 엔진을 변경할 때는 새로운 동작에 대한 테스트가 필요합니다. 버그 수정에는 수정 없이는 실패하는 테스트를 함께 넣어 주세요.
- **데이터베이스**: 모든 쿼리는 3개 데이터베이스 모두에서 동작해야 합니다. `packages/db`의 관례(앱에서 생성하는 문자열 id, 에포크 밀리초 단위의 타임스탬프, `RETURNING` 사용 금지)를 따르고, 이미 릴리스된 마이그레이션을 수정하는 대신 새 마이그레이션을 추가하세요.
- **API**: 요청과 응답의 형태는 `packages/shared`에 zod 스키마로 정의하고, OpenAPI 문서가 정확하게 유지되도록 `@hono/zod-openapi`로 라우트를 등록하세요. API 설명은 영어로 작성합니다.
- **인터페이스 텍스트**: 컴포넌트에 문구를 하드코딩하지 않습니다. `apps/web/src/i18n/locales/en.json`과 나머지 7개 로캘 파일에 키를 추가하세요. 파일들이 서로 어긋나면 테스트가 실패합니다.
- **인터페이스 컴포넌트**: `apps/web/src/components/ui`의 coss ui 컴포넌트와 해당 색상 토큰을 사용하세요. 라이트 테마와 다크 테마를 모두 확인하세요.
- **커밋과 pull request**: 제목은 영어 명령형으로 작성합니다("Add label condition"). pull request 하나에는 한 가지 주제만 담고, 변경이 왜 필요한지 설명해 주세요.

## 번역

인터페이스 언어는 `apps/web/src/i18n/locales/<locale>.json`에 있습니다. 번역을 개선하려면 해당 언어의 파일을 수정하세요. 키와 `{{placeholders}}`는 `en.json`과 똑같이 유지해야 합니다.

언어를 추가하려면 `packages/shared/src/constants.ts`의 `LOCALES`에 언어 코드를 추가하고, `apps/web/src/i18n/index.ts`에 로캘 파일과 언어 이름을 추가한 다음, 문서를 같은 파일 이름으로 `docs/i18n/<locale>/`에 번역합니다. 각 문서는 언어 표시줄로 시작하므로, 모든 문서의 언어 표시줄에 새 언어를 추가하세요.

리포지토리 루트의 영어 문서가 기준 원본입니다. 영어 문서를 변경할 때는 번역본도 함께 업데이트하거나, 아직 업데이트가 필요한 번역본을 pull request에 적어 주세요.

## 릴리스

릴리스는 **Release** 워크플로로 만듭니다. Actions 탭에서 `main` 브랜치를 대상으로 직접 실행합니다. 릴리스를 위한 커밋은 만들어지지 않습니다.

1. **version**을 비워 두면 선택한 **bump**(patch, minor, major)에 따라 최신 `vX.Y.Z` 태그를 올립니다. 정확한 `X.Y.Z`를 입력할 수도 있습니다.
2. 워크플로는 이미지를 빌드하고 정상적으로 시작되는지 확인한 다음, `X.Y.Z`, `X.Y`, `latest`로 `ghcr.io/blackhole1/mewte`에 푸시합니다. 대상은 linux/amd64와 linux/arm64입니다.
3. 이어서 해당 커밋에 `vX.Y.Z` 태그를 붙이고, 자동 생성된 노트와 함께 GitHub Release를 게시합니다.

이미지를 푸시한 뒤에 실행이 실패하면 **Re-run failed jobs**를 선택하세요. 태그와 릴리스는 없을 때에만 만들어집니다.
