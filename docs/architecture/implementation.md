# Architecture implémentée — version 0.1.0

La [V4](../design/specification-v4.md) reste la référence de conception validée. Ce document décrit le code livré et ses limites, sans réécrire les sources originales.

| Module                       | Fonction                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `configuration.ts`           | Zod strict, motifs picomatch, chemins canoniques et empreinte logique                                    |
| `filesystem.ts`              | Scan stable sans liens, protection des entrées, écritures de rapports                                    |
| `engine.ts`                  | Inventaire, projets ts-morph par tsconfig, composants-répertoires, attribution, imports et orchestration |
| `ast.ts`                     | Références importées, exports candidats, preuves et fabrique de métriques                                |
| `code-analyzer.ts`           | LOC tokenisées, CC par fonction, React, API résolue, TSDoc                                               |
| `interaction-analyzer.ts`    | Signaux ARIA, rôles, focus, gestionnaires et touches                                                     |
| `test-analyzer.ts`           | Jest/Vitest/Playwright déclaratifs, ambiguïtés explicites                                                |
| `graph.ts`, `aggregation.ts` | Cycles condensés, profondeur, agrégation sans double comptage et ratios explicites                       |
| `models.ts`                  | Contrats Zod, valeurs/statuts/preuves, validation des références                                         |
| `reporting.ts`               | JSON, Markdown, CSV, HTML local échappé                                                                  |
| `comparison.ts`              | Compatibilité, deltas et archives uniques                                                                |
| `coverage.ts`                | Bundle de couverture existant avec vérification SHA-256                                                  |
| `sonar.ts`                   | Export Generic Issues informatif ; pas de publication                                                    |
| `cli.ts`, `index.ts`         | Commandes et API publique, codes 0/1/2                                                                   |
| `progress.ts`                | Indicateur stderr, phases et estimation du temps restant par phase ; observateur optionnel du moteur     |

## Décisions d'implémentation

- `analyzer` est le nom principal, `rcca` son alias. L'usage direct `node dist/cli.js` est documenté.
- Picomatch fournit les filtres ; un scan Node natif évite de suivre les liens. Handlebars/Chart.js ne sont pas nécessaires à un rapport HTML autonome ; aucun radar sur des métriques non normalisées.
- Les trois axes sont des listes de familles dans `profiles`, sans scores. JSON contient toutes les unités, preuves et observations ; les vues présentent les métriques de librairies/composants et diagnostics.
- Le parsing et les imports n'exécutent pas les modules analysés. ts-morph peut lire les déclarations de dépendances pour résoudre les types, mais les métriques portent sur l'inventaire explicite. Les projets ne sont jamais sauvegardés.
- Les dépendances statiques sont résolues via le compilateur TypeScript. Les bibliothèques ont des projets distincts ; les références complexes entre tsconfig nécessitent des essais réels.
- Le scan ignore node_modules/dist/coverage/.git même si l'utilisateur remplace les exclusions. Les autres dossiers générés doivent être exclus par configuration.
- Les rapports ordinaires sont écrits dans un fichier temporaire puis remplacés par renommage : un lien physique préexistant ne permet pas de tronquer une source. Les archives utilisent une création exclusive.
- La couverture de découverte compte des frontières exclues, sans traverser leur contenu. Les champs historiques `excludedFiles`/`discoveredFiles` ont cette convention explicitement documentée dans le guide.
- Les tests multi-composants sont partagés selon imports directs ; aucune preuve d'efficacité de test n'est dérivée de leur nombre. Les tests paramétrés comptent une déclaration.
- La couverture importée est un bundle explicite de comptes avec empreintes ; les lecteurs LCOV/Istanbul natifs sont différés. Les branches sont conservées en comptes, le ratio `coverage.executed` porte sur les lignes.
- L'historique liste les exécutions ; les tendances s'obtiennent par comparaison de rapports compatibles. Aucun rapprochement automatique de renommage.

## Validation et points restant à éprouver

Les tests couvrent les règles de comptage, les données absentes/estimées, le partage et les cycles, les chemins/liaisons Windows, les invariants de rapports, les commandes et le binaire compilé. `npm.cmd run test:coverage` instrumente tout `src/`, avec seuils >80 % sur les quatre dimensions ; les tests E2E enfant exécutent aussi le point d'entrée réel mais leur couverture n'est pas fusionnée avec le processus Vitest.

Le benchmark génère des composants/tests synthétiques et lance trois processus CLI séparés. Il indique machine, version Node, nombre de composants/fichiers, LOC, durée et RSS maximale. Les caches disque ne sont pas purgés. Le seuil <5 minutes sur une « librairie standard » reste non contractualisé faute de corpus/machine convenus.

Jenkins, Docker et import Sonar demandent un environnement d'intégration pour validation réelle. Les exemples ne sont pas une publication ni un résultat d'exécution de ces services.

Extensions différées conformément à la V4 : calibration des scores et seuils, complexité cognitive (algorithme à décider), Git/churn et intégrations supplémentaires. Les tests terrain pourront affiner les conventions ; toute modification d'un comptage doit versionner son algorithme et adapter ses fixtures.
