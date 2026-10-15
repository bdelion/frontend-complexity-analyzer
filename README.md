# Frontend Complexity Analyzer — dossier de démarrage

Ce dépôt contient **uniquement la préparation du projet** : les cinq spécifications originales, la transmission de contexte, une architecture proposée, des décisions à arbitrer et des instructions agents Codex/Copilot. **Aucune CLI n'est encore implémentée.**

## Démarrer dans VSCode (Windows)
1. Décompresser le ZIP dans un dossier dédié, puis ouvrir ce dossier dans VSCode (`code .`).
2. Vérifier l'installation de l'extension officielle Codex (éditeur OpenAI), puis se connecter avec ChatGPT.
3. Lire `docs/context/conversation-handoff.md` et `docs/decisions/ADR-001-scoring.md`.
4. Coller le contenu de `docs/context/first-codex-prompt.md` dans Codex.
5. Lire la [spécification consolidée V4](docs/design/specification-v4.md) : arbitrages A01–A09 validés le 15 octobre 2026, à éprouver ensuite par les tests réels.

`AGENTS.md` donne les consignes de dépôt à Codex ; les skills dans `.agents/skills/` sont des procédures réutilisables et peuvent être prises en charge différemment selon l'agent ou sa version. Le dépôt Git est la source de contexte durable : la conversation ChatGPT web n'est pas transférée automatiquement.

## Statut
- Documents originaux : conservés tels quels dans `docs/specifications/`.
- V4 : arbitrages A01–A09 validés le 15 octobre 2026 ; ADR-001 accepté. Architecture et contrats détaillés constituent une base de conception à éprouver.
- Trois axes retenus sous forme de profils de métriques ; poids, scores numériques et seuils restent différés jusqu'à calibration.
- Les retours des tests réels permettront d'itérer ; aucune CLI ni aucun analyseur n'est encore implémenté.
- Commandes `npm` : non disponibles tant que le projet Node.js n'a pas été initialisé.
