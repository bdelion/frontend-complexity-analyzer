# Validation locale du CLI

Environnement : Windows, Node v22.23.3, Intel Core i3-4130 à 3,40 GHz, environ 8 Go de RAM. Les résultats concernent des fixtures synthétiques ; ils ne constituent pas une validation des comptages sur les librairies internes.

## Correctifs S01–S09/C01/C02 — 20 octobre 2026

Le script autonome est testé comme un processus réel dans `tests/component-complexity.test.ts`. Les cas couvrent les identités par chemin, les sous-dossiers, les exports par défaut, les props importées/héritées/composées, les alias React, les stories et dossiers exclus, les erreurs de parsing, les barrels et cycles, les alias tsconfig, les degrés du graphe et les dépendances de types.

La calibration vérifie les ancres inline et fichier, la constante, les ancres ex æquo, les arguments invalides/vides, les débordements numériques, la validation croisée et le lot avec coût fixe. Le cas initialement incohérent à 15 jours individuels donne maintenant 14,5 jours en lot. Les tests d'écriture préservent les sources et ancres, refusent les jonctions vers les entrées, évitent la troncature par lien physique et neutralisent les formules CSV. Les fixtures restent dans le dossier temporaire.

Pour la CLI, le test de ratios vérifie les deux opérandes, les données absentes et l'indépendance du ratio documentaire ; le test d'historique utilise deux dates fixes. La version d'agrégation est `1.1.0` et celle des ratios agrégés `ratios-1.1.0`. Le script publie son schéma et ses algorithmes `2.0.0` ; les anciens rapports et ancres doivent être réexaminés.

Contrôles exécutés sur le patch :

- `npm.cmd run typecheck` : réussi.
- `npm.cmd run lint` : réussi.
- `npm.cmd run format:check` : réussi sur tout le dépôt, script compris.
- Build : réussi lors de `npm.cmd test` et de `npm.cmd run test:coverage`.
- `npm.cmd test`, passage final : **88 tests réussis dans 9 fichiers**, dont les 32 tests du script autonome. Aucun échec.
- `npm.cmd run test:coverage` : 85 tests réussis dans 9 fichiers au moment de ce passage. Couverture CLI : lignes/instructions 97,48 %, branches 94,67 %, fonctions 95,45 % ; seuils respectés.
- Après l'ajout de trois cas d'arguments vides, la suite du script contient 32 tests, tous réussis. Les derniers ajustements des vues Markdown sont également inclus dans la validation finale.
- `npm.cmd run docs` : réussi.
- `git diff --check` : réussi.

L'instrumentation porte sur `src/**/*.ts` ; elle n'instrumente pas les sous-processus du script autonome. Aucune couverture chiffrée de ce script n'est revendiquée. Le benchmark et les services Docker/Jenkins/Sonar n'ont pas été relancés. Aucun poids n'a été modifié et aucune calibration sur un corpus réel n'est revendiquée.

## Résultat initial, avant corrections S01–S09/C01/C02

`npm.cmd run test:coverage` : **55 tests réussis dans 8 fichiers**, y compris les tests E2E du binaire compilé. Couverture globale : instructions et lignes **97,48 %**, branches **94,67 %**, fonctions **95,45 %**. Tous les seuils >80 % sont respectés. Les sous-processus des tests E2E sont vérifiés fonctionnellement ; leur couverture n'est pas fusionnée avec celle de Vitest.

Les tests ciblent notamment les suites Playwright (`test.describe`), les namespaces et alias de frameworks, les `.each` simples et en template, les annotations conditionnelles et les suites ignorées, en plus des critères ci-dessous.

L'indicateur d'avancement est vérifié avec une horloge contrôlée : estimation par phase, compteurs, arrêt des timers, nettoyage avant résultats/erreurs, largeur du terminal et silence avec `--no-progress`. Le moteur produit les mêmes métriques avec ou sans observateur. Un essai manuel en terminal Windows a confirmé l'animation sur une ligne et l'affichage d'une durée restante estimée.

## Contrôles à reproduire

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run docs
npm.cmd run schemas
node dist/cli.js analyze --config examples/analyzer.config.json --explain --stats
npm.cmd run benchmark
```

Le seuil des tests est de 60 secondes par cas pour laisser une marge à l'instrumentation de couverture sur cette machine. Le test multi-librairies réalise plusieurs analyses indépendantes ; un premier passage instrumenté avec benchmark et génération documentaire concurrents a dépassé l'ancienne limite de 30 secondes. Les validations finales doivent être effectuées sans ces tâches lourdes concurrentes.

## Repère de performance synthétique

Trois processus distincts, 100 composants, 200 fichiers, 300 LOC de production :

| Exécution | Durée incluant démarrage et rapports | RSS maximale       |
| --------- | ------------------------------------ | ------------------ |
| 1         | 5,919 s                              | 269 832 192 octets |
| 2         | 6,605 s                              | 267 997 184 octets |
| 3         | 8,358 s                              | 269 717 504 octets |

Ces mesures ont été obtenues pendant un passage de couverture des tests ; les caches disque n'ont pas été purgés. Elles donnent un ordre de grandeur local, sans garantir le résultat sur une librairie réelle ni satisfaire à elles seules AC15 de la V4. `FCA_BENCH_COMPONENTS` permet de changer la taille du corpus. Les fixtures et rapports générés restent dans le dossier temporaire affiché par le script.

## Correspondance avec les critères V4

| Critères       | Vérification                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| AC01/AC02/AC04 | Tests moteur : multi-librairies, exports/wrappers/barrels, partage et cycles                                          |
| AC03           | Tests de fichiers : sorties recouvrant les entrées, jonctions, liens physiques ; tests moteur/E2E de non-modification |
| AC05/AC06      | Fixtures chiffrées, fonctions imbriquées, données absentes, parsing invalide, imports dynamiques/irrésolus            |
| AC07/AC08      | Schémas runtime, références, preuves, doublons, déterminisme et empreinte de configuration                            |
| AC09/AC10      | Tests Jest/Vitest/Playwright déclaratifs, ARIA/clavier et limites explicites                                          |
| AC11/AC12      | Commandes injectables et binaire compilé ; JSON/Markdown/CSV/HTML échappés                                            |
| AC13           | Ajouts/suppressions, incompatibilités, données estimées et archives uniques                                           |
| AC14           | Scripts typecheck/lint/tests/couverture/build/TypeDoc                                                                 |
| AC15           | Repère synthétique disponible ; corpus/machine de référence encore à convenir                                         |
| AC16           | Scoring différé conformément à A01/A02 ; aucun score à valider dans ce patch                                          |
| AC17           | Exemples Jenkins/Docker et contrat d'export Sonar testés localement ; services non exécutés                           |

Docker absent de l'environnement de développement ; Jenkins et Sonar ne sont pas connectés. La génération de leurs fichiers est distincte d'une validation en service. Aucun push, déploiement ou publication n'est effectué.
