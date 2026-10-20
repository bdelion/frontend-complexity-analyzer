import type { Evidence, Metric, SourceUnit } from './models.js';
import { graphSummary } from './graph.js';

/** Agrège des unités uniques en respectant maxima, ratios et données absentes.
 * @param subjectId Composant ou librairie.
 * @param units Unités incluses une seule fois.
 * @param scope Portée des métriques produites.
 * @returns Profil de métriques agrégées.
 * @example aggregate('lib:Button', units, 'own')
 */
export function aggregate(
  subjectId: string,
  units: readonly SourceUnit[],
  scope: Metric['scope'],
): Metric[] {
  const result: Metric[] = [];
  const production = units.filter((u) => u.kind === 'production');
  const metrics = units.flatMap((u) =>
    u.metrics.filter(
      (m) => u.kind === 'production' || (!m.id.startsWith('code.') && !m.id.startsWith('graph.')),
    ),
  );
  const groups = new Map<string, Metric[]>();
  for (const metric of metrics) groups.set(metric.id, [...(groups.get(metric.id) ?? []), metric]);
  const fallback: Evidence[] = units.length
    ? units.slice(0, 1).map((u) => ({
        libraryId: u.libraryId,
        relativePath: u.relativePath,
        startLine: 1,
        endLine: 1,
        kind: 'inventory',
      }))
    : [
        {
          libraryId: subjectId.split(':')[0]!,
          relativePath: '.',
          startLine: 1,
          endLine: 1,
          kind: 'inventory',
        },
      ];
  function put(
    id: string,
    value: number | null,
    proofs: Evidence[],
    options: { unit?: Metric['unit']; reason?: string; estimated?: boolean; version?: string } = {},
  ): void {
    result.push({
      id,
      subjectId,
      scope,
      algorithmVersion: options.version ?? '1.0.0',
      unit: options.unit ?? 'count',
      observation:
        value === null
          ? {
              status: 'unavailable',
              value: null,
              reason: options.reason ?? 'Une unité requise n’est pas mesurable',
            }
          : options.estimated
            ? { status: 'estimated', value, rationale: 'Au moins une observation est estimée' }
            : { status: 'measured', value },
      evidence: proofs.length ? proofs : fallback,
      diagnosticIds: [],
    });
  }
  for (const [id, values] of groups) {
    if (
      [
        'tests.perProp',
        'tests.perLoc',
        'docs.publicDocumented',
        'coverage.executed',
        'graph.dependencies',
        'graph.externalDependencies',
        'graph.depth',
        'graph.cycles',
        'a11y.ariaNames',
        'keyboard.keys',
      ].includes(id)
    )
      continue;
    const failed = units.some(
      (u) => u.analysisStatus === 'failed' && (u.kind === 'production' || id.startsWith('tests.')),
    );
    const unavailable = values.some((m) => m.observation.value === null);
    const numbers = values.flatMap((m) =>
      m.observation.value === null ? [] : [m.observation.value],
    );
    const max = id === 'code.cc.max' || id === 'api.configDepth';
    // Une unité sans fonction ne rend pas le maximum des autres fonctions indisponible.
    const absentIsNeutral = id === 'code.cc.max' && numbers.length > 0;
    const value =
      failed || (unavailable && !absentIsNeutral)
        ? null
        : max
          ? Math.max(0, ...numbers)
          : numbers.reduce((a, b) => a + b, 0);
    put(
      id,
      value,
      values.flatMap((m) => m.evidence),
      {
        unit: values[0]!.unit,
        version: values[0]!.algorithmVersion,
        estimated: values.some((m) => m.observation.status === 'estimated'),
      },
    );
    result.at(-1)!.diagnosticIds = [...new Set(values.flatMap((m) => m.diagnosticIds))];
  }
  const metricValue = (id: string): number | null =>
    result.find((m) => m.id === id)?.observation.value ?? null;
  const proofs = production.flatMap(
    (u) => u.metrics.find((m) => m.id === 'code.files')?.evidence ?? [],
  );
  for (const id of ['a11y.ariaNames', 'keyboard.keys']) {
    const key = id === 'a11y.ariaNames' ? 'a11y.ariaOccurrences' : id;
    const details = production.flatMap((u) => u.details.filter((d) => d.metricId === key));
    put(
      id,
      production.some((u) => u.analysisStatus === 'failed')
        ? null
        : new Set(details.map((d) => d.value)).size,
      details.map((d) => d.evidence),
      {
        estimated: production.some(
          (u) => u.metrics.find((m) => m.id === id)?.observation.status === 'estimated',
        ),
      },
    );
  }
  const dependencies = new Set(production.flatMap((u) => u.dependencies));
  const graphIncomplete = production.some(
    (u) =>
      u.analysisStatus === 'failed' ||
      u.metrics.find((m) => m.id === 'graph.dependencies')?.observation.status === 'estimated',
  );
  put('graph.dependencies', dependencies.size, proofs, { estimated: graphIncomplete });
  put(
    'graph.externalDependencies',
    new Set(production.flatMap((u) => u.externalDependencies)).size,
    proofs,
    { estimated: graphIncomplete },
  );
  const graph = graphSummary(new Map(production.map((u) => [u.id, u.dependencies])));
  put('graph.depth', graph.depth, proofs, { unit: 'depth', estimated: graphIncomplete });
  put('graph.cycles', graph.cycles.length, proofs, { estimated: graphIncomplete });
  for (const id of [
    'files',
    'declarations',
    'disabled',
    'focused',
    'suites',
    'assertions',
    'snapshots',
  ])
    if (!groups.has(`tests.${id}`))
      put(
        `tests.${id}`,
        units.some((u) => u.kind === 'test' && u.analysisStatus === 'failed') ? null : 0,
        proofs,
      );
  for (const [id, denominator] of [
    ['tests.perProp', 'api.props'],
    ['tests.perLoc', 'code.loc'],
    ['docs.publicDocumented', 'api.exports'],
  ] as const) {
    const numeratorId = id.startsWith('tests.') ? 'tests.declarations' : 'docs.documentedExports';
    const numerator = metricValue(numeratorId);
    const divisor = metricValue(denominator);
    put(
      id,
      numerator !== null && divisor !== null && divisor > 0 ? numerator / divisor : null,
      proofs,
      {
        unit: 'ratio',
        version: 'ratios-1.1.0',
        reason: 'Numérateur indisponible ou dénominateur nul/indisponible',
        estimated: result.some(
          (m) =>
            (m.id === numeratorId || m.id === denominator) && m.observation.status === 'estimated',
        ),
      },
    );
  }
  put('coverage.executed', null, [], {
    unit: 'ratio',
    reason: 'Couverture exécutée non importée ; le comptage de tests ne la mesure pas',
  });
  return result.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
