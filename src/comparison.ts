import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { AnalysisReport, Metric } from './models.js';
import { readReport } from './reporting.js';
import { writeSafe } from './filesystem.js';

/** Variation comparable ou explicitement indisponible. */
export interface MetricDelta {
  componentId: string;
  metricId: string;
  scope: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  reason: string | null;
}
/** Comparaison de deux périmètres compatibles. */
export interface Comparison {
  schemaVersion: '1.0.0';
  baselineRunId: string;
  currentRunId: string;
  added: string[];
  removed: string[];
  metrics: MetricDelta[];
}

/** Compare seulement des rapports de même périmètre et versions d'algorithmes.
 * @param baseline Rapport antérieur.
 * @param current Rapport courant.
 * @returns Ajouts, suppressions et deltas justifiés.
 * @throws Si les rapports sont incompatibles.
 * @example compareReports(oldReport, newReport)
 */
export function compareReports(baseline: AnalysisReport, current: AnalysisReport): Comparison {
  if (
    baseline.schemaVersion !== current.schemaVersion ||
    baseline.configurationFingerprint !== current.configurationFingerprint ||
    JSON.stringify(Object.entries(baseline.algorithmVersions).sort()) !==
      JSON.stringify(Object.entries(current.algorithmVersions).sort())
  ) {
    throw new Error('Rapports incompatibles : schéma, périmètre ou algorithmes différents');
  }
  const old = new Map(baseline.components.map((c) => [c.id, c]));
  const now = new Map(current.components.map((c) => [c.id, c]));
  const result: Comparison = {
    schemaVersion: '1.0.0',
    baselineRunId: baseline.runId,
    currentRunId: current.runId,
    added: [...now.keys()].filter((id) => !old.has(id)).sort(),
    removed: [...old.keys()].filter((id) => !now.has(id)).sort(),
    metrics: [],
  };
  const key = (m: Metric) => `${m.id}:${m.scope}`;
  for (const component of current.components) {
    const prior = old.get(component.id);
    if (!prior) continue;
    const before = new Map(prior.metrics.map((m) => [key(m), m]));
    const after = new Map(component.metrics.map((m) => [key(m), m]));
    for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const a = before.get(id);
      const b = after.get(id);
      const reference = b ?? a!;
      const reason =
        !a || !b
          ? 'Métrique ajoutée ou supprimée'
          : a.algorithmVersion !== b.algorithmVersion
            ? 'Version d’algorithme différente'
            : a.observation.status !== 'measured' || b.observation.status !== 'measured'
              ? 'Mesure estimée ou indisponible'
              : null;
      result.metrics.push({
        componentId: component.id,
        metricId: reference.id,
        scope: reference.scope,
        before: a?.observation.value ?? null,
        after: b?.observation.value ?? null,
        delta: reason === null ? b!.observation.value! - a!.observation.value! : null,
        reason,
      });
    }
  }
  return result;
}

/** Archive un rapport dans un fichier unique, sans remplacement.
 * @param report Rapport à archiver.
 * @param directory Répertoire d'historique hors des entrées.
 * @returns Chemin créé.
 * @throws Si l'archive existe déjà ou si la destination est protégée.
 * @example await archiveReport(report, './history')
 */
export async function archiveReport(report: AnalysisReport, directory: string): Promise<string> {
  const filename = path.join(directory, `${report.generatedAt.slice(0, 10)}-${report.runId}.json`);
  await writeSafe(
    filename,
    JSON.stringify(report, null, 2) + '\n',
    report.libraries.map((l) => l.root),
    true,
  );
  return filename;
}

/** Liste les archives validées par date, sans exécuter les projets référencés.
 * @param directory Répertoire d'historique.
 * @returns Résumé des exécutions.
 * @throws Si une archive JSON est invalide.
 * @example await listHistory('./history')
 */
export async function listHistory(
  directory: string,
): Promise<
  { file: string; runId: string; generatedAt: string; status: string; components: number }[]
> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const result = [];
  for (const name of names) {
    const report = await readReport(path.join(directory, name));
    result.push({
      file: name,
      runId: report.runId,
      generatedAt: report.generatedAt,
      status: report.status,
      components: report.components.length,
    });
  }
  return result.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}
