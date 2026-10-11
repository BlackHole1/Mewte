<div align="center">

[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | **Español**

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

Mantén en calma tu bandeja de entrada de GitHub: una herramienta autoalojada que marca las notificaciones como hechas según tus reglas.

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

</div>

Mewte revisa periódicamente las notificaciones de tus cuentas de GitHub, marca como hechas las que coinciden con tus reglas y conserva un historial. La ejecutas tú, así que tus tokens nunca salen de tu servidor.

## Características

- Varias cuentas de GitHub, cada una con su propio intervalo de consulta.
- Reglas creadas en el navegador, con condiciones anidadas sobre repositorio, motivo, tipo, estado, título, etiquetas, autor y más.
- Issues, pull requests y discussions.
- Vista previa de lo que limpiaría una regla antes de confiar en ella.
- Un historial de todo lo limpiado, con un enlace a cada hilo.
- Inicio de sesión para un solo usuario, con autenticación de dos factores opcional.
- SQLite, PostgreSQL o MySQL.
- 8 idiomas de interfaz, temas claro y oscuro.

## Inicio rápido

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Abre <http://localhost:3000>, crea la cuenta de propietario, conecta una cuenta de GitHub y luego agrega una regla.

Los datos se guardan en el volumen `mewte-data`, incluida la clave que cifra tus tokens. Haz copias de seguridad.

## Token de GitHub

Mewte necesita un token de acceso personal **classic** ([crear uno](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte)). Los tokens fine-grained y los de GitHub App no pueden leer notificaciones.

| Ámbito | Necesario |
| --- | --- |
| `notifications` | Siempre |
| `repo` | Solo para reglas que leen detalles de repositorios privados |

Los tokens se guardan cifrados y no se vuelven a mostrar. Con el inicio de sesión único SAML, autoriza también el token para tu organización.

## Reglas

- Las reglas se comprueban por orden de prioridad y gana la primera que coincide. Solo se tienen en cuenta las notificaciones no leídas.
- Un grupo coincide cuando coinciden todas sus condiciones, alguna, ninguna o no todas. Los grupos se pueden anidar.
- `*` es un comodín: `acme/*` coincide con todos los repositorios de `acme`.
- Una condición que necesita datos que GitHub no proporciona nunca coincide, así que nada se limpia por error.
- GitHub no puede restaurar una notificación marcada como hecha. El historial conserva un enlace a cada una.

## Configuración

Los ajustes son variables de entorno. Con Docker Compose, ponlos en un archivo `.env` junto a `compose.yaml`. [.env.example](../../../.env.example) los enumera todos.

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | SQLite en el volumen de datos | `sqlite://<path>`, `postgres://...` o `mysql://...` |
| `SECRET_KEY` | se genera para SQLite | Cifra los tokens guardados. Obligatoria con PostgreSQL o MySQL. |
| `SETUP_TOKEN` | ninguno | Si se define, la página de configuración inicial pide este valor antes de crear la cuenta de propietario. |
| `TRUST_PROXY` | `false` | Defínela como `true` detrás de un proxy inverso. |
| `GITHUB_API_URL` | `https://api.github.com` | Para GitHub Enterprise Server, usa `https://<host>/api/v3`. |
| `MEWTE_PORT` | `3000` | Puerto del host que usa Docker Compose. |

Si pierdes `SECRET_KEY`, los tokens guardados quedan ilegibles.

### PostgreSQL o MySQL

`compose.yaml` incluye ambos como perfiles de Compose. En `.env`:

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

Para MySQL, usa `COMPOSE_PROFILES=mysql` y `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`.

### Proxy inverso

Sirve Mewte por HTTPS, conserva la cabecera `Host` original y define `TRUST_PROXY=true`.

### Actualización

```bash
docker compose pull
docker compose up -d
```

## Sin Docker

Necesitas [Bun](https://bun.sh) 1.4 o posterior.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

La interfaz web usa una API HTTP bajo `/api`. La documentación interactiva está en `/api/docs` y el documento OpenAPI en `/api/openapi.json`.

## Seguridad

- Las contraseñas se almacenan con hash Argon2id. Los tokens de GitHub se cifran con AES-256-GCM y la API nunca los devuelve.
- Los inicios de sesión fallidos se responden con retraso y se limitan por navegador, dirección y cuenta.
- Notifica las vulnerabilidades mediante el [informe privado de vulnerabilidades](https://github.com/BlackHole1/Mewte/security/advisories/new), no en un issue público.

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) y [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licencia

[MIT](../../../LICENSE)
