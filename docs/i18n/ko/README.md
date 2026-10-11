<div align="center">

[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | **한국어** | [Русский](../ru/README.md) | [Français](../fr/README.md) | [Español](../es/README.md)

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

GitHub 받은 편지함을 조용하게: 규칙에 따라 알림을 완료로 표시하는 셀프 호스팅 도구.

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

</div>

Mewte는 GitHub 계정의 알림을 주기적으로 확인하고, 규칙과 일치하는 알림을 완료로 표시하며, 기록을 남깁니다. 직접 실행하므로 토큰은 서버 밖으로 나가지 않습니다.

## 기능

- 여러 GitHub 계정을 지원하며, 계정마다 폴링 간격을 설정할 수 있습니다.
- 브라우저에서 규칙을 만들고, 리포지토리, 이유, 유형, 상태, 제목, 레이블, 작성자 등의 조건을 중첩할 수 있습니다.
- 이슈, 풀 리퀘스트, 토론을 지원합니다.
- 규칙을 믿고 쓰기 전에 어떤 알림이 정리될지 미리 볼 수 있습니다.
- 정리한 모든 알림은 기록에 남고, 원래 스레드로 가는 링크가 붙습니다.
- 단일 사용자 로그인과 선택적 2단계 인증.
- SQLite, PostgreSQL, MySQL 지원.
- 8개 인터페이스 언어, 라이트 및 다크 테마.

## 빠른 시작

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

<http://localhost:3000>을 열어 소유자 계정을 만들고, GitHub 계정을 연결한 다음 규칙을 추가합니다.

데이터는 `mewte-data` 볼륨에 저장되며, 토큰을 암호화하는 키도 여기에 들어 있습니다. 백업해 두세요.

## GitHub 토큰

Mewte에는 **classic** 개인 액세스 토큰이 필요합니다([만들기](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte)). Fine-grained 토큰과 GitHub App 토큰은 알림을 읽을 수 없습니다.

| 범위 | 필요 여부 |
| --- | --- |
| `notifications` | 항상 |
| `repo` | 규칙이 비공개 리포지토리의 세부 정보를 읽을 때만 |

토큰은 암호화되어 저장되며 다시 표시되지 않습니다. SAML 싱글 사인온을 쓰는 조직에서는 해당 조직에 대해 토큰을 승인해야 합니다.

## 규칙

- 규칙은 우선순위 순서로 확인하며, 처음 일치한 규칙이 적용됩니다. 읽지 않은 알림만 대상입니다.
- 그룹은 조건이 모두 일치, 하나라도 일치, 모두 불일치, 또는 전부 일치하지는 않을 때 일치합니다. 그룹은 중첩할 수 있습니다.
- `*`는 와일드카드입니다. `acme/*`는 `acme`의 모든 리포지토리와 일치합니다.
- GitHub가 제공하지 않는 데이터가 필요한 조건은 절대 일치하지 않으므로, 실수로 정리되는 일이 없습니다.
- GitHub는 완료로 표시한 알림을 복원할 수 없습니다. 기록에는 각 알림의 링크가 남습니다.

## 구성

모든 설정은 환경 변수입니다. Docker Compose에서는 `compose.yaml`과 같은 위치의 `.env` 파일에 넣습니다. 전체 목록은 [.env.example](../../../.env.example)에 있습니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 데이터 볼륨의 SQLite | `sqlite://<path>`, `postgres://...` 또는 `mysql://...` |
| `SECRET_KEY` | SQLite에서는 자동 생성 | 저장된 토큰을 암호화합니다. PostgreSQL 또는 MySQL에서는 필수입니다. |
| `SETUP_TOKEN` | 없음 | 설정하면 초기 설정 페이지에서 소유자 계정을 만들기 전에 이 값을 요구합니다. |
| `TRUST_PROXY` | `false` | 리버스 프록시 뒤에서는 `true`로 설정합니다. |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub Enterprise Server에서는 `https://<host>/api/v3`를 사용합니다. |
| `MEWTE_PORT` | `3000` | Docker Compose가 사용하는 호스트 포트. |

`SECRET_KEY`를 잃어버리면 저장된 토큰을 읽을 수 없게 됩니다.

### PostgreSQL 또는 MySQL

`compose.yaml`에는 두 데이터베이스가 Compose 프로필로 들어 있습니다. `.env`에 다음을 넣습니다.

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

MySQL은 `COMPOSE_PROFILES=mysql`과 `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`을 사용합니다.

### 리버스 프록시

Mewte를 HTTPS로 제공하고, 원래의 `Host` 헤더를 유지하며, `TRUST_PROXY=true`를 설정하세요.

### 업데이트

```bash
docker compose pull
docker compose up -d
```

## Docker 없이 실행

[Bun](https://bun.sh) 1.4 이상이 필요합니다.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

웹 인터페이스는 `/api` 아래의 HTTP API를 사용합니다. 대화형 문서는 `/api/docs`에, OpenAPI 문서는 `/api/openapi.json`에 있습니다.

## 보안

- 비밀번호는 Argon2id로 해시합니다. GitHub 토큰은 AES-256-GCM으로 암호화되며 API가 반환하지 않습니다.
- 로그인 실패에는 지연을 두고 응답하며, 브라우저, 주소, 계정별로 시도 횟수를 제한합니다.
- 취약성은 공개 이슈 대신 [비공개 취약성 보고](https://github.com/BlackHole1/Mewte/security/advisories/new)로 알려 주세요.

## 기여하기

[CONTRIBUTING.md](CONTRIBUTING.md)와 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)를 참고하세요.

## 라이선스

[MIT](../../../LICENSE)
