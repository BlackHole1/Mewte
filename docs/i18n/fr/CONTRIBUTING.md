[English](../../../CONTRIBUTING.md) | [简体中文](../zh-CN/CONTRIBUTING.md) | [繁體中文](../zh-TW/CONTRIBUTING.md) | [日本語](../ja/CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.md) | [Русский](../ru/CONTRIBUTING.md) | **Français** | [Español](../es/CONTRIBUTING.md)

# Contribuer à Mewte

Merci de prendre le temps de nous aider. Les rapports de bugs, les idées, les traductions et le code sont tous les bienvenus. En participant, vous acceptez de respecter le [Code de conduite](CODE_OF_CONDUCT.md).

## Signaler des bugs et proposer des changements

- Commencez par chercher dans les [issues existantes](https://github.com/BlackHole1/Mewte/issues).
- Pour un bug, décrivez ce que vous avez fait, ce que vous attendiez et ce qui s'est produit. Indiquez la version de Mewte, la base de données que vous utilisez et les lignes pertinentes du journal d'exécution. Ne collez jamais un jeton.
- Pour un changement plus important, ouvrez une issue avant d'écrire du code afin que nous puissions nous accorder sur la direction à prendre.
- Signalez les problèmes de sécurité via le [signalement privé de vulnérabilité](https://github.com/BlackHole1/Mewte/security/advisories/new), et non dans une issue publique.

## Environnement de développement

Vous avez besoin de [Bun](https://bun.sh) 1.4 ou d'une version ultérieure. Docker n'est nécessaire que pour les tests PostgreSQL et MySQL.

```bash
git clone https://github.com/BlackHole1/Mewte.git
cd Mewte
bun install
bun run dev
```

`bun run dev` démarre l'API sur <http://localhost:3000> et l'application web sur <http://localhost:5173>. Ouvrez la seconde adresse ; elle relaie `/api` vers la première. Les données sont écrites dans `apps/server/data`, que Git ignore.

### Essayer sans vrai jeton GitHub

Le dépôt contient un petit substitut de l'API GitHub, avec des exemples de notifications :

```bash
bun apps/server/src/testing/demo.ts
```

Dans un autre terminal :

```bash
GITHUB_API_URL=http://localhost:3999 DATA_DIR=./data/demo DATABASE_URL=sqlite://./data/demo/mewte.db bun run dev
```

Associez un compte avec le jeton affiché par la première commande.

## Organisation du projet

| Chemin | Contenu |
| --- | --- |
| `packages/shared` | Schémas zod, types partagés et moteur de règles. Du code pur, sans E/S. |
| `packages/db` | Accès à la base de données avec Kysely pour SQLite, PostgreSQL et MySQL, ainsi que les migrations. |
| `apps/server` | L'API Hono, le client GitHub, le planificateur et l'exécuteur. |
| `apps/web` | L'interface React (Vite, Tailwind CSS, coss ui, react-i18next). |
| `docs/i18n/<locale>` | Traductions de la documentation. |

## Vérifications

Exécutez ces commandes avant d'ouvrir une pull request. La CI exécute les mêmes.

| Commande | Rôle |
| --- | --- |
| `bun run lint` | Analyse le code avec oxlint. |
| `bun run fmt` | Formate le code avec oxfmt. `bun run fmt:check` se contente de vérifier. |
| `bun run typecheck` | Vérifie les types de chaque workspace. |
| `bun run test` | Exécute les tests avec Vitest, en utilisant SQLite. |
| `bun run build` | Compile chaque workspace. |

Pour exécuter également les tests de base de données sur PostgreSQL et MySQL :

```bash
docker compose -f compose.test.yaml up -d
cp .env.test.example .env.test
bun run test:all
```

## Consignes

- **Tests** : les modifications du moteur de règles doivent être accompagnées de tests couvrant le nouveau comportement. Les corrections de bugs devraient s'accompagner d'un test qui échoue sans le correctif.
- **Bases de données** : chaque requête doit fonctionner sur les 3 bases de données. Suivez les conventions de `packages/db` (identifiants sous forme de chaînes générés par l'application, horodatages en millisecondes depuis l'epoch, pas de `RETURNING`), et ajoutez une nouvelle migration au lieu de modifier une migration déjà publiée.
- **API** : définissez la forme des requêtes et des réponses sous forme de schémas zod dans `packages/shared` et enregistrez les routes avec `@hono/zod-openapi` afin que le document OpenAPI reste exact. Les descriptions de l'API sont rédigées en anglais.
- **Textes de l'interface** : aucun texte codé en dur dans les composants. Ajoutez une clé à `apps/web/src/i18n/locales/en.json` ainsi qu'aux 7 autres fichiers de langue. Un test échoue lorsque les fichiers divergent.
- **Composants d'interface** : utilisez les composants coss ui de `apps/web/src/components/ui` et leurs tokens de couleur. Vérifiez à la fois le thème clair et le thème sombre.
- **Commits et pull requests** : rédigez les titres en anglais et à l'impératif (« Add label condition »). Limitez chaque pull request à un seul sujet et expliquez pourquoi le changement est nécessaire.

## Traductions

Les langues de l'interface se trouvent dans `apps/web/src/i18n/locales/<locale>.json`. Pour améliorer une traduction, modifiez le fichier de la langue concernée. Conservez les clés et les `{{placeholders}}` exactement comme dans `en.json`.

Pour ajouter une langue, ajoutez son code à `LOCALES` dans `packages/shared/src/constants.ts`, ajoutez le fichier de langue et le nom de la langue dans `apps/web/src/i18n/index.ts`, puis traduisez les documents dans `docs/i18n/<locale>/` en conservant les mêmes noms de fichiers. Chaque document commence par la barre de langues ; ajoutez la nouvelle langue à cette barre dans chaque document.

Les documents en anglais situés à la racine du dépôt font foi. Lorsque vous en modifiez un, mettez à jour les traductions ou indiquez dans la pull request lesquelles restent à mettre à jour.

## Publier une version

Les versions sont publiées par le workflow **Release**, lancé à la main depuis l'onglet Actions sur la branche `main`. Aucun commit n'est créé pour une version.

1. Laissez **version** vide pour augmenter le dernier tag `vX.Y.Z` selon le **bump** choisi (patch, minor ou major), ou saisissez un `X.Y.Z` exact.
2. Le workflow construit l'image, vérifie qu'elle démarre, puis la pousse vers `ghcr.io/blackhole1/mewte` sous les tags `X.Y.Z`, `X.Y` et `latest`, pour linux/amd64 et linux/arm64.
3. Il pose ensuite le tag `vX.Y.Z` sur le commit et publie une GitHub Release avec des notes générées automatiquement.

Si une exécution échoue après l'envoi de l'image, choisissez **Re-run failed jobs** : le tag et la release ne sont créés que s'ils manquent.
