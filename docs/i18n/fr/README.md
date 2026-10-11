<div align="center">

[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | **Français** | [Español](../es/README.md)

<img src="../../../apps/web/public/logo.png" alt="Mewte" width="96" height="96">

# Mewte

Gardez votre boîte de réception GitHub au calme : un outil auto-hébergé qui marque les notifications comme terminées selon vos règles.

[![CI](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackHole1/Mewte/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/BlackHole1/Mewte)](https://github.com/BlackHole1/Mewte/releases/latest)
[![Image](https://img.shields.io/badge/ghcr.io-blackhole1%2Fmewte-2496ED?logo=docker&logoColor=white)](https://github.com/BlackHole1/Mewte/pkgs/container/mewte)
[![License](https://img.shields.io/github/license/BlackHole1/Mewte)](../../../LICENSE)

</div>

Mewte vérifie régulièrement les notifications de vos comptes GitHub, marque comme terminées celles qui correspondent à vos règles et en conserve l'historique. Vous l'exécutez vous-même : vos jetons ne quittent jamais votre serveur.

## Fonctionnalités

- Plusieurs comptes GitHub, chacun avec son propre intervalle d'interrogation.
- Des règles créées dans le navigateur, avec des conditions imbriquées sur le dépôt, le motif, le type, l'état, le titre, les étiquettes, l'auteur et plus encore.
- Les règles sont aussi un fichier YAML : vous ou un assistant IA pouvez les modifier sans le navigateur.
- Issues, pull requests et discussions.
- Un aperçu de ce qu'une règle traiterait avant de lui faire confiance.
- Un historique de tout ce qui a été traité, avec un lien vers chaque fil.
- Une connexion pour un seul utilisateur, avec authentification à deux facteurs en option.
- SQLite, PostgreSQL ou MySQL.
- 8 langues d'interface, thèmes clair et sombre.

## Démarrage rapide

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Ouvrez <http://localhost:3000>, créez le compte propriétaire, connectez un compte GitHub, puis ajoutez une règle.

Les données sont stockées dans le volume `mewte-data`, y compris la clé qui chiffre vos jetons. Sauvegardez-le.

## Jeton GitHub

Mewte a besoin d'un jeton d'accès personnel **classic** ([en créer un](https://github.com/settings/tokens/new?scopes=notifications&description=Mewte)). Les jetons fine-grained et les jetons de GitHub App ne peuvent pas lire les notifications.

| Étendue | Nécessaire |
| --- | --- |
| `notifications` | Toujours |
| `repo` | Uniquement pour les règles qui lisent les détails de dépôts privés |

Les jetons sont stockés chiffrés et ne sont plus jamais affichés. Avec l'authentification unique SAML, autorisez aussi le jeton pour votre organisation.

## Règles

- Les règles sont examinées par ordre de priorité et la première qui correspond l'emporte. Seules les notifications non lues sont prises en compte.
- Un groupe correspond quand toutes ses conditions, l'une d'elles, aucune ou pas toutes correspondent. Les groupes peuvent être imbriqués.
- `*` est un caractère générique : `acme/*` correspond à tous les dépôts de `acme`.
- Une condition qui dépend de données que GitHub ne fournit pas ne correspond jamais : rien n'est traité par erreur.
- GitHub ne peut pas restaurer une notification marquée comme terminée. L'historique conserve un lien vers chacune.

### Fichier de règles

Les règles sont synchronisées avec `rules.yaml` dans le répertoire de données. Mewte charge le fichier quand il change et le réécrit quand vous enregistrez une règle dans le navigateur. Modifiez une copie et vérifiez-la avant de remplacer le fichier :

```bash
docker compose exec mewte mewte validate-rules /data/rules.new.yaml
```

Le format est décrit à l'adresse `/llms.txt` de votre instance, rédigé pour qu'un assistant IA puisse faire la modification.

## Configuration

Les réglages sont des variables d'environnement. Avec Docker Compose, placez-les dans un fichier `.env` à côté de `compose.yaml`. [.env.example](../../../.env.example) les énumère toutes.

| Variable | Valeur par défaut | Description |
| --- | --- | --- |
| `DATABASE_URL` | SQLite dans le volume de données | `sqlite://<path>`, `postgres://...` ou `mysql://...` |
| `SECRET_KEY` | générée pour SQLite | Chiffre les jetons stockés. Obligatoire avec PostgreSQL ou MySQL. |
| `SETUP_TOKEN` | aucune | Si elle est définie, la page de configuration demande cette valeur avant de créer le compte propriétaire. |
| `TRUST_PROXY` | `false` | Définissez-la sur `true` derrière un reverse proxy. |
| `GITHUB_API_URL` | `https://api.github.com` | Pour GitHub Enterprise Server, utilisez `https://<host>/api/v3`. |
| `RULES_FILE` | `rules.yaml` dans le volume de données avec SQLite, aucune sinon | Chemin du fichier de règles. `off` le désactive. |
| `MEWTE_PORT` | `3000` | Port de l'hôte utilisé par Docker Compose. |

Si vous perdez `SECRET_KEY`, les jetons stockés deviennent illisibles.

### PostgreSQL ou MySQL

`compose.yaml` fournit les deux sous forme de profils Compose. Dans `.env` :

```bash
COMPOSE_PROFILES=postgres
# openssl rand -hex 24
DB_PASSWORD=
# openssl rand -base64 32
SECRET_KEY=
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
```

Pour MySQL, utilisez `COMPOSE_PROFILES=mysql` et `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`.

### Reverse proxy

Servez Mewte en HTTPS, conservez l'en-tête `Host` d'origine et définissez `TRUST_PROXY=true`.

### Mise à jour

```bash
docker compose pull
docker compose up -d
```

## Sans Docker

Il vous faut [Bun](https://bun.sh) 1.4 ou une version ultérieure.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

## API

L'interface web utilise une API HTTP sous `/api`. La documentation interactive se trouve à `/api/docs`, le document OpenAPI à `/api/openapi.json`.

## Sécurité

- Les mots de passe sont hachés avec Argon2id. Les jetons GitHub sont chiffrés avec AES-256-GCM et ne sont jamais renvoyés par l'API.
- Les échecs de connexion reçoivent une réponse différée et sont limités par navigateur, par adresse et par compte.
- Signalez les vulnérabilités via le [signalement privé de vulnérabilité](https://github.com/BlackHole1/Mewte/security/advisories/new), pas dans une issue publique.

## Contribuer

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) et [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licence

[MIT](../../../LICENSE)
