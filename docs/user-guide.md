# Guide utilisateur

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
