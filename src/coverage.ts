import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AnalysisReport, Metric } from './models.js';
import { validateReport } from './models.js';
import { canonical, contains } from './filesystem.js';
import { aggregate } from './aggregation.js';

const counts = z
  .object({ covered: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
  .strict()
  .refine((c) => c.covered <= c.total, 'Couverture supérieure au total');
/** Format de couverture préexistant, lié aux octets exacts des sources. */
export const coverageSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    producer: z.string().min(1),
    files: z.array(
      z
        .object({
          libraryId: z.string(),
          relativePath: z.string(),
          sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
          lines: counts,
          branches: counts,
        })
        .strict(),
    ),
  })
  .strict();

/** Importe des résultats existants après vérification des chemins et empreintes.
 * @param report Rapport à enrichir.
 * @param filename Rapport de couverture au format versionné de l'outil.
 * @returns Rapport enrichi et validé ; aucune exécution de tests.
 * @throws Si les sources ne correspondent pas aux empreintes annoncées.
 * @example await importCoverage(report, 'coverage-bundle.json')
 */
export async function importCoverage(
  report: AnalysisReport,
  filename: string,
): Promise<AnalysisReport> {
  const bundle = coverageSchema.parse(JSON.parse(await readFile(filename, 'utf8')) as unknown);
  const result = structuredClone(report);
  const ids = new Set<string>();
  for (const entry of bundle.files) {
    const id = `${entry.libraryId}:${entry.relativePath}`;
    if (ids.has(id)) throw new Error(`Couverture dupliquée : ${id}`);
    ids.add(id);
    const unit = result.units.find((u) => u.id === id && u.kind === 'production');
    const library = result.libraries.find((l) => l.id === entry.libraryId);
    if (!unit || !library) throw new Error(`Source de couverture inconnue : ${id}`);
    const file = await canonical(path.resolve(library.root, entry.relativePath));
    if (!contains(await canonical(library.root), file))
      throw new Error('Source de couverture hors racine');
    const digest = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    if (digest.toLowerCase() !== entry.sha256.toLowerCase())
      throw new Error(`Empreinte de couverture différente : ${id}`);
    for (const [name, value] of Object.entries({
      linesCovered: entry.lines.covered,
      linesTotal: entry.lines.total,
      branchesCovered: entry.branches.covered,
      branchesTotal: entry.branches.total,
    })) {
      unit.metrics.push({
        id: `coverage.${name}`,
        subjectId: unit.id,
        scope: unit.ownerComponentId ? 'own' : 'shared',
        algorithmVersion: 'coverage-bundle-1',
        unit: 'count',
        observation: { status: 'measured', value },
        evidence: [
          {
            libraryId: unit.libraryId,
            relativePath: unit.relativePath,
            startLine: 1,
            endLine: 1,
            kind: 'imported-report',
          },
        ],
        diagnosticIds: [],
      });
    }
    unit.details.push({
      metricId: 'coverage.producer',
      value: bundle.producer,
      evidence: {
        libraryId: unit.libraryId,
        relativePath: unit.relativePath,
        startLine: 1,
        endLine: 1,
        kind: 'imported-report',
      },
    });
  }
  function coverageMetrics(
    subjectId: string,
    units: typeof result.units,
    scope: Metric['scope'],
  ): Metric[] {
    const metrics = aggregate(subjectId, units, scope);
    const production = units.filter((u) => u.kind === 'production');
    const covered = metrics.find((m) => m.id === 'coverage.linesCovered')?.observation.value;
    const total = metrics.find((m) => m.id === 'coverage.linesTotal')?.observation.value;
    const complete = production.length > 0 && production.every((u) => ids.has(u.id));
    const executed = metrics.find((m) => m.id === 'coverage.executed')!;
    executed.algorithmVersion = 'coverage-bundle-1';
    if (complete && covered !== undefined && covered !== null && total && total > 0) {
      executed.observation = { status: 'measured', value: covered / total };
      executed.evidence = metrics.find((m) => m.id === 'coverage.linesTotal')!.evidence;
    } else
      executed.observation = {
        status: 'unavailable',
        value: null,
        reason: 'Couverture importée incomplète ou total de lignes nul',
      };
    return metrics;
  }
  for (const component of result.components) {
    component.metrics = coverageMetrics(
      component.id,
      result.units.filter((u) => component.ownUnitIds.includes(u.id)),
      'own',
    );
    if (component.sharedUnitIds.length)
      component.metrics.push(
        ...coverageMetrics(
          component.id,
          result.units.filter((u) => component.sharedUnitIds.includes(u.id)),
          'exposure',
        ),
      );
  }
  for (const library of result.libraries)
    library.metrics = coverageMetrics(
      library.id,
      result.units.filter((u) => u.libraryId === library.id),
      'own',
    );
  result.algorithmVersions.coverage = 'coverage-bundle-1';
  return validateReport(result);
}
