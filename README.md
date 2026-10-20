# Frontend Complexity Analyzer

CLI locale Node.js/TypeScript d'analyse statique des composants React/TypeScript d'un Design System. Les librairies inspectées restent en lecture seule ; leurs scripts et tests ne sont jamais exécutés.

La CLI produit des métriques brutes et leurs preuves fichier/ligne, réparties en trois profils : complexité intrinsèque, signaux d'accessibilité et risque de maintenance. Elle ne calcule pas de score non calibré, de conformité RGAA ou de charge en jours.

Le dépôt contient aussi un [script autonome de classement](#script-autonome-component-complexitymjs), développé séparément, qui calcule un indice pondéré et propose une estimation de charge à partir d'ancres. Ses conventions et son format de rapport sont distincts de ceux de la CLI.

## Installation et premier essai sous Windows

Node.js 22.12 ou supérieur requis. Dans PowerShell, utiliser `npm.cmd` si `npm.ps1` est bloqué.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
node dist/cli.js analyze --config examples/analyzer.config.json --explain
Start-Process ./reports/demo/index.html
```

Puis sur une librairie réelle, avec une sortie hors des racines inspectées :

```powershell
node dist/cli.js analyze --root "D:\Git\design-system" --output "D:\Rapports\design-system" --format json,md,csv,html --explain
node dist/cli.js analyze --root "D:\Git\design-system" --output "D:\Rapports\button" --component Button --stats
```

Les commandes `analyzer` et `rcca` sont deux noms du même programme, déclarés comme binaires du package. L'appel `node dist/cli.js` fonctionne directement sans installation globale. Après une modification du code TypeScript, relancer `npm.cmd run build` pour actualiser ce programme.

## Commandes disponibles

| Commande                                                        | Usage                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `analyze`                                                       | Analyse multi-racines ou composant isolé, rapports et diagnostics |
| `validate-config --config fichier.json`                         | Validation stricte de la configuration et des chemins             |
| `report rapport.json --output dossier`                          | Régénération Markdown/HTML/CSV sans rescanner les sources         |
| `compare ancien.json nouveau.json`                              | Deltas, ajouts/suppressions, contrôle de compatibilité            |
| `history add rapport.json --output dossier`                     | Archive unique sans remplacement                                  |
| `history list dossier`                                          | Résumé des archives validées                                      |
| `schema config` / `schema report`                               | JSON Schema sur stdout                                            |
| `sonar rapport.json --project-base dossier --output sonar.json` | Export Generic Issues local facultatif                            |

Codes de sortie : **0** succès, **1** rapport partiel à consulter, **2** configuration/entrée invalide ou erreur fatale. `--stdout` réserve stdout au JSON ; résumé, diagnostics et `--stats` vont sur stderr.

### Options de `analyze`

| Option                          | Rôle                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `-c, --config <fichier>`        | Charger une configuration JSON                                                             |
| `-r, --root <dossiers...>`      | Fournir une ou plusieurs racines de librairies                                             |
| `-o, --output <dossier>`        | Choisir la sortie, hors des racines inspectées                                             |
| `-f, --format json,md,csv,html` | Choisir les formats à générer                                                              |
| `--component <identifiant>`     | Limiter l'analyse à un identifiant ou nom de composant non ambigu                          |
| `--explain`                     | Afficher les diagnostics détaillés sur stderr                                              |
| `--stdout`                      | Afficher aussi le rapport JSON sur stdout ; les fichiers restent générés                   |
| `--history <dossier>`           | Archiver également le rapport                                                              |
| `--coverage <fichier>`          | Importer un bundle de couverture existant avec empreintes SHA-256 ; aucun test n'est lancé |
| `--stats`                       | Afficher la durée et la mémoire maximale du processus                                      |

### Exemples des autres commandes

Les entrées `rapport.json`, `ancien.json` et `nouveau.json` ci-dessous sont des rapports au format de la CLI.

```powershell
node dist/cli.js validate-config --config examples/analyzer.config.json
node dist/cli.js report rapport.json --output ./reports
node dist/cli.js compare ancien.json nouveau.json --output ./comparaison.json
node dist/cli.js history add rapport.json --output ./history
node dist/cli.js history list ./history
node dist/cli.js sonar rapport.json --project-base "D:\Git\design-system" --output ./sonar.json
node dist/cli.js schema config
node dist/cli.js schema report
```

`report` régénère par défaut les vues Markdown, HTML et CSV sans rescanner les sources. `compare` refuse les périmètres ou versions d'algorithmes incompatibles. `sonar` écrit un fichier local et ne publie rien sur un serveur.

Pour consulter l'aide et la version :

```powershell
node dist/cli.js --help
node dist/cli.js analyze --help
node dist/cli.js --version
```

Un indicateur animé affiche la phase, le temps écoulé et le temps restant **estimé pour la phase courante** lorsque son volume est connu. En CI ou en redirection, seuls les changements de phase sont journalisés. `--no-progress` désactive cet affichage.

## Qualité et documentation

### Scripts npm

Les scripts se lancent avec `npm.cmd run <nom>` ; `npm.cmd test` est aussi disponible.

| Script          | Rôle et fichiers produits                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `build`         | Compiler le code de production TypeScript dans `dist/`, avec les déclarations de types           |
| `typecheck`     | Vérifier les types du code et des tests sans générer de fichiers                                 |
| `lint`          | Vérifier les règles ESLint dans `src/`, `tests/` et `scripts/`                                   |
| `test`          | Construire le binaire puis exécuter les tests Vitest, dont les tests E2E                         |
| `test:coverage` | Construire et tester avec couverture du code de l'outil ; résultats dans `coverage/`             |
| `docs`          | Générer la documentation API TypeDoc dans `docs/api/`                                            |
| `analyze`       | Lancer `node dist/cli.js analyze` ; nécessite un build à jour                                    |
| `benchmark`     | Mesurer les performances sur un corpus synthétique ; nécessite un build à jour                   |
| `schemas`       | Construire puis générer les schémas JSON de configuration, rapport et couverture dans `schemas/` |
| `format`        | Reformater les fichiers avec Prettier ; modifie les fichiers concernés                           |
| `format:check`  | Vérifier le formatage sans modifier les fichiers                                                 |

Pour transmettre des arguments au raccourci npm `analyze`, ajouter `--` :

```powershell
npm.cmd run build
npm.cmd run analyze -- --config examples/analyzer.config.json --stats
```

### Contrôles de qualité

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run docs
npm.cmd run schemas
npm.cmd run benchmark
```

`test` et `test:coverage` construisent aussi le binaire pour les tests E2E. Les seuils de couverture de l'outil sont strictement supérieurs à 80 % sur lignes, branches, fonctions et instructions. Les tests utilisent des corpus synthétiques dans le répertoire temporaire ; ils ne nécessitent ni React installé dans ces corpus ni accès réseau. Les fixtures temporaires sont conservées pour inspection.

- [Guide utilisateur](docs/user-guide.md) : configuration, interprétation, couverture importée, comparaison, Docker et Jenkins.
- [Architecture implémentée et limites](docs/architecture/implementation.md) : modules et écarts avec la conception.
- [Validation locale](docs/validation.md) : contrôles, couverture des critères et benchmark synthétique.
- [V4 validée](docs/design/specification-v4.md) : arbitrages A01–A09 et traçabilité des cinq sources.
- [ADR-001 accepté](docs/decisions/ADR-001-scoring.md) : trois profils, calibration différée.
- `docs/api/index.html` : API TypeDoc générée par `npm.cmd run docs`.

Les cinq documents de `docs/specifications/` restent inchangés. Le corpus réel et la machine de référence pour contractualiser les performances restent à définir avec les retours des essais terrain. Git/churn, complexité cognitive et scoring calibré sont des extensions différées par la V4.

## Script autonome `component-complexity.mjs`

Ce script a été développé séparément de la CLI. Il s'exécute sans compilation préalable, mais nécessite l'installation du package `typescript`, déclaré dans les dépendances de développement du dépôt. Il n'importe pas le code de la CLI.

Il parcourt les sources `.ts`/`.tsx` selon l'arborescence attendue sous `src/components/`, regroupe les fichiers par composant, puis calcule des métriques de code, API, hooks, attributs ARIA, gestionnaires et dépendances. Il produit un indice pondéré, un rang et un percentile. Ces indicateurs ne constituent pas une mesure de conformité RGAA.

```powershell
node scripts/component-complexity.mjs --src "D:\Git\design-system\src" --out "D:\Rapports\classement\complexity-report.json"
```

Créer le dossier de sortie au préalable et choisir des chemins dédiés hors des sources : ce script ne reprend pas les protections d'écriture de la CLI. Il écrit le JSON demandé, les fichiers `complexity-report.md` et `complexity-report.csv` dans le même dossier et un tableau dans la console.

L'option `--effort` permet d'estimer une charge à partir de durées observées sur des composants servant d'ancres :

```powershell
node scripts/component-complexity.mjs --src "D:\Git\design-system\src" --out "D:\Rapports\classement\complexity-report.json" --effort "button:1,tab:2,comboBox:6"
```

Les noms d'ancres doivent correspondre aux composants détectés. Le modèle interpole linéairement entre les ancres et extrapole hors de leur domaine avec la pente globale. Une interpolation passant par les ancres ne valide pas les estimations des autres composants ; des indices proches associés à des durées différentes peuvent produire une forte sensibilité. Les estimations restent à confronter à des observations indépendantes.

| Option               | Rôle                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--src <dossier>`    | Racine des sources, `./src` par défaut                                                                                                                    |
| `--out <fichier>`    | Destination JSON, `./complexity-report.json` par défaut                                                                                                   |
| `--effort <ancres>`  | Durées en jours, sous forme d'objet JSON inline ou de paires `composant:jours`                                                                            |
| `--overhead <jours>` | Avec `--effort`, ajouter un coût fixe aux composants non ancres ; défaut : 0                                                                              |
| `--lot-rate <taux>`  | Avec `--effort`, appliquer un coût marginal aux composants suivants d'un groupe de même indice pour l'estimation en lot ; taux entre 0 et 1, défaut : 0,5 |

Avec `--effort`, les rapports comprennent aussi des points sur une échelle de Fibonacci, des agrégats par catégorie, le repérage des extrapolations et, lorsque calculable, une validation croisée en retirant successivement une ancre. L'estimation en lot repose sur une hypothèse de mutualisation entre composants de même indice, à valider pour l'activité concernée.

Limites actuelles : le chemin de fichier annoncé dans l'en-tête pour `--effort` n'est pas chargé ; utiliser les formats inline. Le cas d'une seule ancre ou d'un seul indice d'ancrage distinct provoque une erreur, et le percentile n'est pas défini pour un corpus d'un seul composant.

Les rapports de ce script ont leur propre structure : ils ne sont pas acceptés par les commandes `report`, `compare` et `history` de la CLI. La politique de score et les bornes sont définies dans le script ; elles sont indépendantes de la V4 de la CLI.

## Scripts techniques

### `scripts/benchmark.mjs`

Exécuté par `npm.cmd run benchmark`, il crée par défaut 100 composants avec leurs fichiers de tests dans un dossier temporaire. Il lance trois processus CLI distincts et affiche les durées, la mémoire maximale, les volumes analysés et les caractéristiques de la machine. Le corpus et les rapports restent dans le dossier temporaire indiqué. Les tests du corpus ne sont pas exécutés ; les caches disque ne sont pas purgés.

Pour changer la taille du corpus dans PowerShell :

```powershell
npm.cmd run build
$env:FCA_BENCH_COMPONENTS = "500"
npm.cmd run benchmark
Remove-Item Env:FCA_BENCH_COMPONENTS
```

La variable accepte un entier de 1 à 10 000. Ce benchmark synthétique ne remplace pas une validation des performances sur une librairie réelle.

### `scripts/generate-schemas.mjs`

Exécuté après le build par `npm.cmd run schemas`, il dérive les JSON Schema des validateurs Zod exportés par `dist/index.js`, puis les formate avec Prettier. Il actualise :

- `schemas/config.schema.json` : configuration de l'analyse ;
- `schemas/report.schema.json` : rapport canonique de la CLI ;
- `schemas/coverage.schema.json` : bundle de couverture importée.

La commande CLI `schema` affiche un schéma sur stdout ; ce script génère les trois fichiers du dépôt.
