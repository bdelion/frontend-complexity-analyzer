# Frontend Complexity Analyzer

CLI locale Node.js/TypeScript d'analyse statique des composants React/TypeScript d'un Design System. Les librairies inspectées restent en lecture seule ; leurs scripts et tests ne sont jamais exécutés.

L'outil produit des métriques brutes et leurs preuves fichier/ligne, réparties en trois profils : complexité intrinsèque, signaux d'accessibilité et risque de maintenance. Il ne calcule pas de score non calibré, de conformité RGAA ou de charge en jours.

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

Les commandes `analyzer` et `rcca` sont déclarées comme binaires du package ; l'appel `node dist/cli.js` fonctionne directement sans installation globale.

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

## Qualité et documentation

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
