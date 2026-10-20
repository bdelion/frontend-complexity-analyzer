# Frontend Complexity Analyzer

CLI locale Node.js/TypeScript d'analyse statique des composants React/TypeScript d'un Design System. Les librairies inspectées restent en lecture seule ; leurs scripts et tests ne sont jamais exécutés.

La CLI produit des métriques brutes et leurs preuves fichier/ligne, réparties en trois profils : complexité intrinsèque, signaux d'accessibilité et risque de maintenance. Elle ne calcule pas de score non calibré, de conformité RGAA ou de charge en jours.

Le dépôt contient aussi un [script autonome de classement](#script-autonome-component-complexitymjs), développé séparément, qui calcule un indice pondéré et propose une estimation de charge à partir d'ancres. Ses conventions et son format de rapport sont distincts de ceux de la CLI.

| Besoin                                                                                                   | Outil                             |
| -------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Métriques traçables, diagnostics, analyse multi-librairies et comparaison de rapports compatibles        | CLI `analyzer` / `rcca`           |
| Classement pondéré de composants et d'unités partagées, exploration d'une charge calibrée par des ancres | Script `component-complexity.mjs` |

La [revue du dépôt du 20 octobre 2026](docs/reviews/repository-review-2026-10-20.md) décrit les constats vérifiés, le suivi des corrections S01–S09/C01/C02 et les améliorations proposées. Elle ne constitue pas une validation des estimations sur un corpus réel.

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

`test` et `test:coverage` construisent aussi le binaire pour les tests E2E. Les seuils de couverture de la CLI sont strictement supérieurs à 80 % sur lignes, branches, fonctions et instructions. L'instrumentation couvre `src/**/*.ts` ; le script autonome est vérifié par des tests de processus dans `tests/component-complexity.test.ts`, hors de ce pourcentage. Les tests utilisent des corpus synthétiques dans le répertoire temporaire ; ils ne nécessitent ni React installé dans ces corpus ni accès réseau. Les fixtures temporaires sont conservées pour inspection.

- [Guide utilisateur](docs/user-guide.md) : configuration, interprétation, couverture importée, comparaison, Docker et Jenkins.
- [Architecture implémentée et limites](docs/architecture/implementation.md) : modules et écarts avec la conception.
- [Validation locale](docs/validation.md) : contrôles, couverture des critères et benchmark synthétique.
- [V4 validée](docs/design/specification-v4.md) : arbitrages A01–A09 et traçabilité des cinq sources.
- [ADR-001 accepté](docs/decisions/ADR-001-scoring.md) : trois profils, calibration différée.
- `docs/api/index.html` : API TypeDoc générée par `npm.cmd run docs`.

Les cinq documents de `docs/specifications/` restent inchangés. Le corpus réel et la machine de référence pour contractualiser les performances restent à définir avec les retours des essais terrain. Git/churn, complexité cognitive et scoring calibré sont des extensions différées par la V4.

## Script autonome `component-complexity.mjs`

Ce script est indépendant du code de la CLI et s'exécute sans build préalable. Il utilise TypeScript pour l'AST et la résolution des types/imports, Commander pour les arguments et Zod pour leur validation. Installer les dépendances de développement du dépôt pour disposer de TypeScript.

### Version 2 : migration des rapports

Les corrections S01–S09 introduisent le schéma et les algorithmes **2.0.0**. Les résultats ne sont pas directement comparables aux anciens rapports : identités, périmètre de production, props, hooks et graphe ont été corrigés. Recalculer les rapports et réexaminer les ancres avec cette version.

Chaque ligne possède un `id` stable fondé sur le chemin, un nom d'affichage `component` et un `kind` (`component` ou `shared`). Une ancre peut utiliser cet identifiant ou un nom court unique, sans distinction de casse. Un nom ambigu ou inconnu est refusé ; deux noms désignant la même unité sont également refusés.

Le rapport JSON contient `schemaVersion`, `algorithmVersions`, `diagnostics`, `config`, `ranking` et, si demandé, `effort`. Les observations de `details.observations` portent un statut mesuré/estimé/indisponible et des preuves chemin/lignes. `indexStatus` propage les limites des entrées ; une API indisponible donne un indice `null`, sans zéro de substitution.

### Périmètre et regroupement

Les chemins sont relatifs au dossier passé à `--src`.

| Chemin                                  | Identifiant et périmètre                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `components/<catégorie>/<composant>/**` | `components/<catégorie>/<composant>` ; les sous-dossiers restent dans le même composant                                          |
| `components/<catégorie>/fichier.tsx`    | `components/<catégorie>` si la catégorie est plate ; sinon rattachement à un composant homonyme de cette catégorie, ou exclusion |
| `hooks/`, `contexts/`, `internal/`      | Chemin complet du fichier, extension comprise ; une unité `shared` par fichier                                                   |
| Autres dossiers hors `components/`      | Chemin du dossier le plus profond ; une unité `shared` par dossier                                                               |
| Fichier à la racine                     | Chemin du fichier ; une unité `shared`                                                                                           |

Les fichiers `.d.ts`, `*.test.ts(x)`, `*.spec.ts(x)`, `*.e2e.ts(x)` et `*.stories.ts(x)` sont exclus des métriques de production. Les dossiers `assets`, `node_modules`, `dist`, `coverage` et `.git` sont ignorés, ainsi que les liens symboliques. Les barrels purs (imports/réexports sans implémentation) ne créent pas d'unité et ne contribuent pas aux métriques de code ; leurs arêtes sont suivies, y compris dans les cycles. Les implémentations en `export default` sont analysées.

Les composants et l'infrastructure restent classés ensemble, avec des catégories distinctes. Le total de charge comprend donc toutes les unités classées : vérifier que l'activité estimée couvre aussi le code partagé.

### Métriques et indice

- Les LOC comptent les lignes non vides qui ne commencent pas par `//` ; tous les commentaires multilignes ne sont pas exclus.
- La complexité compte une base par fichier de production, puis les conditions, boucles, `case`, `catch`, ternaires, `&&` et `||`. Cette convention diffère de celle de la CLI, définie par fonction.
- Les hooks sont reconnus à partir des imports React, avec alias et namespaces, sans compter les homonymes locaux. Les gestionnaires « clavier » comprennent aussi `onFocus` et `onBlur`.
- Les props sont celles des fonctions de rendu exportées, identifiées par un nom commençant par une majuscule ou par un export par défaut. Les types importés, hérités, unions et intersections sont résolus par TypeScript ; les props DOM/React héritées sont séparées du comptage propre en les excluant. Les types auxiliaires inutilisés et les fonctions privées ne gonflent plus la surface d'API. Pour un type `any`/`unknown`, une destructuration fournit une estimation hors rest ; sans destructuration, la mesure est indisponible.
- Les spreads JSX rendent les comptages visibles d'attributs et de gestionnaires estimés ; ils génèrent un diagnostic. Aucun signal ARIA ne prouve une conformité RGAA.
- Le graphe résout les fichiers, dossiers, alias et réexports via TypeScript. Les imports explicitement de types restent dans `details.typeDependencies`, hors fan-in/fan-out d'exécution. Les arêtes sont uniques et les unités partagées disposent aussi d'un fan-in. Les imports internes irrésolus produisent un diagnostic et dégradent le statut du graphe.

Le tsconfig est recherché à partir de la racine source et de ses parents. `--tsconfig` permet d'en imposer un. Aucun module ni script de la bibliothèque n'est exécuté et aucun fichier source n'est sauvegardé.

Chaque métrique utilisée dans l'indice est bornée et normalisée sur 1–5, puis combinée :

| Axe                     | Poids | Composition                                   |
| ----------------------- | ----- | --------------------------------------------- |
| Code                    | 35 %  | 60 % complexité + 40 % LOC                    |
| Interactions            | 25 %  | 60 % gestionnaires clavier/focus + 40 % hooks |
| Signaux d'accessibilité | 30 %  | Comptage ARIA, rôles et signaux apparentés    |
| Structure               | 10 %  | 50 % fan-out + 50 % props                     |

Les bornes sont définies dans `BOUNDS` : complexité 5–100, LOC 50–1 200, gestionnaires 0–4, ARIA 0–17, hooks 0–18, fan-out 0–9, props 0–40. Les poids de `WEIGHTS` totalisent 1, sans renormalisation automatique. Les indices sont arrondis au centième avant classement et calibration. Le rang est départagé par identifiant en cas d'égalité ; les ex æquo partagent le même percentile. Un singleton a un percentile de 0 ; un indice indisponible donne un percentile `null`.

### Exécution, arguments et sorties

```powershell
node scripts/component-complexity.mjs --help
node scripts/component-complexity.mjs --src "D:\Git\design-system\src" --out "D:\Rapports\classement\resultat.json"
node scripts/component-complexity.mjs --src "D:\Git\design-system\src" --out "D:\Rapports\classement\effort.json" --effort "button:1,tab:2,comboBox:6" --overhead 0.5 --lot-rate 0.5
```

| Option                 | Rôle                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| `--src <dossier>`      | Racine source, défaut `./src`                                                  |
| `--out <fichier>`      | Rapport JSON, défaut `./complexity-report.json`                                |
| `--tsconfig <fichier>` | Configuration TypeScript explicite                                             |
| `--effort <ancres>`    | Objet JSON inline, paires `identifiant:jours` ou chemin d'un fichier JSON      |
| `--overhead <jours>`   | Coût fixe des unités non ancres, défaut 0 ; nécessite `--effort`               |
| `--lot-rate <taux>`    | Taux marginal de 0 à 1, défaut 0,5 ; nécessite `--effort` ; 1 désactive le lot |
| `--help` / `--version` | Aide ou version, sans analyse                                                  |

Les durées sont des nombres finis positifs ou nuls ; le taux marginal est borné à 1. Une option inconnue, une valeur absente ou une entrée invalide provoque un échec explicite avant toute écriture. Codes de sortie : 0 pour une exécution réussie (consulter aussi les diagnostics), 1 pour une erreur. Ces codes sont distincts de ceux de la CLI principale.

Le dossier de sortie est créé automatiquement. Pour `resultat.json`, les autres vues sont `resultat.md` et `resultat.csv`, à côté du JSON. Les trois destinations sont contrôlées avant toute écriture : recouvrement des sources/configuration/ancres et destinations superposées sont refusés. Les fichiers sont préparés puis remplacés par renommage, sans tronquer une source liée par lien physique. Le remplacement est atomique par fichier, pas transactionnel entre les trois rapports. Le CSV échappe les cellules de texte pouvant être interprétées comme des formules.

### Estimation et limites

Une seule ancre définit une durée constante. Plusieurs ancres définissent une interpolation linéaire par morceaux ; hors domaine, la pente globale sert à extrapoler. Les jours extrapolés sont bornés à zéro. Les ancres de même indice sont moyennées, avec diagnostic : elles ne sont alors plus toutes reproduites exactement. Une forte pente entre indices proches reste possible.

Le coût fixe s'ajoute uniquement aux unités non ancres. Le lot repart de ces durées individuelles : pour chaque indice arrondi, l'unité la plus coûteuse conserve son plein tarif et les autres reçoivent le taux marginal. Ce calcul est déterministe et ne réapplique pas le coût fixe. La mutualisation reste une hypothèse métier : un même indice ne démontre pas un même travail.

Les rapports comprennent aussi les totaux par catégorie, les extrapolations, des points Fibonacci dérivés des jours et une validation croisée leave-one-out à partir de quatre indices d'ancrage distincts. Ces éléments ne mesurent pas une vélocité d'équipe et ne valident pas les hypothèses opérationnelles de coût fixe ou de lot. Une API indisponible bloque l'estimation de charge, avec un message invitant à consulter le rapport sans `--effort`.

Les poids et le modèle restent propres au script ; ils ne sont pas validés comme modèle de charge universel. Les rapports ne sont pas acceptés par les commandes `report`, `compare` et `history` de la CLI. Les imports dynamiques, la génération de props et les conventions React non reconnues demandent encore une vérification manuelle.

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
