import { beforeAll, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importCoverage } from '../src/coverage.js';
import { sonarIssues } from '../src/sonar.js';
import { runCli } from '../src/cli.js';
import { sample, fragment } from './helpers.js';
import { componentExports } from '../src/ast.js';
let data: Awaited<ReturnType<typeof sample>>;
beforeAll(async () => {
  data = await sample();
});

test('importe seulement une couverture correspondant aux octets des sources', async () => {
  const unit = data.report.units.find((u) => u.kind === 'production')!;
  const file = path.join(data.base, 'coverage-bundle.json');
  const entry = {
    libraryId: unit.libraryId,
    relativePath: unit.relativePath,
    sha256: createHash('sha256')
      .update(await readFile(path.join(data.root, unit.relativePath)))
      .digest('hex'),
    lines: { covered: 8, total: 10 },
    branches: { covered: 2, total: 4 },
  };
  const bundle = { schemaVersion: '1.0.0', producer: 'fixture Jest', files: [entry] };
  await writeFile(file, JSON.stringify(bundle));
  const report = await importCoverage(data.report, file);
  expect(
    report.components[0]!.metrics.find((m) => m.id === 'coverage.executed')?.observation.value,
  ).toBe(0.8);
  expect(report.algorithmVersions.coverage).toBe('coverage-bundle-1');
  expect(data.report.algorithmVersions.coverage).toBeUndefined();
  expect(
    await runCli(
      [
        'analyze',
        '--root',
        data.root,
        '--output',
        path.join(data.base, 'imported'),
        '--coverage',
        file,
      ],
      { out: () => {}, err: () => {} },
    ),
  ).toBe(0);
  for (const files of [
    [entry, entry],
    [{ ...entry, sha256: '0'.repeat(64) }],
    [{ ...entry, relativePath: '../secret.ts' }],
    [{ ...entry, lines: { covered: 11, total: 10 } }],
  ]) {
    await writeFile(file, JSON.stringify({ ...bundle, files }));
    await expect(importCoverage(data.report, file)).rejects.toThrow();
  }
  await writeFile(file, JSON.stringify({ ...bundle, files: [] }));
  const missing = await importCoverage(data.report, file);
  expect(
    missing.components[0]!.metrics.find((m) => m.id === 'coverage.executed')?.observation.status,
  ).toBe('unavailable');
});

test('export Sonar récent, localisé, sans effort inventé ni publication', async () => {
  const report = structuredClone(data.report);
  const unit = report.units[0]!;
  report.diagnostics.push({
    id: 'manual',
    code: 'REVIEW',
    message: 'Revoir manuellement',
    severity: 'warning',
    evidence: {
      libraryId: unit.libraryId,
      relativePath: unit.relativePath,
      startLine: 1,
      endLine: 2,
      kind: 'syntax',
    },
  });
  const result = await sonarIssues(report, data.root);
  expect(result.rules[0]?.engineId).toBe('frontend-complexity-analyzer');
  expect(result.issues[0]?.primaryLocation.filePath).toBe(unit.relativePath);
  expect(result.issues[0]).not.toHaveProperty('effortMinutes');
  await expect(sonarIssues(report, data.output)).rejects.toThrow('hors');
  const bad = structuredClone(report);
  bad.diagnostics[0]!.evidence!.libraryId = 'absent';
  await expect(sonarIssues(bad, data.root)).rejects.toThrow('inconnue');
  const input = path.join(data.base, 'sonar-input.json');
  const output = path.join(data.base, 'sonar.json');
  await writeFile(input, JSON.stringify(report));
  expect(
    await runCli(['sonar', input, '--project-base', data.root, '-o', output], {
      out: () => {},
      err: () => {},
    }),
  ).toBe(0);
  expect(JSON.parse(await readFile(output, 'utf8')).issues).toHaveLength(1);
});

test('composants memo référençant une fonction locale, sans dédoublement de rendu', () => {
  const f = fragment(
    `import {memo} from 'react'; function Inner(p:{label:string}){return <button/>} export const Button=memo(Inner);`,
  );
  expect(componentExports(f.source).map((e) => e.name)).toEqual(['Button']);
  expect(f.value('api.props')).toBe(1);
});
