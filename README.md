# Frontend Complexity Analyzer

## À quoi sert cet outil ?

Imaginez que chaque composant React soit une boîte. Cet outil regarde les fichiers de la boîte et compte quelques éléments : ses propriétés, certaines décisions dans son code, des indices d'accessibilité et des déclarations de tests.

Il lit les fichiers de votre librairie, mais **ne les modifie pas** et **ne lance pas leurs scripts ni leurs tests**. Il écrit ses rapports dans un dossier séparé.

> Cet outil aide à regarder le code. Il ne dit pas si un composant est « bon », ne vérifie pas automatiquement la conformité RGAA et ne prédit pas le nombre de jours de travail.

## Essai rapide sous Windows

Ouvrez PowerShell dans le dossier du projet. Il faut Node.js **22.12 ou plus récent**.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
node dist/cli.js analyze --config examples/analyzer.config.json --explain
Start-Process ./reports/demo/index.html
```

La première commande prépare les outils. La deuxième construit l'analyseur. La troisième analyse la petite librairie de démonstration. La dernière ouvre le rapport dans le navigateur.

Les rapports de démonstration sont placés dans `reports/demo/`. Essayez d'abord cet exemple avant de choisir une vraie librairie.

## Analyser votre librairie

Remplacez les chemins par ceux de votre ordinateur. Le dossier des rapports doit être **à côté** de la librairie, pas dedans.

```powershell
node dist/cli.js analyze --root "D:\Git\design-system" --output "D:\Rapports\design-system" --format json,md,csv,html --explain
```

Pour regarder un seul composant :

```powershell
node dist/cli.js analyze --root "D:\Git\design-system" --output "D:\Rapports\button" --component Button --explain
```

Si plusieurs composants portent le même nom, l'outil vous le dira. Utilisez alors un fichier de configuration avec un identifiant de librairie et le chemin complet du composant. Le [guide utilisateur](docs/user-guide.md) montre comment faire.

Les commandes `analyzer` et `rcca` sont deux noms du même outil. Sans installation globale, `node dist/cli.js` est le moyen le plus simple de le lancer.

## Que trouve-t-on dans les rapports ?

- `report.json` contient toutes les mesures et leurs détails.
- `report.md` est un résumé lisible.
- `report.csv` peut être ouvert dans un tableur.
- `index.html` présente les résultats dans un navigateur.

Une mesure peut être :

- **Mesurée** : l'outil a compté quelque chose dans le code.
- **Estimée** : l'outil n'a vu qu'une partie des indices.
- **Indisponible** : il n'a pas assez d'informations fiables.

Un nombre d'attributs ARIA n'est pas une preuve de conformité RGAA. Un nombre de tests ne dit pas si ces tests ont réussi.

## Quel outil choisir ?

La **CLI** expliquée ici est le choix conseillé pour lire les mesures, les preuves et les diagnostics.

Le dépôt contient aussi [`scripts/component-complexity.mjs`](scripts/component-complexity.mjs), un script séparé qui fabrique un classement pondéré et peut estimer une charge à partir d'exemples choisis (« ancres »). Ses formules, ses résultats et ses fichiers ne sont pas ceux de la CLI. Utilisez ces estimations avec prudence ; elles ne sont pas validées sur vos projets.

Pour voir les options de ce script séparé :

```powershell
node scripts/component-complexity.mjs --help
```

Avec des ancres et le détail des dépendances communes :

```powershell
node scripts/component-complexity.mjs --src "D:\toto" --out "D:\Rapports\toto-estimation.json" --effort "Button:1,Tabs:2,Combobox:6" --dependency-estimates
```

Cette option ajoute, dans le JSON et les vues Markdown/CSV :

- le coût propre de chaque composant ;
- le coût de ses dépendances transitives partagées ;
- le total indépendant par composant ;
- le coût unique dédupliqué du projet ;
- les composants partageant chaque unité commune.

## Besoin d'aide ?

- [Guide pas à pas](docs/user-guide.md) : installation, configuration, rapports et erreurs fréquentes.
- [Architecture en mots simples et détails techniques](docs/architecture/implementation.md).
- [Spécification V4 et décisions validées](docs/design/specification-v4.md).
- [Décision sur les scores](docs/decisions/ADR-001-scoring.md).
- [Validation locale](docs/validation.md) : tests et mesures effectués sur des exemples synthétiques.
- [Revue du dépôt](docs/reviews/repository-review-2026-10-20.md) : compte rendu technique daté.
- [Exemple de configuration](examples/analyzer.config.json).

Les cinq documents originaux de `docs/specifications/` sont conservés sans modification. Leurs propositions de scores ne sont pas toutes les mêmes ; l'outil principal ne calcule donc pas de score global.

## Pour les personnes qui développent l'outil

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
```

`npm.cmd test` compile l'outil et lance ses tests. Autres commandes : `npm.cmd run test:coverage`, `npm.cmd run docs`, `npm.cmd run schemas` et `npm.cmd run benchmark`.
