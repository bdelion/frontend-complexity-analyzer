# Guide utilisateur

## Démarrer simplement

Ce guide explique comment demander à l'outil de regarder du code React et où trouver les résultats. Vous n'avez pas besoin de connaître les détails de l'analyse pour faire un premier essai.

### Les mots utiles

| Mot       | En clair                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| Librairie | Le dossier qui contient les composants de votre Design System.                     |
| Composant | Un morceau d'interface, par exemple un bouton ou une liste déroulante.             |
| Analyse   | L'outil lit les fichiers et compte des indices. Il ne lance pas l'application.     |
| Mesure    | Un nombre trouvé dans le code, par exemple le nombre de propriétés d'un composant. |
| Preuve    | Le nom du fichier et la ligne où l'indice a été trouvé.                            |
| Rapport   | Les fichiers qui présentent les résultats de l'analyse.                            |

### Faire un premier essai

1. Ouvrez PowerShell dans le dossier de **cet outil**.
2. Vérifiez que Node.js 22.12 ou une version plus récente est installé.
3. Préparez l'outil et lancez son exemple :

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
node dist/cli.js analyze --config examples/analyzer.config.json --explain
Start-Process ./reports/demo/index.html
```

Le navigateur ouvre le rapport de démonstration. Cet essai utilise les fichiers d'exemple livrés avec l'outil, pas votre librairie.

### Regarder votre librairie

Choisissez un dossier de sortie différent du dossier de votre librairie. L'outil refuse d'écrire dans les fichiers qu'il analyse.

```powershell
node dist/cli.js analyze --root "D:\Git\design-system" --output "D:\Rapports\design-system" --format json,md,csv,html --explain
```

Remplacez les deux chemins par ceux de votre ordinateur. Les guillemets sont importants si un chemin contient des espaces.

Pour regarder un seul composant, ajoutez par exemple `--component Button`. Si ce nom existe plusieurs fois, l'outil vous demandera d'utiliser un identifiant plus précis. Voir [Choisir un composant](#composant-isolé-et-code-partagé).

### Ouvrir et comprendre les résultats

Dans le dossier de sortie, vous trouverez les formats demandés :

- `report.md` : un résumé à lire ;
- `index.html` : une page à ouvrir dans un navigateur ;
- `report.csv` : un tableau à ouvrir dans un tableur ;
- `report.json` : tous les résultats et leurs détails.

Les mesures portent sur ce que l'outil peut lire dans les fichiers. Elles ne disent pas, à elles seules, si l'interface fonctionne bien.

| Statut        | Ce que cela veut dire                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `measured`    | L'indice a été trouvé et compté. Cela ne prouve pas son comportement quand l'application tourne. |
| `estimated`   | L'outil a trouvé des indices, mais il sait qu'il lui manque une partie des informations.         |
| `unavailable` | Il manque trop d'informations pour donner un nombre fiable. La valeur est `null`, pas zéro.      |

Un diagnostic explique un doute ou un problème et indique le fichier concerné. Le code de sortie est **0** si l'analyse est complète, **1** si elle est partielle et **2** si une entrée est invalide ou si une erreur empêche l'analyse.

### Ce que l'outil ne fait pas

- Il ne modifie pas votre librairie.
- Il ne lance ni ses tests, ni ses scripts, ni votre application.
- Il ne prouve pas automatiquement la conformité RGAA.
- Il ne transforme pas les nombres en jours de travail.
- Il ne dit pas qu'un test a réussi simplement parce qu'il l'a trouvé dans un fichier.

Pour commencer, retenez ceci : l'outil donne des **indices à vérifier**, pas un verdict.

## Référence détaillée

Les sections suivantes expliquent les réglages, les limites et les fonctions avancées. Si vous voulez seulement essayer l'outil, vous pouvez vous arrêter ici.

### Trouver une commande ou une option

L'outil peut afficher son aide sans analyser de fichiers :

```powershell
node dist/cli.js --help
node dist/cli.js analyze --help
```

Les options les plus utiles pour `analyze` sont :

| Option                          | À quoi elle sert                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `--config fichier.json`         | Lire les dossiers et réglages depuis un fichier.                                        |
| `--root "D:\...\librairie"`     | Indiquer le dossier de la librairie à regarder. Plusieurs dossiers peuvent être donnés. |
| `--output "D:\...\rapports"`    | Choisir où écrire les rapports, en dehors de la librairie.                              |
| `--format json,md,html`         | Choisir les types de rapports. Les choix possibles sont `json`, `md`, `csv` et `html`.  |
| `--component Button`            | Regarder un seul composant. Son nom doit être unique.                                   |
| `--explain`                     | Afficher les explications des avertissements.                                           |
| `--stdout`                      | Afficher aussi le rapport JSON dans la fenêtre PowerShell.                              |
| `--history "D:\...\historique"` | Garder une copie datée du rapport.                                                      |
| `--coverage fichier.json`       | Lire des résultats de couverture déjà produits ; aucun test n'est lancé.                |
| `--stats`                       | Afficher le temps et la mémoire utilisés.                                               |
| `--no-progress`                 | Cacher l'indicateur d'avancement.                                                       |

Autres commandes utiles :

| Commande                                                         | À quoi elle sert                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `validate-config --config fichier.json`                          | Vérifier les réglages avant l'analyse.                              |
| `report rapport.json --output dossier`                           | Refaire les rapports lisibles à partir d'un rapport JSON déjà créé. |
| `compare ancien.json nouveau.json`                               | Comparer deux analyses compatibles.                                 |
| `history add rapport.json --output dossier`                      | Ranger un rapport dans l'historique.                                |
| `history list dossier`                                           | Afficher les rapports rangés dans l'historique.                     |
| `schema config` ou `schema report`                               | Afficher la forme attendue d'un fichier JSON.                       |
| `sonar rapport.json --project-base dossier --output issues.json` | Préparer un fichier pour Sonar ; cela ne l'envoie pas à Sonar.      |

## Analyse locale et sécurité des entrées

Exécuter `npm.cmd ci --ignore-scripts`, puis `npm.cmd run build` dans le dépôt de l'outil. Seuls ses scripts de construction/tests sont nécessaires. Une analyse ne charge aucun module applicatif, configuration JS, plugin ou script de la librairie.

```powershell
node dist/cli.js analyze --root "D:\Git\ds-a" "D:\Git\ds-b" --output "D:\Rapports\analyse" --format json,md,csv,html --explain --stats
```

Les racines superposées sont refusées. Les liens rencontrés dans le scan sont ignorés et listés ; aucune jonction n'est suivie. Les sorties canoniques recouvrant une racine d'entrée sont refusées, y compris si un fichier de sortie existant ou un de ses parents est un lien vers une source. Choisir un dossier de rapports distinct, jamais un sous-dossier de la librairie. Les fichiers sources, tests, stories et tsconfig sont uniquement lus. Les rapports peuvent contenir des noms de composants, chemins locaux et diagnostics : ils restent sur la machine.

## Configuration reproductible

Préférer une configuration avec des identifiants explicites pour comparer des exécutions successives :

```json
{
  "schemaVersion": "1.0.0",
  "libraries": [
    {
      "id": "ds",
      "root": "D:/Git/design-system",
      "componentGlobs": ["src/components/**"],
      "tsconfig": "tsconfig.json"
    }
  ],
  "exclusions": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/.git/**",
    "**/generated/**"
  ],
  "testPatterns": {
    "jest": ["**/*.test.tsx"],
    "vitest": [],
    "playwright": ["**/e2e/*.spec.ts"]
  },
  "ownershipOverrides": { "ds:src/shared/useWidget.ts": null },
  "outputDirectory": "D:/Rapports/design-system",
  "formats": ["json", "md", "csv", "html"]
}
```

Les chemins `root` et `outputDirectory` sont relatifs au fichier JSON ; les arguments CLI le sont au répertoire courant. `tsconfig` est relatif à la racine de sa librairie et doit y appartenir. Sans ce champ, le tsconfig parent le plus proche dans la racine est utilisé. Les fichiers sont mutualisés par projet TypeScript. Une configuration invalide ou un tsconfig illisible interrompt la commande.

Priorité : CLI > fichier > défauts. Les paramètres inconnus sont rejetés. `--root` remplace toutes les librairies du JSON ; les identifiants automatiques dépendent du nom normalisé et de l'ordre des racines. Pour conserver l'identité après déplacement ou réordonnancement, utiliser `libraries[].id` explicitement.

`componentGlobs` porte sur les **répertoires relatifs**, pas les noms de fichiers. Un répertoire exportant plusieurs composants est une seule unité de composant avec plusieurs exports. `ownershipOverrides` associe `libraryId:chemin/du/fichier` à un répertoire relatif de composant détecté, ou `null` pour du code partagé. Exemple de propriétaire : `"ds:src/utils.ts": "src/components/Button"`. Un propriétaire inconnu est refusé. Sans override, le composant parent détecté le plus proche possède le fichier.

Les anciens exemples `sourceFolders`, `reportFolder`, `historyFolder` doivent être migrés vers `libraries`, `outputDirectory` et l'option `--history`. Il n'existe pas de migration silencieuse des poids/seuils historiques. `node dist/cli.js schema config` affiche le contrat ; les fichiers de `schemas/` sont générés avec `npm.cmd run schemas`.

## Composant isolé et code partagé

```powershell
node dist/cli.js analyze --config analyzer.config.json --component "ds:src/components/Button" --explain
```

Un nom seul est accepté s'il est unique. L'inventaire et la résolution des appartenances précèdent le filtrage ; les métriques ne sont calculées que pour le composant retenu et sa fermeture de dépendances. Une analyse isolée n'évite donc pas tout coût de découverte.

Chaque source possède une identité unique `libraryId:chemin/relatif`, chaque composant `libraryId:répertoire`. Les barrels ne créent pas de nouveau composant. Les fichiers partagés sont mesurés une seule fois dans `units`. Les métriques `own` décrivent le code propre ; `exposure` décrit les unités accessibles par les dépendances, sans les fusionner avec le code propre. Les totaux de librairie prennent l'union des unités, jamais la somme des expositions. Les dépendances de types sont conservées séparément. Les cycles sont condensés avant de calculer la profondeur.

## Lire les résultats

Dans un terminal interactif, un indicateur d'activité affiche la phase, le nombre d'unités traitées, le pourcentage, le temps écoulé total et le temps restant estimé pour cette phase. L'estimation commence après au moins deux unités et 500 ms ; elle peut varier selon la taille des fichiers. La découverte et la génération de rapports ont un volume inconnu : « en calcul » est affiché, sans promesse de durée totale. Les titres longs sont raccourcis pour conserver l'indicateur sur une ligne.

L'animation se rafraîchit entre unités et pendant les opérations asynchrones ; un calcul synchrone long (AST, agrégation ou rendu d'un rapport) peut momentanément la figer. En CI ou lorsque stderr est redirigé, des messages sobres annoncent les changements de phase sans séquences de contrôle. `--no-progress` désactive l'indicateur pour toutes les commandes. stdout reste réservé aux résultats, notamment avec `--stdout`.

`report.json` est le contrat versionné ; `report.md`, `report.csv` et `index.html` sont des vues du même rapport. HTML autonome, sans CDN ni appels réseau ; valeurs échappées, formules CSV neutralisées. Les informations détaillées par unité, rôles, noms ARIA, touches, distribution CC et liens du graphe se trouvent dans le JSON.

- `measured` : le fait statique a été compté ; cela ne prouve pas le comportement runtime.
- `estimated` : mesure visible ou interprétation partielle, avec justification.
- `unavailable` : valeur `null` et motif ; aucune substitution par zéro.

Un zéro disponible possède une preuve d'inventaire. Une erreur de parsing conserve le fichier et un diagnostic, sans inventer ses métriques. Le rapport partiel reste écrit, mais la commande retourne 1. Les diagnostics précisent les sources et lignes ; `--explain` les affiche aussi sur stderr.

`api.props` compte les propriétés propres exposées par les composants, avec union des noms dans les unions TypeScript. Les propriétés déclarées dans les types standard React/DOM sont séparées dans `api.inheritedProps`. Les callbacks restent inclus dans le nombre de props ; `api.events` en décrit le sous-ensemble dont le nom suit `onXxx`, sans l'ajouter à un score. Les types inconnus ou récursifs rendent les mesures concernées indisponibles.

`coverage` décrit la complétude du scan/analyse, **pas la couverture des tests**. `eligibleFiles = analyzedFiles + partialFiles + failedFiles`. `excludedFiles` compte des **frontières d'exclusion rencontrées** (fichiers, répertoires ou liens), sans explorer le contenu exclu. `discoveredFiles` additionne ces frontières aux fichiers éligibles ; ce n'est pas le nombre total de fichiers physiques sous les répertoires exclus.

La CC `cc-v4-proposal-1` compte par fonction : 1 + if + cases hors default + catch + ternaires + && + ||. `else if` est un seul if ; switch et boucles ne rajoutent rien dans cette convention. Fonctions imbriquées, méthodes et accesseurs ont leurs propres bases ; boucles comptées séparément. Somme, maximum et distribution sont distingués. Aucune fonction donne maximum indisponible.

Le nombre de tests actifs déclarés n'est ni le nombre de cas effectivement exécutés ni un taux de réussite. `.each` compte une déclaration, `.skip`/`.todo` sont séparés. Une API globale Jest/Vitest sans import ni motif configuré donne un diagnostic d'ambiguïté et des comptes estimés. Configurer `testPatterns` pour lever cette ambiguïté. Les motifs en conflit sont refusés ; les tests qui importent plusieurs composants sont partagés. Les parcours Playwright sont des sites d'actions/assertions, jamais une preuve d'exécution.

ARIA, focus et touches sont des signaux statiques. Les propagations JSX et valeurs dynamiques sont signalées. Une chaîne `Escape` hors condition sur `.key` ou `.code` n'est pas une interaction. La cible DOM des appels nommés focus/blur n'est pas garantie : ce compte est estimé. Ni un nom TreeView, ni beaucoup d'attributs, ni une assertion de test ne démontrent une conformité RGAA.

## Couverture préexistante avec empreintes

L'outil n'exécute pas Jest/Playwright pour obtenir une couverture. Il peut importer un bundle préparé à partir de résultats déjà disponibles :

```json
{
  "schemaVersion": "1.0.0",
  "producer": "export local du rapport Jest",
  "files": [
    {
      "libraryId": "ds",
      "relativePath": "src/components/Button/Button.tsx",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "lines": { "covered": 8, "total": 10 },
      "branches": { "covered": 2, "total": 4 }
    }
  ]
}
```

Remplacer l'empreinte d'exemple par le SHA-256 réel des octets du fichier au moment où la couverture a été produite. Un bundle dupliqué, inconnu, incohérent ou lié à une autre source est refusé. Le producteur du bundle est responsable de l'origine des comptes ; l'empreinte vérifie la correspondance des sources, pas l'authenticité d'une exécution.

```powershell
node dist/cli.js analyze --config analyzer.config.json --coverage coverage-bundle.json
```

Les comptes lignes/branches sont conservés ; `coverage.executed` est le ratio de lignes couvertes pour un composant/librairie seulement si toutes ses unités de production disposent d'une entrée et si le total est non nul. Sinon, il reste indisponible. Pas de lecture native LCOV/Istanbul pour cette version : convertir localement vers le [schéma de bundle](../schemas/coverage.schema.json).

## Comparaison et historique

```powershell
node dist/cli.js history add reports/report.json --output history
node dist/cli.js history list history
node dist/cli.js compare ancien.json nouveau.json --output comparaison.json
node dist/cli.js report reports/report.json --output vues --format md,csv,html
```

Le périmètre logique, les versions d'algorithmes et le schéma doivent être compatibles. Une mesure estimée/absente n'a pas de delta numérique. Un changement de version d'une métrique est expliqué, pas soustrait. Un déplacement de composant est un ajout/suppression ; pas de rapprochement heuristique. Les archives incluent date et UUID ; réarchiver le même run au même endroit est refusé. Les vues ne remplacent pas leur JSON d'entrée.

L'empreinte de périmètre inclut les options effectives des projets TypeScript : changer les alias ou le mode strict invalide la comparaison automatique. Les chemins absolus des racines sont normalisés dans cette empreinte afin qu'un déplacement local de la librairie ne redéfinisse pas son identité.

## CI, Docker et Sonar

[Jenkinsfile Windows](../examples/Jenkinsfile) : installation, contrôles de l'outil, analyse, archivage ; code 1 rend le build instable, code 2 le fait échouer. Ajouter un `publishHTML` si le plugin est installé et si la politique de publication le permet. Rien n'a été publié par le développement de l'outil.

```powershell
docker build -t frontend-complexity-analyzer .
docker run --rm --mount "type=bind,src=D:\Git\ds,dst=/inputs/ds,readonly" --mount "type=bind,src=D:\Rapports,dst=/outputs" frontend-complexity-analyzer analyze --root /inputs/ds --output /outputs --format json,html,md,csv
```

L'image utilise l'utilisateur `node` ; le montage de sortie doit lui être accessible. L'exemple Docker est fourni ; une validation du conteneur nécessite Docker disponible. Aucun Docker ni Jenkins n'est requis pour les essais locaux.

```powershell
node dist/cli.js sonar reports/report.json --project-base "D:\Git\ds" --output sonar-issues.json
```

Export local de diagnostics informatifs au format récent `rules`/`issues`, décrit par la [documentation officielle Sonar](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/importing-external-issues/generic-issue-import-format). Le chemin de chaque fichier doit être inclus dans `sonar.projectBaseDir`. L'import côté serveur se configure avec `sonar.externalIssuesReportPaths`. Aucune publication, aucun Quality Gate ni mesure personnalisée propriétaire n'est créé ; la compatibilité doit être essayée sur la version Sonar de l'équipe.

## Retours terrain et limites

Pour un retour exploitable : conserver la commande/configuration, version de l'outil, diagnostic et comptage attendu ; privilégier une reproduction synthétique ou locale. Aucun envoi de code interne à un service n'est requis.

La détection cible composants fonctionnels exportés avec JSX/rendu nul et wrappers React reconnus. Classes React, HOC arbitraires, réexports complexes entre projets TypeScript distincts, JSX entièrement délégué et types non résolus demandent une vérification. Les imports statiques sont suivis ; les imports dynamiques/require sont signalés et non développés. Le clavier utilise les comparaisons et switch `.key`/`.code` ; les dispatch indirects ne sont pas reconstruits. Les variantes/états de stories ne sont pas interprétés comme exhaustifs. Aucun algorithme cognitif, churn Git ou score calibré n'est livré.
