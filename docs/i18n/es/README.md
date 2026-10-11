[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | [Français](../fr/README.md) | **Español**

<p align="center"><img src="../../../apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte mantiene en calma tu bandeja de entrada de GitHub. Revisa periódicamente las notificaciones de tus cuentas de GitHub, marca como hechas las que coinciden con tus reglas y conserva un historial de todo lo que ha limpiado.

Es una herramienta autoalojada para una sola persona: tú la ejecutas, tú inicias sesión en ella y tus tokens nunca salen de tu servidor.

## Características

- **Varias cuentas de GitHub**, cada una con su propio intervalo de sondeo y un botón "Ejecutar ahora".
- **Reglas creadas en el navegador**: grupos de condiciones anidados (todas, alguna, ninguna o no todas) sobre repositorio, propietario, motivo, tipo, estado, título, etiquetas, autor, revisores, asignados, comentaristas y detección de bots. El editor también muestra la regla completa como una sola frase, así que la lógica anidada es fácil de comprobar.
- **Issues, pull requests y debates**: las reglas pueden leer los detalles de los 3 tipos, incluido si un debate ya tiene respuesta.
- **Vista previa antes de confiar en una regla**: una ejecución de prueba muestra cuáles de tus notificaciones no leídas actuales limpiaría, sin modificar nada.
- **Historial y registros de ejecución** con búsqueda, filtros y un periodo de retención configurable. GitHub no puede restaurar una notificación marcada como hecha, así que cada entrada del historial enlaza al hilo original.
- **Inicio de sesión de un solo usuario** con un paso opcional de autenticación en dos fases (TOTP y códigos de recuperación).
- **SQLite, PostgreSQL o MySQL**. SQLite es la opción predeterminada y no requiere ninguna preparación.
- **8 idiomas de interfaz**: English, 简体中文, 繁體中文, 日本語, 한국어, Русский, Français, Español. Temas claro y oscuro.
- **Descripción OpenAPI** de la API HTTP, con documentación interactiva en `/api/docs`.

## Inicio rápido

Necesitas Docker con el complemento Compose.

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Abre <http://localhost:3000>, crea la cuenta de propietario y luego:

1. Ve a **Cuentas de GitHub** y conecta una cuenta con un token de acceso personal ([cómo crear uno](#create-a-github-token)).
2. Ve a **Reglas**, crea una regla y usa **Ejecutar vista previa** para comprobar qué limpiaría.
3. Espera al siguiente sondeo o presiona **Ejecutar ahora** en la cuenta.

Los datos se almacenan en el volumen de Docker `mewte-data`. Haz copias de seguridad de ese volumen: contiene la base de datos y la clave que cifra tus tokens.

> Si otras personas pueden acceder a la instancia antes de que completes la página de configuración inicial, define primero `SETUP_TOKEN`. Consulta [Configuración](#configuration).

<a id="create-a-github-token"></a>

## Crear un token de GitHub

Mewte necesita un token de acceso personal **clásico**. Los tokens detallados (fine-grained) y los tokens de GitHub App no pueden leer notificaciones, por lo que GitHub los rechaza para este fin.

1. En GitHub, abre **Settings**, luego **Developer settings**, luego **Personal access tokens** y, por último, **Tokens (classic)**. Enlace directo: <https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. Elige **Generate new token (classic)** y asígnale un nombre y una fecha de expiración.
3. Selecciona los ámbitos:

   | Ámbito | Necesario | Motivo |
   | --- | --- | --- |
   | `notifications` | Siempre | Leer las notificaciones y marcarlas como hechas. |
   | `repo` | Solo para repositorios privados | Permite que las reglas lean el autor, las etiquetas, el estado, los revisores, los asignados y los comentarios de los issues, los pull requests y los debates de repositorios privados. Sin él, esas condiciones nunca coinciden en los repositorios privados. |

4. Si tu organización exige el inicio de sesión único de SAML, elige **Configure SSO** junto al token y autorízalo para esa organización.
5. Copia el token y pégalo en Mewte, en **Cuentas de GitHub** y luego **Conectar cuenta**.

Mewte cifra el token antes de almacenarlo y no vuelve a mostrarlo. Cuando GitHub deja de aceptar un token (porque expiró o fue revocado), Mewte pone en pausa esa cuenta y la señala en el panel hasta que reemplaces el token.

## Cómo funcionan las reglas

Una regla tiene un nombre, una prioridad, un alcance de cuentas (todas las cuentas o solo las seleccionadas) y un árbol de condiciones. La única acción es "Marcar como hecha".

- **Orden**: para cada notificación no leída, las reglas se evalúan desde el número de prioridad más bajo hasta el más alto. Gana la primera regla que coincide, y el historial la registra.
- **Grupos**: un grupo indica cómo se combinan sus condiciones: se cumplen todas, se cumple alguna, no se cumple ninguna o no se cumplen todas. Un grupo puede contener otros grupos.
- **Listas de texto**: las condiciones de repositorio, propietario y personas aceptan varios valores. `*` es un comodín, de modo que `acme/*` coincide con todos los repositorios de `acme`. La coincidencia no distingue entre mayúsculas y minúsculas.
- **Título**: "contiene" o una expresión regular, con la opción de distinguir mayúsculas y minúsculas.
- **Los datos ausentes nunca coinciden**: algunas condiciones necesitan datos que GitHub no proporciona para una notificación (por ejemplo, el estado de una versión o los detalles de un repositorio privado sin el ámbito `repo`). Una condición así no es ni verdadera ni falsa, y una regla que depende de ella no coincide, ni siquiera cuando está negada. Mewte prefiere dejar una notificación intacta antes que limpiarla por error.
- **Solicitudes adicionales solo cuando hacen falta**: los detalles como las etiquetas, los revisores o los comentaristas se obtienen únicamente para las notificaciones que una regla no puede resolver sin ellos, y se guardan en caché durante poco tiempo.

Solo se tienen en cuenta las notificaciones no leídas.

<a id="configuration"></a>

## Configuración

Todos los ajustes son variables de entorno. Con Docker Compose, colócalas en un archivo `.env` junto a `compose.yaml`; [.env.example](../../../.env.example) documenta cada una.

| Variable | Valor predeterminado | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (`sqlite:///data/mewte.db` en la imagen) | `sqlite://<path>`, `postgres://user:password@host:5432/db` o `mysql://user:password@host:3306/db`. |
| `SECRET_KEY` | se genera para SQLite | Clave que cifra los tokens de GitHub almacenados, de al menos 32 caracteres. Obligatoria con PostgreSQL o MySQL. Con SQLite, si está vacía, Mewte crea `secret.key` en `DATA_DIR` en el primer arranque. Genera una con `openssl rand -base64 32`. |
| `SETUP_TOKEN` | ninguno | Si se define, la página de configuración inicial pide este valor antes de crear la cuenta de propietario. |
| `TRUST_PROXY` | `false` | Defínela como `true` detrás de un proxy inverso que establezca `X-Forwarded-For`, `X-Forwarded-Host` y `X-Forwarded-Proto`. |
| `COOKIE_SECURE` | `auto` | `auto`, `true` o `false`. `auto` marca la cookie de sesión como Secure cuando la solicitud llegó por HTTPS. |
| `HOST` | `0.0.0.0` | Dirección en la que escucha el servidor. |
| `PORT` | `3000` | Puerto en el que escucha el servidor. |
| `DATA_DIR` | `./data` (`/data` en la imagen) | Lugar donde se guarda `secret.key` en las instalaciones con SQLite. |
| `GITHUB_API_URL` | `https://api.github.com` | Raíz de la API REST. Para GitHub Enterprise Server, usa `https://<host>/api/v3`. |
| `WEB_DIST` | se detecta automáticamente | Directorio de la aplicación web compilada. |

Docker Compose también lee `MEWTE_PORT` (puerto del host, `3000` de forma predeterminada) y `MEWTE_VERSION` (etiqueta de la imagen, `latest` de forma predeterminada).

Si cambias o pierdes `SECRET_KEY`, los tokens almacenados dejan de poder leerse. Tendrías que volver a introducir cada token.

### PostgreSQL o MySQL

`compose.yaml` incluye ambos servidores de bases de datos detrás de perfiles de Compose. Crea un archivo `.env` junto a él:

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<output of: openssl rand -base64 32>
```

Para MySQL, usa `COMPOSE_PROFILES=mysql` y `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`. Luego ejecuta `docker compose up -d`.

Para usar un servidor de bases de datos que ya tengas en funcionamiento, define solo `DATABASE_URL` y `SECRET_KEY`. Mewte crea y actualiza sus tablas al arrancar.

Con PostgreSQL y MySQL se admite ejecutar más de una instancia de Mewte sobre la misma base de datos: las instancias se coordinan a través de la base de datos, de modo que una cuenta nunca es sondeada por dos de ellas a la vez. SQLite está pensado para una sola instancia.

### Detrás de un proxy inverso

Sirve Mewte por HTTPS cuando sea accesible desde fuera de tu equipo. Conserva el encabezado `Host` original (es el comportamiento predeterminado en Caddy y Traefik; en nginx agrega `proxy_set_header Host $host;`) y define `TRUST_PROXY=true` para que Mewte lea la dirección del cliente y el esquema de los encabezados `X-Forwarded-*`. Sin ello, todos los visitantes parecen llegar desde la dirección del proxy y comparten un mismo límite de intentos de inicio de sesión.

Mewte rechaza las solicitudes de escritura cuyo `Origin` no coincide con el host por el que se accedió a él. Si detrás de un proxy todos los guardados fallan con el mensaje "Se rechazó esta solicitud", el proxy está reescribiendo `Host` sin que se haya definido `TRUST_PROXY=true`.

### Actualización y copias de seguridad

```bash
docker compose pull
docker compose up -d
```

Las migraciones de la base de datos se ejecutan al arrancar. Con SQLite, haz una copia de seguridad de todo el volumen `mewte-data` (la base de datos y `secret.key`). Con PostgreSQL o MySQL, haz una copia de seguridad de la base de datos y guarda `SECRET_KEY` en un lugar seguro.

## Ejecución sin Docker

Necesitas [Bun](https://bun.sh) 1.4 o posterior.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

El servidor escucha en el puerto 3000 y almacena sus datos en `./data`. Bun carga un archivo `.env` del directorio desde el que lo inicias.

Para compilar la imagen de Docker por tu cuenta:

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

Todo lo que hace la interfaz web pasa por una API HTTP bajo `/api`. El documento OpenAPI 3.1 se sirve en `/api/openapi.json`, y la documentación interactiva, en `/api/docs`. Las solicitudes se autentican con la cookie de sesión que obtienes al iniciar sesión.

## Notas de seguridad

- Las contraseñas se almacenan como hash de Argon2id. Una contraseña, un código de autenticación en dos fases o un token de configuración incorrectos solo reciben respuesta tras 2 o 3 segundos, y la espera aumenta con cada fallo. En 15 minutos, los intentos fallidos se limitan a 5 por navegador en una misma dirección, 20 por dirección y 50 por cuenta; a partir de ahí se rechazan hasta que termine ese periodo.
- Los tokens de GitHub se cifran con AES-256-GCM y la API nunca los devuelve.
- Las sesiones son cookies HttpOnly y SameSite. Al cambiar la contraseña se cierran todas las demás sesiones.
- Mewte envía los tokens únicamente al host de la API de GitHub configurado.

Para notificar una vulnerabilidad, usa el [informe privado de vulnerabilidades](https://github.com/BlackHole1/Mewte/security/advisories/new) en lugar de un issue público.

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para preparar el entorno de desarrollo y [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) para saber cómo nos tratamos entre nosotros.
