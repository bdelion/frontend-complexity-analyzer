# Transmission de contexte — échanges ChatGPT → VSCode

## Besoin exprimé
La Squad maintient plusieurs librairies React/TypeScript de composants Design System (Button, Combobox, TreeView…), intégrant les exigences RGAA et WAI-ARIA. Objectif : estimer leur complexité par analyse de code, comparer les composants et mieux orienter maintenance, tests et roadmap.

## Informations fournies par l'utilisateur
- Un répertoire par composant dans les librairies.
- Tests Jest et Playwright situés à côté des sources.
- Exécution locale sur Windows dans VSCode, avec chemins de librairies fournis à une CLI Node.js/TypeScript.
- Cinq spécifications ont été transmises et sont conservées dans `docs/specifications/`.
- L'utilisateur souhaite poursuivre la conception et les développements avec Codex dans VSCode.

## Proposition issue de la discussion (pas encore validée)
- CLI autonome, en lecture seule, capable d'analyser plusieurs racines et un composant isolé.
- Découverte des composants, attribution des fichiers/tests, analyse AST, code partagé et dépendances, métriques React/API, tests Jest/Playwright, accessibilité, reporting JSON/Markdown/HTML ; extension CSV, Storybook, Vitest, Jenkins, Docker, SonarQube et historique conformément aux documents.
- Séparer trois indicateurs : complexité intrinsèque, effort/obligations d'accessibilité et risque de maintenance.
- Mesurer complexité cognitive en plus de cyclomatique ; conserver preuves et données brutes.
- Une V4 consolidée est à produire avant implémentation, avec arbitrage des divergences.

## Divergences explicites dans les sources
- Pondération « clavier » : 20 % dans les cahiers des charges, 15 % dans Full Specification et V3, avec 5 % de maintenabilité dans ces deux derniers.
- Les documents évoquent un score global unique ; la discussion recommande de distinguer complexité, accessibilité et risque.
- Les catégories de composants (Button, Tabs, Combobox, TreeView) sont des typologies indicatives, pas des scores mesurés.

## Risques méthodologiques identifiés pendant la discussion
- Compter les attributs ARIA ou touches clavier ne prouve pas la conformité RGAA.
- Compter les tests ne mesure pas directement leur efficacité ; les tests réduisent plutôt le risque que la complexité intrinsèque.
- Les hooks et utilitaires partagés doivent être attribués sans double comptage.
- Les scores ne peuvent pas être convertis directement en jours de développement sans calibration historique.
- Ne pas déduire de zéro lorsqu'une mesure est indisponible.

## Prochaine action attendue
Produire une V4 consolidée et un plan d'implémentation vérifiable. Ne pas développer les analyseurs avant validation des arbitrages.
