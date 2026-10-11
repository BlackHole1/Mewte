<div align="center">

[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | **Русский** | [Français](../fr/README.md) | [Español](../es/README.md)

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

Тишина во входящих GitHub: инструмент для самостоятельного размещения, который отмечает уведомления как выполненные по вашим правилам.

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

</div>

Mewte по расписанию проверяет уведомления ваших аккаунтов GitHub, отмечает как выполненные те, что подходят под правила, и ведёт историю. Вы запускаете его сами, поэтому токены не покидают ваш сервер.

## Возможности

- Несколько аккаунтов GitHub, у каждого свой интервал опроса.
- Правила настраиваются в браузере: вложенные условия по репозиторию, причине, типу, состоянию, заголовку, меткам, автору и не только.
- Issues, pull requests и обсуждения.
- Предпросмотр: видно, что правило уберёт, до того как вы ему доверитесь.
- История всего, что было убрано, со ссылкой на каждое обсуждение.
- Вход для одного пользователя с необязательной двухфакторной аутентификацией.
- SQLite, PostgreSQL или MySQL.
- 8 языков интерфейса, светлая и тёмная темы.

## Быстрый старт

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Откройте <http://localhost:3000>, создайте аккаунт владельца, подключите аккаунт GitHub и добавьте правило.

Данные хранятся в томе `mewte-data`, включая ключ, которым шифруются токены. Делайте его резервные копии.

## Токен GitHub

Mewte нужен **classic** personal access token ([создать](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte)). Токены fine-grained и токены GitHub App не могут читать уведомления.

| Область доступа | Когда нужна |
| --- | --- |
| `notifications` | Всегда |
| `repo` | Только для правил, которые читают сведения о приватных репозиториях |

Токены хранятся в зашифрованном виде и больше не показываются. При SAML single sign-on также авторизуйте токен для своей организации.

## Правила

- Правила проверяются по порядку приоритета, срабатывает первое подошедшее. Учитываются только непрочитанные уведомления.
- Группа подходит, когда выполняются все её условия, любое из них, ни одно или не все. Группы можно вкладывать друг в друга.
- `*` означает любые символы: `acme/*` подходит ко всем репозиториям `acme`.
- Условие, которому нужны данные, не предоставленные GitHub, никогда не выполняется, поэтому ничего не убирается по ошибке.
- GitHub не может восстановить уведомление, отмеченное как выполненное. В истории остаётся ссылка на каждое из них.

## Конфигурация

Все настройки задаются переменными окружения. С Docker Compose поместите их в файл `.env` рядом с `compose.yaml`. Полный список приведён в [.env.example](../../../.env.example).

| Переменная | По умолчанию | Описание |
| --- | --- | --- |
| `DATABASE_URL` | SQLite в томе данных | `sqlite://<path>`, `postgres://...` или `mysql://...` |
| `SECRET_KEY` | создаётся автоматически для SQLite | Шифрует сохранённые токены. Обязателен для PostgreSQL и MySQL. |
| `SETUP_TOKEN` | не задан | Если задан, страница настройки запрашивает это значение, прежде чем создать аккаунт владельца. |
| `TRUST_PROXY` | `false` | Установите `true` за обратным прокси. |
| `GITHUB_API_URL` | `https://api.github.com` | Для GitHub Enterprise Server укажите `https://<host>/api/v3`. |
| `MEWTE_PORT` | `3000` | Порт хоста, который использует Docker Compose. |

При утрате `SECRET_KEY` сохранённые токены нельзя будет прочитать.

### PostgreSQL или MySQL

В `compose.yaml` обе СУБД включены как профили Compose. В `.env`:

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

Для MySQL используйте `COMPOSE_PROFILES=mysql` и `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`.

### Обратный прокси

Отдавайте Mewte по HTTPS, сохраняйте исходный заголовок `Host` и установите `TRUST_PROXY=true`.

### Обновление

```bash
docker compose pull
docker compose up -d
```

## Без Docker

Нужен [Bun](https://bun.sh) версии 1.4 или новее.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

Веб-интерфейс работает через HTTP API по адресу `/api`. Интерактивная документация находится по адресу `/api/docs`, документ OpenAPI по адресу `/api/openapi.json`.

## Безопасность

- Пароли хешируются с помощью Argon2id. Токены GitHub шифруются AES-256-GCM, и API никогда их не возвращает.
- На неудачные попытки входа сервер отвечает с задержкой и ограничивает их число для браузера, адреса и аккаунта.
- Об уязвимостях сообщайте через [приватное сообщение об уязвимости](https://github.com/BlackHole1/Mewte/security/advisories/new), а не в публичном issue.

## Участие в разработке

См. [CONTRIBUTING.md](CONTRIBUTING.md) и [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Лицензия

[MIT](../../../LICENSE)
