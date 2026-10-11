[English](../../../CONTRIBUTING.md) | [简体中文](../zh-CN/CONTRIBUTING.md) | [繁體中文](../zh-TW/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | [Français](../fr/CONTRIBUTING.md) | **Español**

# Contribuir a Mewte

Gracias por dedicar tu tiempo a ayudar. Los informes de errores, las ideas, las traducciones y el código son bienvenidos. Al participar, aceptas cumplir el [Código de conducta](CODE_OF_CONDUCT.md).

## Informar de errores y proponer cambios

- Busca primero en los [issues existentes](https://github.com/BlackHole1/Mewte/issues).
- Si se trata de un error, describe qué hiciste, qué esperabas y qué ocurrió. Incluye la versión de Mewte, la base de datos que usas y las líneas relevantes del registro de ejecución. Nunca pegues un token.
- Si se trata de un cambio de mayor envergadura, abre un issue antes de escribir código para que podamos acordar la dirección.
- Notifica los problemas de seguridad mediante el [informe privado de vulnerabilidades](https://github.com/BlackHole1/Mewte/security/advisories/new), no en un issue público.

## Entorno de desarrollo

Necesitas [Bun](https://bun.sh) 1.4 o posterior. Docker solo hace falta para las pruebas con PostgreSQL y MySQL.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install
bun run dev
```

`bun run dev` inicia la API en <http://localhost:3000> y la aplicación web en <http://localhost:5173>. Abre la segunda dirección; esta reenvía `/api` a la primera mediante un proxy. Los datos se guardan en `apps/server/data`, que Git ignora.

### Probarlo sin un token real de GitHub

El repositorio incluye un pequeño sustituto de la API de GitHub con notificaciones de ejemplo:

```bash
bun apps/server/src/testing/demo.ts
```

En otra terminal:

```bash
GITHUB_API_URL=http://localhost:3999 DATA_DIR=./data/demo DATABASE_URL=sqlite://./data/demo/mewte.db bun run dev
```

Conecta una cuenta con el token que imprime el primer comando.

## Estructura del proyecto

| Ruta | Contenido |
| --- | --- |
| `packages/shared` | Esquemas de zod, tipos compartidos y el motor de reglas. Código puro, sin E/S. |
| `packages/db` | Acceso a la base de datos con Kysely para SQLite, PostgreSQL y MySQL, además de las migraciones. |
| `apps/server` | La API de Hono, el cliente de GitHub, el planificador y el ejecutor. |
| `apps/web` | La interfaz en React (Vite, Tailwind CSS, coss ui, react-i18next). |
| `docs/i18n/<locale>` | Traducciones de la documentación. |

## Comprobaciones

Ejecútalas antes de abrir un pull request. La CI ejecuta los mismos comandos.

| Comando | Qué hace |
| --- | --- |
| `bun run lint` | Analiza el código con oxlint. |
| `bun run fmt` | Da formato con oxfmt. `bun run fmt:check` solo verifica. |
| `bun run typecheck` | Comprueba los tipos de todos los workspaces. |
| `bun run test` | Ejecuta las pruebas con Vitest, usando SQLite. |
| `bun run build` | Compila todos los workspaces. |

Para ejecutar las pruebas de base de datos también con PostgreSQL y MySQL:

```bash
docker compose -f compose.test.yaml up -d
cp .env.test.example .env.test
bun run test:all
```

## Pautas

- **Pruebas**: los cambios en el motor de reglas necesitan pruebas que cubran el nuevo comportamiento. Las correcciones de errores deben incluir una prueba que falle sin la corrección.
- **Bases de datos**: todas las consultas deben funcionar en las 3 bases de datos. Sigue las convenciones de `packages/db` (identificadores de tipo cadena generados por la aplicación, marcas de tiempo en milisegundos desde la época Unix, sin `RETURNING`) y agrega una migración nueva en lugar de editar una que ya se haya publicado.
- **API**: define la forma de las solicitudes y las respuestas como esquemas de zod en `packages/shared` y registra las rutas con `@hono/zod-openapi` para que el documento OpenAPI se mantenga exacto. Las descripciones de la API se escriben en inglés.
- **Textos de la interfaz**: no escribas textos directamente en los componentes. Agrega una clave a `apps/web/src/i18n/locales/en.json` y a los otros 7 archivos de idioma. Una prueba falla cuando los archivos dejan de estar sincronizados.
- **Componentes de la interfaz**: usa los componentes de coss ui de `apps/web/src/components/ui` y sus tokens de color. Comprueba tanto el tema claro como el oscuro.
- **Commits y pull requests**: escribe los títulos en inglés y en modo imperativo ("Add label condition"). Limita cada pull request a un solo tema y explica por qué es necesario el cambio.

## Traducciones

Los idiomas de la interfaz están en `apps/web/src/i18n/locales/<locale>.json`. Para mejorar una traducción, edita el archivo de ese idioma. Conserva las claves y los `{{placeholders}}` exactamente como en `en.json`.

Para agregar un idioma, agrega su código a `LOCALES` en `packages/shared/src/constants.ts`, agrega el archivo de idioma y el nombre del idioma en `apps/web/src/i18n/index.ts`, y traduce los documentos a `docs/i18n/<locale>/` con los mismos nombres de archivo. Cada documento empieza con la barra de idiomas; agrega el nuevo idioma a esa barra en todos los documentos.

Los documentos en inglés de la raíz del repositorio son la fuente de referencia. Cuando modifiques uno, actualiza las traducciones o indica en el pull request cuáles quedan pendientes de actualizar.

## Publicar una versión

Las versiones se publican con el workflow **Release**, que se ejecuta a mano desde la pestaña Actions sobre la rama `main`. No se crea ningún commit para una versión.

1. Deja **version** vacío para aumentar la última etiqueta `vX.Y.Z` según el **bump** elegido (patch, minor o major), o escribe un `X.Y.Z` exacto.
2. El workflow construye la imagen, comprueba que arranca y la sube a `ghcr.io/blackhole1/mewte` como `X.Y.Z`, `X.Y` y `latest`, para linux/amd64 y linux/arm64.
3. Después etiqueta el commit como `vX.Y.Z` y publica una GitHub Release con notas generadas automáticamente.

Si una ejecución falla después de subir la imagen, elige **Re-run failed jobs**: la etiqueta y la release solo se crean si faltan.
