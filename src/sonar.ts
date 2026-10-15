import path from 'node:path';
import type { AnalysisReport } from './models.js';
import { canonical, contains, portable } from './filesystem.js';

/** Construit les Generic Issues au format récent, sans publier sur un serveur.
 * @param report Rapport canonique.
 * @param projectBase Répertoire projet correspondant à sonar.projectBaseDir.
 * @returns Règles et diagnostics localisés ; aucun score ni mesure personnalisée inventés.
 * @throws Si un fichier est situé hors du projet Sonar.
 * @example await sonarIssues(report, 'D:/Git/design-system')
 */
export async function sonarIssues(report: AnalysisReport, projectBase: string) {
  const base = await canonical(projectBase);
  const diagnostics = report.diagnostics.filter((d) => d.evidence && d.severity !== 'info');
  const codes = [...new Set(diagnostics.map((d) => d.code))].sort();
  const rules = codes.map((code) => ({
    id: code,
    name: code,
    description:
      'Limite ou erreur de l’analyse statique ; ne constitue pas un défaut fonctionnel prouvé.',
    engineId: 'frontend-complexity-analyzer',
    cleanCodeAttribute: 'CLEAR',
    type: 'CODE_SMELL',
    severity: 'INFO',
    impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'INFO' }],
  }));
  const issues = [];
  for (const diagnostic of diagnostics) {
    const evidence = diagnostic.evidence!;
    const library = report.libraries.find((l) => l.id === evidence.libraryId);
    if (!library) throw new Error(`Librairie inconnue dans la preuve : ${evidence.libraryId}`);
    const file = await canonical(path.resolve(library.root, evidence.relativePath));
    if (!contains(base, file))
      throw new Error(`Source hors sonar.projectBaseDir : ${evidence.relativePath}`);
    issues.push({
      ruleId: diagnostic.code,
      primaryLocation: {
        message: diagnostic.message,
        filePath: portable(path.relative(base, file)),
        textRange: { startLine: evidence.startLine, endLine: evidence.endLine },
      },
    });
  }
  return { rules, issues };
}
