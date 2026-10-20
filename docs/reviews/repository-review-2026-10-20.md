# Revue du dépôt — 20 octobre 2026

## Suivi des corrections S01–S09 et C01–C02

Les constats et validations de la revue initiale sont conservés ci-dessous comme historique. À la demande de l'utilisateur, un patch ultérieur traite les onze constats :

| Référence | Correction livrée                                                                                                                            | Régression vérifiée                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S01       | Le lot utilise les durées individuelles, coût fixe déjà inclus hors ancres ; l'unité la plus coûteuse du groupe reste au plein tarif         | Le cas à 15 j donne désormais 14,5 j en lot, économie 0,5 j                                  |
| S02       | Identifiants fondés sur les chemins, frontière stable du composant ; ancres courtes refusées si ambiguës                                     | Homonymes de composants/hooks et sous-dossiers internes                                      |
| S03       | Barrel limité aux imports/réexports sans implémentation                                                                                      | Implémentation en export par défaut et barrels cycliques                                     |
| S04       | Résolution TypeScript des dossiers/alias/réexports, degrés calculés sur des arêtes uniques, imports de types séparés                         | Fan-in des hooks, alias tsconfig, cycle de barrels et dépendance de type                     |
| S05       | Prévalidation de toutes les destinations, garde des entrées, création des dossiers, préparation puis renommage par fichier, échappement CSV  | Sorties dans les sources, jonction, lien physique et vue compagnon invalide                  |
| S06       | Prédiction constante pour une seule abscisse ; moyenne diagnostiquée des ancres au même indice                                               | Une ancre et plusieurs ancres de même indice                                                 |
| S07       | Commander, chargement JSON inline/fichier, Zod et contrôle des bornes, options inconnues ou absentes refusées                                | Formats d'ancres, durées négatives/non numériques/infinies et taux hors bornes               |
| S08       | Percentile 0 pour un singleton ; `null` si l'indice est indisponible                                                                         | Singleton et props non résolues                                                              |
| S09       | Props résolues sur les fonctions de rendu exportées, auxiliaires/stories exclus, hooks React importés, observations et diagnostics localisés | Types importés/composés, alias React, spreads, props estimées/indisponibles                  |
| C01       | Statut de chaque ratio issu de ses deux opérandes ; version `ratios-1.1.0`, agrégation `1.1.0` dans les rapports CLI                         | Numérateurs/dénominateurs estimés, nuls, indisponibles et indépendance du ratio documentaire |
| C02       | Deux dates fixes dans le test d'historique, sans dépendance à la date courante                                                               | Archivage, ordre chronologique et archive corrompue                                          |

Le script reste autonome par rapport au code de la CLI et s'exécute sans build. Il utilise les dépendances TypeScript, Commander et Zod du dépôt. Le schéma et les algorithmes du script passent à `2.0.0` : les anciens rapports et ancres doivent être réexaminés, car le périmètre et les conventions de mesure ont changé. Les vues Markdown/CSV prennent désormais le nom de base du JSON de sortie.

Les limites méthodologiques restent applicables : aucun résultat RGAA, aucun modèle universel de charge, aucune vélocité mesurée à partir des points dérivés. Les améliorations transversales non incluses dans S01–S09/C01/C02 (optimisation du moteur, nouvelles vues de la CLI, validation terrain et durcissement général des schémas) restent des propositions.

Les nouvelles validations du patch sont consignées dans [docs/validation.md](../validation.md).

## Revue initiale avant corrections

## Périmètre et méthode

Revue locale de la CLI TypeScript, du script autonome, des tests, des schémas, du packaging et de la documentation. Les deux outils restent indépendants : leurs différences de conventions ne constituent pas à elles seules des défauts. Les arbitrages A01–A09 de la V4 sont enregistrés comme validés ; l'architecture cible reste une proposition, distincte de l'architecture implémentée.

Les essais supplémentaires utilisent uniquement des fichiers synthétiques temporaires et exécutent les outils du présent dépôt. Aucune bibliothèque interne ni aucun de ses scripts n'a été exécuté ou transmis à un service externe. Le présent patch modifie la documentation ; il ne corrige pas les algorithmes.

## Évaluation générale

La CLI possède un socle cohérent : TypeScript strict, configuration Zod, AST et résolution TypeScript, identités par bibliothèque et chemin, mesures versionnées et localisées, diagnostics de limites, séparation du code propre et de l'exposition, rapports locaux, comparaison et archives. La protection des destinations et les tests de non-modification répondent à un besoin important de l'analyse en lecture seule.

Le script autonome fournit une restitution plus directement exploitable pour explorer une charge : classement compact, fichiers d'origine, unités partagées, catégories, CSV, ancres, extrapolations, coût fixe, estimation en lot, conversion Fibonacci et validation croisée. Son niveau de validation et de traçabilité reste inférieur à celui de la CLI. Aucun de ces résultats ne constitue une conformité RGAA ni une estimation validée sur des travaux réels indépendants des ancres.

## Évolutions observées du script

- Le classement inclut les unités hors `components/`, en catégorie `shared`, avec une granularité par fichier pour `hooks/`, `contexts/` et `internal/`.
- Les chemins des fichiers figurent dans `details.paths` et l'export CSV.
- Les props sont recherchées dans davantage de noms d'interfaces, dans les alias de type littéral et, en repli, dans les paramètres destructurés. La borne de normalisation est maintenant 0–40.
- L'estimation publie les jours, les points Fibonacci, les catégories, les extrapolations, un coût fixe, une estimation en lot et une validation croisée lorsque quatre indices d'ancrage distincts sont disponibles.

Ces fonctionnalités élargissent le périmètre du total : il inclut maintenant des unités partagées, et pas uniquement des composants visuels. Les estimations doivent préciser si leur activité couvre également ces unités.

## Constats prioritaires

P1 : résultat faux, perte silencieuse ou risque d'écriture. P2 : robustesse, explication ou usage limité. Les priorités sont des propositions de cette revue.

| ID  | Priorité | Constat et preuve                                                                                                                                                                                                                                                                  | Conséquence / proposition                                                                                                                                                 |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | P1       | [Calcul en lot](../../scripts/component-complexity.mjs) : pour A=1 j, C=3 j, B de même indice que A, coût fixe 10 j et taux 0,5, le total individuel vaut 15 j et le total en lot 29,5 j, soit une économie de −14,5 j                                                             | Le lot applique le coût fixe aux ancres, contrairement à l'individuel. Définir une base commune et tester les groupes mixtes ancres/non ancres                            |
| S02 | P1       | [Identité](../../scripts/component-complexity.mjs) : deux `Button` de catégories différentes fusionnent en une ligne de deux fichiers ; `hooks/useFocus.ts` et `internal/useFocus.ts` fusionnent aussi                                                                             | Employer un identifiant fondé sur le chemin, distinct du nom affiché ; fixer la frontière des composants avant de parcourir les sous-dossiers                             |
| S03 | P1       | [Barrels](../../scripts/component-complexity.mjs) : `export default () => <button/>` est reconnu comme barrel ; dans un composant imbriqué, ses métriques de code sont neutralisées, à d'autres emplacements il est ignoré                                                         | Limiter le barrel aux déclarations sans implémentation ; tester toutes les formes d'export par défaut                                                                     |
| S04 | P1       | [Graphe](../../scripts/component-complexity.mjs) : un import valide `../../b/B` vers le dossier de B donne fan-out de A=0 et fan-in de B=0. Un import direct d'un hook est compté dans `sharedDeps` mais le fan-in du hook reste nul, car la branche partagée ne le met pas à jour | Résoudre les chemins de modules puis construire les arêtes avant le calcul des degrés ; suivre les réexports et distinguer les imports de types                           |
| S05 | P1       | [Sorties](../../scripts/component-complexity.mjs) : écritures directes et noms Markdown/CSV fixes sans garde des sources                                                                                                                                                           | Refuser le recouvrement avec les entrées, vérifier toutes les destinations avant d'écrire et créer les sorties de façon atomique ; éviter les collisions entre exécutions |
| S06 | P2       | [Interpolation](../../scripts/component-complexity.mjs) : une seule ancre retourne un objet sans `predict`, ensuite appelé ; reproduit avec `--effort Button:1`                                                                                                                    | Fournir une prédiction constante ou refuser clairement ce cas ; tester aussi plusieurs ancres au même indice                                                              |
| S07 | P2       | [Arguments](../../scripts/component-complexity.mjs) : le fichier d'ancres annoncé n'est pas chargé ; absence de validation stricte des durées finies et positives ou nulles, options inconnues ignorées                                                                            | Employer Commander et Zod, déjà disponibles, et rendre l'aide conforme au comportement                                                                                    |
| S08 | P2       | [Percentile](../../scripts/component-complexity.mjs) : corpus d'un seul composant → division par zéro et `null` dans le JSON                                                                                                                                                       | Définir le cas singleton et la convention de rang pour les ex æquo                                                                                                        |
| S09 | P2       | [Métriques](../../scripts/component-complexity.mjs) : les props proviennent de noms de types et de toutes les fonctions destructurées, sans résolution des exports ; les stories restent incluses ; les hooks sont reconnus par expression régulière                               | Documenter les heuristiques, ajouter des diagnostics et des preuves, puis tester types importés/composés, auxiliaires, stories et alias React                             |
| C01 | P2       | [Ratios CLI](../../src/aggregation.ts) : une observation `api.props=estimated, value=2` et `tests.declarations=measured, value=4` donne `tests.perProp=measured, value=2`                                                                                                          | Le statut doit dépendre du numérateur et du dénominateur de chaque ratio ; la règle actuelle utilise aussi le statut des tests pour le ratio documentaire                 |
| C02 | P2       | [Test d'historique](../../tests/reports.test.ts) : le second rapport est fixé au 16 octobre 2026 mais le premier utilise la date courante ; l'ordre attendu devient faux après cette date                                                                                          | Fixer les deux dates ou injecter une horloge. L'échec constaté ne démontre pas un défaut du tri de l'historique                                                           |

## Limites et améliorations transversales

### Fiabilité des mesures

Le comptage cyclomatique du script est une base par fichier avec boucles ; celui de la CLI est une convention par fonction sans boucles, versionnée dans la V4. Ne pas comparer ces valeurs directement. Les normalisations saturées du script et l'arrondi au centième créent des ex æquo qui ne prouvent pas une similarité fonctionnelle ni une mutualisation du travail.

Les poids actuels totalisent 1, mais le commentaire annonçant une renormalisation automatique n'est pas réalisé par le code. La validation croisée porte sur les ancres dédupliquées, avec prédictions arrondies ; elle ne valide pas le coût fixe, les remises en lot ou la généralisation aux hooks et contextes. Les points Fibonacci sont une transformation des jours estimés, pas une observation indépendante de vélocité.

Propositions : publier des versions de schéma et de politique de score, les arguments d'estimation complets, le type d'unité, les contributions par métrique et les limites de collecte. Conserver une précision interne avant arrondi d'affichage. Valider sur une activité définie et un jeu de composants distinct des ancres, avec erreur absolue et dispersion des erreurs.

### Architecture, performance et rapports

L'orchestration de la CLI emploie plusieurs recherches répétées dans les listes d'unités, composants et diagnostics. Avant de modifier son architecture, mesurer sur un corpus représentatif ; des index `Map` pour l'appartenance et les relations seraient une première optimisation ciblée. Le filtre de composant est appliqué après l'inventaire et la détection : il réduit le rapport et la phase de mesure, mais ne supprime pas le coût initial du scan global.

Les rapports de la CLI sont sûrs et détaillés, mais la synthèse pourrait reprendre les idées du script : tableau compact par composant, tri par métrique brute, filtres de disponibilité et fan-in explicite. Tout score ou estimation dans la CLI reste une évolution à arbitrer selon la V4. Le script peut reprendre les principes de traçabilité et de protection sans importer le code de la CLI ni perdre son autonomie d'exécution.

La validation runtime de la CLI contrôle de nombreuses références, mais peut être renforcée : cohérence des listes d'appartenance avec les propriétaires, références des preuves et des dépendances de types, cardinalités par unité et disjonction des listes propres/exposées. Ce sont des propositions de durcissement, pas la preuve de rapports erronés produits par le moteur.

### Qualité et intégrations

La suite Vitest couvre la CLI (`src/**/*.ts` pour l'instrumentation), sans suite dédiée au script autonome. Ajouter des tests du script exécuté comme un processus sur des fixtures isolées, couvrant notamment S01–S09, avant d'en enrichir les estimations. Le formater dans un patch séparé permettrait de garder lisibles les corrections fonctionnelles.

Docker et Jenkins sont des exemples, et Sonar un export local ; leurs fichiers ne prouvent pas une exécution réussie sur ces services. Le benchmark existant mesure un petit corpus synthétique. Les performances réelles, le comportement monorepo et les conventions des bibliothèques restent à éprouver localement. Les résultats historiques de `docs/validation.md` ne sont pas les résultats de la présente revue.

## Plan d'amélioration proposé

1. Corriger les écritures et les erreurs de périmètre du script : identités, barrels, graphe et cohérence du coût fixe dans les lots ; ajouter les tests correspondants.
2. Corriger la propagation des statuts des ratios de la CLI et stabiliser le test d'historique.
3. Valider les arguments du script, les nombres, les petits corpus et les ancres ex æquo ; ajouter une aide et des versions de résultats.
4. Séparer explicitement composants et infrastructure dans les classements et totaux ; définir les métriques de props et de dépendances attendues avant de les renforcer.
5. Évaluer les estimations sur des observations indépendantes ; améliorer ensuite les vues de synthèse et mesurer les besoins de performance.

Ces propositions ne sont pas des décisions d'architecture validées et ne sont pas implémentées dans ce patch documentaire.

## Vérifications de cette revue

| Contrôle exécuté                      | Résultat                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `npm.cmd run typecheck`               | Réussi                                                                           |
| `npm.cmd run lint`                    | Réussi                                                                           |
| Build lancé par `npm.cmd test`        | Réussi                                                                           |
| `npm.cmd test`                        | 54 tests réussis, 1 échec : C02, test d'historique dépendant de la date          |
| `npm.cmd run format:check`            | Échec : `scripts/component-complexity.mjs` ne respecte pas le formatage Prettier |
| `npm.cmd run docs`                    | Réussi, documentation TypeDoc générée                                            |
| Prettier sur le README et cette revue | Réussi                                                                           |
| `git diff --check`                    | Réussi                                                                           |

Les reproductions synthétiques confirment S01–S04, S06–S08 et C01 ; S05 et S09 sont établis par lecture du code et du périmètre des essais. Aucun test n'a cherché à écraser une source réelle. Les fixtures sont conservées dans les dossiers temporaires de la revue, hors du dépôt.

La couverture instrumentée, le benchmark, la régénération des schémas, l'exécution Docker/Jenkins et l'import sur un serveur Sonar n'ont pas été relancés dans cette revue. Aucun résultat historique de couverture ou de performance n'est revendiqué comme nouveau résultat. Aucun code d'analyse, poids ou modèle de charge n'a été modifié.
