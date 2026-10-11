[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | **한국어** | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<p align="center"><img src="../../../apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte는 GitHub 받은 편지함을 조용하게 유지해 줍니다. 연결한 GitHub 계정의 알림을 일정에 따라 확인하고, 규칙과 일치하는 알림을 완료로 표시하며, 정리한 모든 알림의 기록을 남깁니다.

Mewte는 한 사람을 위한 셀프 호스팅 도구입니다. 직접 실행하고 직접 로그인하며, 토큰은 서버 밖으로 나가지 않습니다.

## 기능

- **여러 GitHub 계정**: 계정마다 폴링 간격을 따로 지정할 수 있고 "지금 실행" 버튼이 있습니다.
- **브라우저에서 만드는 규칙**: 리포지토리, 소유자, 사유, 유형, 상태, 제목, 레이블, 작성자, 검토자, 담당자, 댓글 작성자, 봇 여부를 대상으로 조건 그룹(모두 충족, 하나 이상 충족, 하나도 충족하지 않음, 모두 충족하지는 않음)을 중첩하여 구성합니다. 편집기는 규칙 전체를 한 문장으로도 보여 주므로 중첩된 논리를 쉽게 확인할 수 있습니다.
- **이슈, pull request, 토론**: 규칙은 세 가지 유형 모두의 세부 정보를 읽을 수 있으며, 토론에 답변이 달렸는지도 확인할 수 있습니다.
- **규칙을 믿기 전에 미리 보기**: 시험 실행으로 현재 읽지 않은 알림 중 어떤 알림이 정리될지 보여 주며, 아무것도 변경하지 않습니다.
- **기록과 실행 로그**: 검색과 필터를 지원하며 보존 기간을 설정할 수 있습니다. GitHub에서는 완료로 표시된 알림을 복원할 수 없으므로, 모든 기록 항목에는 원래 스레드로 연결되는 링크가 있습니다.
- **단일 사용자 로그인**: 필요하면 2단계 인증(TOTP 및 복구 코드)을 추가할 수 있습니다.
- **SQLite, PostgreSQL 또는 MySQL**: SQLite가 기본값이며 별도의 설정이 필요 없습니다.
- **8개 인터페이스 언어**: English, 简体中文, 繁體中文, 日本語, 한국어, Русский, Français, Español. 라이트 테마와 다크 테마를 지원합니다.
- **OpenAPI 명세**: HTTP API를 기술하며, `/api/docs`에서 대화형 문서를 제공합니다.

## 빠른 시작

Compose 플러그인이 포함된 Docker가 필요합니다.

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

<http://localhost:3000>을 열고 소유자 계정을 만든 다음, 아래 순서대로 진행합니다.

1. **GitHub 계정**으로 이동하여 개인용 액세스 토큰으로 계정을 연결합니다([토큰 만드는 방법](#create-a-github-token)).
2. **규칙**으로 이동하여 규칙을 만들고 **미리 보기 실행**으로 어떤 알림이 정리될지 확인합니다.
3. 다음 폴링을 기다리거나 해당 계정에서 **지금 실행**을 누릅니다.

데이터는 `mewte-data` Docker 볼륨에 저장됩니다. 이 볼륨에는 데이터베이스와 토큰을 암호화하는 키가 들어 있으므로 반드시 백업하세요.

> 초기 설정 페이지를 마치기 전에 다른 사람이 인스턴스에 접근할 수 있다면 먼저 `SETUP_TOKEN`을 설정하세요. [구성](#configuration)을 참고하세요.

<a id="create-a-github-token"></a>

## GitHub 토큰 만들기

Mewte에는 **클래식** 개인용 액세스 토큰이 필요합니다. 세분화된 토큰과 GitHub App 토큰으로는 알림을 읽을 수 없으므로, GitHub에서 이 용도로는 해당 토큰을 거부합니다.

1. GitHub에서 **Settings**, **Developer settings**, **Personal access tokens**, **Tokens (classic)**을 차례로 엽니다. 바로 가기 링크: <https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. **Generate new token (classic)**을 선택하고 이름과 만료일을 지정합니다.
3. 범위를 선택합니다.

   | 범위 | 필요 여부 | 이유 |
   | --- | --- | --- |
   | `notifications` | 항상 | 알림을 읽고 완료로 표시합니다. |
   | `repo` | 프라이빗 리포지토리를 사용할 때만 | 규칙에서 프라이빗 리포지토리에 있는 이슈, pull request, 토론의 작성자, 레이블, 상태, 검토자, 담당자, 댓글을 읽을 수 있게 합니다. 이 범위가 없으면 프라이빗 리포지토리에서는 해당 조건이 절대 일치하지 않습니다. |

4. 조직에서 SAML SSO(Single Sign-On)를 강제하는 경우, 토큰 옆의 **Configure SSO**를 선택하여 해당 조직에 대해 토큰을 승인합니다.
5. 토큰을 복사한 다음 Mewte에서 **GitHub 계정**, **계정 연결**로 차례로 이동하여 붙여넣습니다.

Mewte는 토큰을 암호화하여 저장하며 다시 표시하지 않습니다. GitHub에서 토큰을 더 이상 허용하지 않으면(만료되었거나 취소된 경우) Mewte는 토큰을 교체할 때까지 해당 계정을 일시 중지하고 대시보드에 표시합니다.

## 규칙의 동작 방식

규칙은 이름, 우선순위, 적용 대상 계정(모든 계정 또는 선택한 계정), 조건 트리로 이루어집니다. 동작은 "완료로 표시" 하나뿐입니다.

- **순서**: 읽지 않은 알림마다 우선순위 숫자가 가장 작은 규칙부터 가장 큰 규칙 순으로 확인합니다. 처음 일치하는 규칙이 적용되며, 기록에 그 규칙이 남습니다.
- **그룹**: 그룹은 포함된 조건을 결합하는 방식을 정합니다. 모두 충족, 하나 이상 충족, 하나도 충족하지 않음, 모두 충족하지는 않음 중 하나입니다. 그룹은 다른 그룹을 포함할 수 있습니다.
- **텍스트 목록**: 리포지토리, 소유자, 사용자 관련 조건에는 값을 여러 개 지정할 수 있습니다. `*`는 와일드카드이므로 `acme/*`는 `acme`의 모든 리포지토리와 일치합니다. 대소문자는 구분하지 않습니다.
- **제목**: "포함" 또는 정규식으로 비교하며, 필요하면 대소문자를 구분할 수 있습니다.
- **데이터가 없으면 일치하지 않음**: 일부 조건에는 GitHub에서 알림에 대해 제공하지 않는 데이터가 필요합니다(예: 릴리스의 상태, `repo` 범위가 없을 때 프라이빗 리포지토리의 세부 정보). 이러한 조건은 참도 거짓도 아니며, 이 조건에 의존하는 규칙은 부정하더라도 일치하지 않습니다. Mewte는 알림을 실수로 정리하기보다 그대로 두는 쪽을 택합니다.
- **필요할 때만 추가 요청**: 레이블, 검토자, 댓글 작성자 같은 세부 정보는 그 정보 없이는 규칙이 판단할 수 없는 알림에 대해서만 가져오며, 짧은 시간 동안 캐시됩니다.

읽지 않은 알림만 대상으로 합니다.

<a id="configuration"></a>

## 구성

모든 설정은 환경 변수로 지정합니다. Docker Compose를 사용한다면 `compose.yaml`과 같은 위치의 `.env` 파일에 넣으세요. 각 변수에 대한 설명은 [.env.example](../../../.env.example)에 있습니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (이미지에서는 `sqlite:///data/mewte.db`) | `sqlite://<path>`, `postgres://user:password@host:5432/db` 또는 `mysql://user:password@host:3306/db` 형식입니다. |
| `SECRET_KEY` | SQLite에서는 자동 생성 | 저장된 GitHub 토큰을 암호화하는 키로, 32자 이상이어야 합니다. PostgreSQL 또는 MySQL에서는 필수입니다. SQLite에서는 이 값이 비어 있으면 Mewte가 처음 시작할 때 `DATA_DIR`에 `secret.key`를 만듭니다. `openssl rand -base64 32`로 생성할 수 있습니다. |
| `SETUP_TOKEN` | 없음 | 설정하면 초기 설정 페이지에서 소유자 계정을 만들기 전에 이 값을 요구합니다. |
| `TRUST_PROXY` | `false` | `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`를 설정하는 리버스 프록시 뒤에서는 `true`로 설정합니다. |
| `COOKIE_SECURE` | `auto` | `auto`, `true` 또는 `false`입니다. `auto`는 요청이 HTTPS로 들어온 경우 세션 쿠키에 Secure 속성을 지정합니다. |
| `HOST` | `0.0.0.0` | 수신 대기할 주소입니다. |
| `PORT` | `3000` | 수신 대기할 포트입니다. |
| `DATA_DIR` | `./data` (이미지에서는 `/data`) | SQLite 구성에서 `secret.key`를 보관하는 위치입니다. |
| `GITHUB_API_URL` | `https://api.github.com` | REST API 루트입니다. GitHub Enterprise Server에서는 `https://<host>/api/v3`을 사용합니다. |
| `WEB_DIST` | 자동 감지 | 빌드된 웹 앱이 있는 디렉터리입니다. |

Docker Compose는 `MEWTE_PORT`(호스트 포트, 기본값 `3000`)와 `MEWTE_VERSION`(이미지 태그, 기본값 `latest`)도 읽습니다.

`SECRET_KEY`를 변경하거나 잃어버리면 저장된 토큰을 읽을 수 없게 됩니다. 이 경우 모든 토큰을 다시 입력해야 합니다.

### PostgreSQL 또는 MySQL

`compose.yaml`에는 두 데이터베이스 서버가 모두 Compose 프로필로 포함되어 있습니다. 같은 위치에 `.env` 파일을 만듭니다.

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<output of: openssl rand -base64 32>
```

MySQL을 사용하려면 `COMPOSE_PROFILES=mysql`과 `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`를 지정합니다. 그런 다음 `docker compose up -d`를 실행합니다.

이미 운영 중인 데이터베이스 서버를 사용하려면 `DATABASE_URL`과 `SECRET_KEY`만 설정하면 됩니다. Mewte는 시작할 때 테이블을 만들고 업그레이드합니다.

PostgreSQL과 MySQL에서는 같은 데이터베이스에 Mewte 인스턴스를 2개 이상 연결하여 실행할 수 있습니다. 인스턴스들이 데이터베이스를 통해 서로 조율하므로 한 계정을 두 인스턴스가 동시에 폴링하는 일은 없습니다. SQLite는 단일 인스턴스용입니다.

### 리버스 프록시 뒤에서 실행하기

Mewte에 내 컴퓨터 밖에서 접근할 수 있다면 HTTPS로 제공하세요. 원래의 `Host` 헤더를 유지하고(Caddy와 Traefik에서는 기본 동작이며, nginx에서는 `proxy_set_header Host $host;`를 추가합니다) `TRUST_PROXY=true`를 설정하여 Mewte가 `X-Forwarded-*` 헤더에서 클라이언트 주소와 스킴을 읽도록 합니다. 설정하지 않으면 모든 방문자가 프록시 주소에서 접속한 것으로 보여 로그인 시도 한도를 함께 쓰게 됩니다.

Mewte는 `Origin`이 접속에 사용된 호스트와 일치하지 않는 쓰기 요청을 거부합니다. 프록시 뒤에서 저장할 때마다 "요청이 거부되었습니다" 메시지와 함께 실패한다면, `TRUST_PROXY=true`가 설정되지 않은 상태에서 프록시가 `Host`를 다시 쓰고 있는 것입니다.

### 업데이트와 백업

```bash
docker compose pull
docker compose up -d
```

데이터베이스 마이그레이션은 시작할 때 실행됩니다. SQLite에서는 `mewte-data` 볼륨 전체(데이터베이스와 `secret.key`)를 백업하세요. PostgreSQL 또는 MySQL에서는 데이터베이스를 백업하고 `SECRET_KEY`를 안전한 곳에 보관하세요.

## Docker 없이 실행하기

[Bun](https://bun.sh) 1.4 이상이 필요합니다.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

서버는 3000번 포트에서 수신 대기하며 데이터를 `./data`에 저장합니다. Bun은 서버를 시작한 디렉터리의 `.env` 파일을 불러옵니다.

Docker 이미지를 직접 빌드하려면 다음 명령을 실행합니다.

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

웹 인터페이스에서 하는 모든 작업은 `/api` 아래의 HTTP API를 거칩니다. OpenAPI 3.1 문서는 `/api/openapi.json`에서, 대화형 문서는 `/api/docs`에서 제공됩니다. 요청은 로그인할 때 받는 세션 쿠키로 인증됩니다.

## 보안 참고 사항

- 비밀번호는 Argon2id로 해시됩니다. 비밀번호, 2단계 인증 코드 또는 설정 토큰이 틀리면 2~3초 뒤에야 응답하며, 실패가 반복될수록 대기 시간이 길어집니다. 15분 동안 실패한 시도는 같은 주소의 같은 브라우저당 5회, 주소당 20회, 계정당 50회로 제한되고, 한도를 넘으면 해당 시간 창이 끝날 때까지 시도가 거부됩니다.
- GitHub 토큰은 AES-256-GCM으로 암호화되며 API에서 절대 반환되지 않습니다.
- 세션은 HttpOnly, SameSite 쿠키입니다. 비밀번호를 변경하면 다른 모든 세션이 로그아웃됩니다.
- Mewte는 구성된 GitHub API 호스트로만 토큰을 전송합니다.

취약성을 보고할 때는 공개 이슈 대신 [비공개 취약성 보고](https://github.com/BlackHole1/Mewte/security/advisories/new)를 이용하세요.

## 기여하기

개발 환경 설정은 [CONTRIBUTING.md](CONTRIBUTING.md)를, 서로를 대하는 방식은 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)를 참고하세요.
