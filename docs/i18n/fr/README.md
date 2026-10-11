[English](../../../README.md) | [简体中文](../zh-CN/README.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja/README.md) | [한국어](../ko/README.md) | [Русский](../ru/README.md) | **Français** | [Español](../es/README.md)

<p align="center"><img src="../../../apps/web/public/logo.png" alt="" width="96" height="96"></p>

# Mewte

Mewte garde votre boîte de réception GitHub au calme. Il vérifie à intervalles réguliers les notifications de vos comptes GitHub, marque comme terminées celles qui correspondent à vos règles et conserve un historique de tout ce qu'il a traité.

C'est un outil auto-hébergé destiné à une seule personne : vous l'exécutez, vous vous y connectez, et vos jetons ne quittent jamais votre serveur.

## Fonctionnalités

- **Plusieurs comptes GitHub**, chacun avec son propre intervalle d'interrogation et un bouton « Exécuter maintenant ».
- **Des règles créées dans le navigateur** : groupes de conditions imbriqués (toutes, au moins une, aucune ou pas toutes), portant sur le dépôt, le propriétaire, le motif, le type, l'état, le titre, les étiquettes, l'auteur, les réviseurs, les personnes assignées, les commentateurs et la détection des bots. L'éditeur affiche aussi la règle entière sous forme d'une phrase, ce qui rend la logique imbriquée facile à vérifier.
- **Issues, pull requests et discussions** : les règles lisent les détails de ces 3 types, y compris le fait qu'une discussion ait reçu une réponse.
- **Un aperçu avant de faire confiance à une règle** : un essai à blanc montre lesquelles de vos notifications non lues actuelles elle traiterait, sans rien modifier.
- **Historique et journaux d'exécution** avec recherche, filtres et durée de conservation configurable. GitHub ne peut pas restaurer une notification marquée comme terminée : chaque entrée de l'historique renvoie donc vers le fil d'origine.
- **Connexion mono-utilisateur** avec une étape facultative d'authentification à deux facteurs (TOTP et codes de récupération).
- **SQLite, PostgreSQL ou MySQL**. SQLite est le choix par défaut et ne demande aucune configuration.
- **8 langues d'interface** : English, 简体中文, 繁體中文, 日本語, 한국어, Русский, Français, Español. Thèmes clair et sombre.
- **Description OpenAPI** de l'API HTTP, avec une documentation interactive à l'adresse `/api/docs`.

## Démarrage rapide

Vous avez besoin de Docker avec le plugin Compose.

```bash
curl -fsSLO https://raw.githubusercontent.com/BlackHole1/Mewte/main/compose.yaml
docker compose up -d
```

Ouvrez <http://localhost:3000>, créez le compte propriétaire, puis :

1. Allez dans **Comptes GitHub** et associez un compte à l'aide d'un jeton d'accès personnel ([comment en créer un](#create-a-github-token)).
2. Allez dans **Règles**, créez une règle et utilisez **Lancer l'aperçu** pour vérifier ce qu'elle traiterait.
3. Attendez la prochaine interrogation, ou cliquez sur **Exécuter maintenant** pour le compte.

Les données sont stockées dans le volume Docker `mewte-data`. Sauvegardez ce volume : il contient la base de données et la clé qui chiffre vos jetons.

> Si d'autres personnes peuvent accéder à l'instance avant que vous ayez terminé la page de configuration, définissez d'abord `SETUP_TOKEN`. Voir [Configuration](#configuration).

<a id="create-a-github-token"></a>

## Créer un jeton GitHub

Mewte a besoin d'un jeton d'accès personnel **classique**. Les jetons à granularité fine et les jetons de GitHub App ne peuvent pas lire les notifications : GitHub les rejette donc pour cet usage.

1. Sur GitHub, ouvrez **Settings**, puis **Developer settings**, puis **Personal access tokens**, puis **Tokens (classic)**. Lien direct : <https://github.com/settings/tokens/new?scopes=notifications&description=Mewte>
2. Choisissez **Generate new token (classic)**, puis donnez-lui un nom et une date d'expiration.
3. Sélectionnez les étendues :

   | Étendue | Nécessaire | Pourquoi |
   | --- | --- | --- |
   | `notifications` | Toujours | Lire les notifications et les marquer comme terminées. |
   | `repo` | Uniquement pour les dépôts privés | Permet aux règles de lire l'auteur, les étiquettes, l'état, les réviseurs, les personnes assignées et les commentaires des issues, des pull requests et des discussions des dépôts privés. Sans elle, ces conditions ne correspondent jamais pour les dépôts privés. |

4. Si votre organisation impose l'authentification unique SAML, choisissez **Configure SSO** à côté du jeton et autorisez-le pour cette organisation.
5. Copiez le jeton et collez-le dans Mewte sous **Comptes GitHub**, puis **Associer un compte**.

Mewte chiffre le jeton avant de le stocker et ne l'affiche plus jamais. Lorsque GitHub cesse d'accepter un jeton (parce qu'il a expiré ou a été révoqué), Mewte met ce compte en pause et le signale sur le tableau de bord jusqu'à ce que vous remplaciez le jeton.

## Fonctionnement des règles

Une règle comporte un nom, une priorité, les comptes auxquels elle s'applique (tous les comptes ou seulement les comptes sélectionnés) et un arbre de conditions. La seule action possible est « marquer comme terminée ».

- **Ordre** : pour chaque notification non lue, les règles sont vérifiées du plus petit numéro de priorité au plus grand. La première règle qui correspond l'emporte, et l'historique l'enregistre.
- **Groupes** : un groupe indique comment ses conditions se combinent : toutes sont remplies, au moins une est remplie, aucune n'est remplie, ou elles ne sont pas toutes remplies. Un groupe peut contenir d'autres groupes.
- **Listes de texte** : les conditions portant sur le dépôt, le propriétaire et les personnes acceptent plusieurs valeurs. `*` est un caractère générique : `acme/*` correspond donc à tous les dépôts de `acme`. La casse est ignorée.
- **Titre** : « contient » ou une expression régulière, avec prise en compte facultative de la casse.
- **Des données manquantes ne correspondent jamais** : certaines conditions nécessitent des données que GitHub ne fournit pas pour une notification (par exemple l'état d'une release, ou les détails d'un dépôt privé sans l'étendue `repo`). Une telle condition n'est ni vraie ni fausse, et une règle qui en dépend ne correspond pas, même sous une négation. Mewte préfère laisser une notification intacte plutôt que de la traiter par erreur.
- **Des requêtes supplémentaires uniquement si nécessaire** : les détails tels que les étiquettes, les réviseurs ou les commentateurs ne sont récupérés que pour les notifications sur lesquelles une règle ne peut pas se prononcer sans eux, et sont mis en cache pendant une courte durée.

Seules les notifications non lues sont prises en compte.

<a id="configuration"></a>

## Configuration

Tous les paramètres sont des variables d'environnement. Avec Docker Compose, placez-les dans un fichier `.env` à côté de `compose.yaml` ; [.env.example](../../../.env.example) documente chacune d'elles.

| Variable | Valeur par défaut | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://./data/mewte.db` (`sqlite:///data/mewte.db` dans l'image) | `sqlite://<path>`, `postgres://user:password@host:5432/db` ou `mysql://user:password@host:3306/db`. |
| `SECRET_KEY` | générée pour SQLite | Clé qui chiffre les jetons GitHub stockés, d'au moins 32 caractères. Obligatoire avec PostgreSQL ou MySQL. Avec SQLite, si cette variable est vide, Mewte crée `secret.key` dans `DATA_DIR` au premier démarrage. Générez-en une avec `openssl rand -base64 32`. |
| `SETUP_TOKEN` | aucune | Si elle est définie, la page de configuration demande cette valeur avant de créer le compte propriétaire. |
| `TRUST_PROXY` | `false` | Définissez-la sur `true` derrière un reverse proxy qui renseigne `X-Forwarded-For`, `X-Forwarded-Host` et `X-Forwarded-Proto`. |
| `COOKIE_SECURE` | `auto` | `auto`, `true` ou `false`. `auto` marque le cookie de session comme Secure lorsque la requête est arrivée en HTTPS. |
| `HOST` | `0.0.0.0` | Adresse d'écoute. |
| `PORT` | `3000` | Port d'écoute. |
| `DATA_DIR` | `./data` (`/data` dans l'image) | Emplacement de `secret.key` pour les installations SQLite. |
| `GITHUB_API_URL` | `https://api.github.com` | Racine de l'API REST. Pour GitHub Enterprise Server, utilisez `https://<host>/api/v3`. |
| `WEB_DIST` | détectée | Répertoire de l'application web compilée. |

Docker Compose lit également `MEWTE_PORT` (port de l'hôte, `3000` par défaut) et `MEWTE_VERSION` (tag de l'image, `latest` par défaut).

Si vous modifiez ou perdez `SECRET_KEY`, les jetons stockés deviennent illisibles. Vous devrez alors saisir de nouveau chaque jeton.

### PostgreSQL ou MySQL

`compose.yaml` fournit les deux serveurs de base de données derrière des profils Compose. Créez un fichier `.env` à côté de lui :

```bash
COMPOSE_PROFILES=postgres
DB_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_URL=postgres://mewte:${DB_PASSWORD}@postgres:5432/mewte
SECRET_KEY=<output of: openssl rand -base64 32>
```

Pour MySQL, utilisez `COMPOSE_PROFILES=mysql` et `DATABASE_URL=mysql://mewte:${DB_PASSWORD}@mysql:3306/mewte`. Exécutez ensuite `docker compose up -d`.

Pour utiliser un serveur de base de données que vous exploitez déjà, définissez uniquement `DATABASE_URL` et `SECRET_KEY`. Mewte crée et met à niveau ses tables au démarrage.

L'exécution de plusieurs instances de Mewte sur la même base de données est prise en charge avec PostgreSQL et MySQL : les instances se coordonnent par l'intermédiaire de la base de données, de sorte qu'un compte n'est jamais interrogé par deux d'entre elles en même temps. SQLite est prévu pour une seule instance.

### Derrière un reverse proxy

Servez Mewte en HTTPS dès lors qu'il est accessible depuis l'extérieur de votre machine. Conservez l'en-tête `Host` d'origine (c'est le comportement par défaut de Caddy et de Traefik ; dans nginx, ajoutez `proxy_set_header Host $host;`) et définissez `TRUST_PROXY=true` pour que Mewte lise l'adresse du client et le schéma dans les en-têtes `X-Forwarded-*`. Sans cela, tous les visiteurs semblent venir de l'adresse du proxy et partagent la même limite de tentatives de connexion.

Mewte refuse les requêtes d'écriture dont l'en-tête `Origin` ne correspond pas à l'hôte par lequel il a été joint. Si, derrière un proxy, chaque enregistrement échoue avec un message « requête refusée », c'est que le proxy réécrit `Host` sans que `TRUST_PROXY=true` soit défini.

### Mise à jour et sauvegardes

```bash
docker compose pull
docker compose up -d
```

Les migrations de la base de données s'exécutent au démarrage. Pour SQLite, sauvegardez l'intégralité du volume `mewte-data` (la base de données et `secret.key`). Pour PostgreSQL ou MySQL, sauvegardez la base de données et conservez `SECRET_KEY` en lieu sûr.

## Exécution sans Docker

Vous avez besoin de [Bun](https://bun.sh) 1.4 ou d'une version ultérieure.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install --frozen-lockfile
bun run build
bun apps/server/dist/index.mjs
```

Le serveur écoute sur le port 3000 et stocke ses données dans `./data`. Bun charge un fichier `.env` depuis le répertoire dans lequel vous le lancez.

Pour construire vous-même l'image Docker :

```bash
docker build -t ghcr.io/blackhole1/mewte:latest .
```

## API

Tout ce que fait l'interface web passe par une API HTTP sous `/api`. Le document OpenAPI 3.1 est servi à l'adresse `/api/openapi.json`, et la documentation interactive à l'adresse `/api/docs`. Les requêtes sont authentifiées par le cookie de session que vous obtenez en vous connectant.

## Notes de sécurité

- Les mots de passe sont hachés avec Argon2id. Un mot de passe, un code d'authentification à deux facteurs ou un jeton de configuration erroné ne reçoit de réponse qu'après 2 à 3 secondes, et l'attente s'allonge à chaque nouvel échec. Sur 15 minutes, les tentatives échouées sont limitées à 5 par navigateur sur une même adresse, 20 par adresse et 50 par compte ; au-delà, les tentatives sont refusées jusqu'à la fin de cette période.
- Les jetons GitHub sont chiffrés avec AES-256-GCM et ne sont jamais renvoyés par l'API.
- Les sessions reposent sur des cookies HttpOnly et SameSite. Le changement de mot de passe déconnecte toutes les autres sessions.
- Mewte n'envoie les jetons qu'à l'hôte de l'API GitHub configuré.

Pour signaler une vulnérabilité, utilisez le [signalement privé de vulnérabilité](https://github.com/BlackHole1/Mewte/security/advisories/new) plutôt qu'une issue publique.

## Contribuer

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour l'environnement de développement et [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) pour la manière dont nous nous comportons les uns envers les autres.
