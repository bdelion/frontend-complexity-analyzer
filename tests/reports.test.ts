import { beforeAll, describe, expect, test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { render, writeReports, readReport, escapeHtml } from '../src/reporting.js';
import { archiveReport, compareReports, listHistory } from '../src/comparison.js';
import { validateReport } from '../src/models.js';
import { graphSummary } from '../src/graph.js';
import { aggregate } from '../src/aggregation.js';
import { fragment, sample } from './helpers.js';

let data: Awaited<ReturnType<typeof sample>>;
beforeAll(async () => {
  data = await sample();
});

describe('rapports dérivés du JSON canonique', () => {
  test('JSON, Markdown, CSV et HTML contiennent les métriques et limites', async () => {
    const files = await writeReports(data.report, data.output, [
      'json',
      'md',
      'csv',
      'html',
      'json',
    ]);
    expect(files).toHaveLength(4);
    expect(await readReport(path.join(data.output, 'report.json'))).toEqual(data.report);
    for (const format of ['md', 'csv', 'html'] as const) {
      const text = render(data.report, format);
      expect(text).toContain('api.props');
      expect(text).toContain('coverage.executed');
    }
    expect(render(data.report, 'md')).toContain('Aucun diagnostic.');
  });
  test('échappe HTML, Markdown et formules CSV', () => {
    const report = structuredClone(data.report);
    report.libraries[0]!.id = '=HYPERLINK("evil")';
    report.components[0]!.id = '<script>alert(1)</script>|';
    report.diagnostics.push({
      id: 'x',
      code: '<danger>',
      severity: 'warning',
      message: 'a|b\n<script>',
      evidence: { libraryId: 'x', relativePath: 'a.ts', startLine: 1, endLine: 1, kind: 'syntax' },
    });
    expect(render(report, 'html')).not.toContain('<script>');
    expect(render(report, 'html')).toContain('&lt;script&gt;');
    expect(render(report, 'csv')).toContain("'=HYPERLINK");
    expect(render(report, 'md')).toContain('a\\|b');
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    const metric = report.components[0]!.metrics[0]!;
    metric.observation = { status: 'estimated', value: 2, rationale: 'partiel' };
    expect(render(report, 'csv')).toContain('partiel');
  });
  test('prévient le remplacement du JSON source ou une sortie dans la librairie', async () => {
    const input = path.join(data.output, 'report.json');
    await expect(writeReports(data.report, data.output, ['json'], [input])).rejects.toThrow(
      'recouvre',
    );
    await expect(
      writeReports(data.report, path.join(data.root, 'reports'), ['html']),
    ).rejects.toThrow('recouvre');
  });
});

describe('comparaison et historique', () => {
  test('deltas, ajouts et suppressions sans faux delta pour indisponibles', () => {
    const before = structuredClone(data.report);
    const after = structuredClone(data.report);
    after.runId = randomUUID();
    const added = structuredClone(after.components[0]!);
    added.id = 'added';
    after.components.push(added);
    const removed = structuredClone(before.components[0]!);
    removed.id = 'removed';
    before.components.push(removed);
    const metric = after.components[0]!.metrics.find((m) => m.id === 'api.props')!;
    metric.observation = { status: 'measured', value: 4 };
    const comparison = compareReports(before, after);
    expect(comparison.added).toEqual(['added']);
    expect(comparison.removed).toEqual(['removed']);
    expect(comparison.metrics.find((m) => m.metricId === 'api.props')?.delta).toBe(2);
    expect(comparison.metrics.find((m) => m.metricId === 'coverage.executed')?.delta).toBeNull();
    metric.algorithmVersion = 'new';
    expect(
      compareReports(before, after).metrics.find((m) => m.metricId === 'api.props')?.reason,
    ).toContain('Version');
    after.components[0]!.metrics.pop();
    expect(compareReports(before, after).metrics.some((m) => m.reason?.includes('supprimée'))).toBe(
      true,
    );
  });
  test('refuse des périmètres ou algorithmes différents', () => {
    const changed = structuredClone(data.report);
    changed.configurationFingerprint = 'different';
    expect(() => compareReports(data.report, changed)).toThrow('incompatibles');
    changed.configurationFingerprint = data.report.configurationFingerprint;
    changed.algorithmVersions.code = 'new';
    expect(() => compareReports(data.report, changed)).toThrow('incompatibles');
  });
  test('archives uniques, liste triée, archive corrompue signalée', async () => {
    const directory = path.join(data.base, 'history');
    const report = data.report;
    const first = await archiveReport(report, directory);
    expect(first).toContain(report.runId);
    await expect(archiveReport(report, directory)).rejects.toThrow();
    const next = structuredClone(report);
    next.runId = randomUUID();
    next.generatedAt = '2026-10-16T12:00:00.000Z';
    await archiveReport(next, directory);
    expect((await listHistory(directory)).map((r) => r.runId)).toEqual([report.runId, next.runId]);
    await writeFile(path.join(directory, 'broken.json'), '{}');
    await expect(listHistory(directory)).rejects.toThrow();
  });
});

describe('invariants et agrégations', () => {
  test('valide le rapport puis rejette doublons, références et compteurs incohérents', () => {
    expect(validateReport(data.report)).toEqual(data.report);
    const mutations = [
      (r: typeof data.report) => r.units.push(r.units[0]!),
      (r: typeof data.report) => r.components[0]!.ownUnitIds.push('missing'),
      (r: typeof data.report) => r.units[0]!.dependencies.push('missing'),
      (r: typeof data.report) => {
        r.units[0]!.ownerComponentId = 'missing';
      },
      (r: typeof data.report) => {
        r.units[0]!.libraryId = 'missing';
      },
      (r: typeof data.report) => r.components[0]!.metrics.push(r.components[0]!.metrics[0]!),
      (r: typeof data.report) => {
        r.components[0]!.metrics[0]!.subjectId = 'wrong';
      },
      (r: typeof data.report) => r.components[0]!.metrics[0]!.diagnosticIds.push('missing'),
      (r: typeof data.report) => {
        r.coverage.eligibleFiles++;
      },
      (r: typeof data.report) => {
        r.coverage.discoveredFiles++;
      },
      (r: typeof data.report) => {
        r.units[0]!.metrics[0]!.evidence = [];
      },
      (r: typeof data.report) => {
        r.units[0]!.metrics[0]!.observation = { status: 'measured', value: 0.5 };
      },
      (r: typeof data.report) => {
        r.units[0]!.metrics[0]!.evidence[0]!.endLine = 0;
      },
    ];
    for (const mutate of mutations) {
      const report = structuredClone(data.report);
      mutate(report);
      expect(() => validateReport(report)).toThrow();
    }
  });
  test('condense cycles et traite les chemins externes', () => {
    expect(
      graphSummary(
        new Map([
          ['a', ['b']],
          ['b', ['a', 'c', 'external']],
          ['c', []],
        ]),
      ),
    ).toEqual({ depth: 1, cycles: [['a', 'b']] });
    expect(graphSummary(new Map([['a', ['a']]]))).toEqual({ depth: 0, cycles: [['a']] });
    expect(graphSummary(new Map())).toEqual({ depth: 0, cycles: [] });
  });
  test('maxima neutres sans fonction, estimations, ensembles distincts et fichiers échoués', () => {
    const a = fragment('export const Button=()=> <button aria-label="a"/>').unit;
    const b = fragment('export const value = 1;').unit;
    b.id = 'ds:other.ts';
    const combined = aggregate('ds', [a, b], 'own');
    expect(combined.find((m) => m.id === 'code.cc.max')?.observation.value).toBe(1);
    expect(combined.find((m) => m.id === 'a11y.ariaNames')?.observation.value).toBe(1);
    const spread = fragment('export const Button=(p:any)=><button {...p} aria-label="x"/>').unit;
    expect(
      aggregate('ds', [spread], 'own').find((m) => m.id === 'a11y.ariaNames')?.observation.status,
    ).toBe('estimated');
    b.analysisStatus = 'failed';
    expect(
      aggregate('ds', [a, b], 'own').find((m) => m.id === 'api.props')?.observation.value,
    ).toBeNull();
  });
  test('JSON illisible rejeté', async () => {
    const file = path.join(data.base, 'bad.json');
    await writeFile(file, 'not json');
    await expect(readReport(file)).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('not json');
  });
});
