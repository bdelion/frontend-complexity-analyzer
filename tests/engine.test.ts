import { describe, expect, test } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyze } from '../src/engine.js';
import { loadConfiguration } from '../src/configuration.js';
import { fixture, sample } from './helpers.js';

describe('pipeline lecture seule', () => {
  test('rapport complet, métriques vérifiables et déterminisme', async () => {
    const { report, config, root } = await sample();
    expect(report.status).toBe('complete');
    expect(report.components).toHaveLength(1);
    const component = report.components[0]!;
    const own = (id: string) =>
      component.metrics.find((m) => m.id === id && m.scope === 'own')?.observation.value;
    expect(own('api.props')).toBe(2);
    expect(own('tests.declarations')).toBe(1);
    expect(own('tests.perProp')).toBe(0.5);
    expect(own('react.useState')).toBe(1);
    expect(own('keyboard.keys')).toBe(1);
    const file = path.join(root, 'Button/Button.tsx');
    const hash = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    const again = await analyze(config);
    expect(
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    ).toBe(hash);
    expect(again.components).toEqual(report.components);
    expect(again.units).toEqual(report.units);
    expect(again.runId).not.toBe(report.runId);
  });
  test('code partagé et cycle : une mesure par unité, exposition séparée', async () => {
    const { root, output } = await fixture({
      'A/A.tsx': `import { useShared } from '../shared/a'; export function A(){useShared();return <div aria-label="x"/>}`,
      'B/B.tsx': `import { useShared } from '../shared/a'; export const B=()=>{useShared();return <div aria-label="x"/>}`,
      'shared/a.ts': `import { b } from './b'; export function useShared(){ if(b) return 1; return 0 }`,
      'shared/b.ts': `import { useShared } from './a'; export const b=useShared;`,
      'index.ts': `export { A } from './A/A'; export { B } from './B/B';`,
      'shared/multi.test.ts': `import {A} from '../A/A'; import {B} from '../B/B'; import {test} from 'vitest'; test('shared',()=>{});`,
    });
    const config = await loadConfiguration({ root: [root], output });
    const report = await analyze(config);
    expect(report.components).toHaveLength(2);
    expect(report.units.filter((u) => u.relativePath === 'shared/a.ts')).toHaveLength(1);
    expect(
      report.components.every((c) => c.sharedUnitIds.some((id) => id.endsWith('shared/a.ts'))),
    ).toBe(true);
    expect(
      report.libraries[0]!.metrics.find((m) => m.id === 'graph.cycles')?.observation.value,
    ).toBe(1);
    expect(
      report.libraries[0]!.metrics.find((m) => m.id === 'tests.declarations')?.observation.value,
    ).toBe(1);
    expect(
      report.units.find((u) => u.relativePath === 'shared/multi.test.ts')?.ownerComponentId,
    ).toBeNull();
    expect(
      report.units
        .find((u) => u.relativePath === 'shared/multi.test.ts')
        ?.metrics.every((m) => m.scope === 'shared'),
    ).toBe(true);
    const filtered = await analyze(config, 'A');
    expect(filtered.components).toHaveLength(1);
    expect(filtered.units.some((u) => u.relativePath === 'B/B.tsx')).toBe(true);
    await expect(analyze(config, 'missing')).rejects.toThrow('absent ou ambigu');
  });
  test('plusieurs librairies avec noms identiques et filtre ambigu', async () => {
    const first = await fixture({ 'Button/Button.tsx': 'export const Button=()=> <button/>' });
    const second = await fixture({ 'Button/Button.tsx': 'export function Button(){return null}' });
    const file = path.join(first.base, 'config.json');
    await writeFile(
      file,
      JSON.stringify({
        libraries: [
          { id: 'first', root: first.root },
          { id: 'second', root: second.root },
        ],
        outputDirectory: first.output,
      }),
    );
    const config = await loadConfiguration({ config: file });
    expect((await analyze(config)).components.map((c) => c.id)).toEqual([
      'first:Button',
      'second:Button',
    ]);
    await expect(analyze(config, 'Button')).rejects.toThrow('ambigu');
    expect((await analyze(config, 'first:Button')).components).toHaveLength(1);
  });
  test('diagnostics de parsing, imports, JSX et candidats non attribués', async () => {
    const { root, output } = await fixture({
      'Button/Button.tsx': `import {missing} from './missing'; export const Button=(p:any)=><button {...p} role={p.role}/>; import('./lazy');`,
      'Broken/Broken.tsx': 'export const Broken = ( => <div/>;',
      'Broken/Broken.test.ts': 'test(',
      'Other/Other.tsx': 'const Local=()=> <div/>;',
      'stories/Button.stories.tsx': `export default {}; export const Primary={};`,
    });
    const report = await analyze(await loadConfiguration({ root: [root], output }));
    expect(report.status).toBe('partial');
    expect(report.coverage.failedFiles).toBe(2);
    expect(report.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        'PARSE_ERROR',
        'IMPORT_UNRESOLVED',
        'DYNAMIC_IMPORT',
        'API_UNRESOLVED',
        'DYNAMIC_A11Y',
        'JSX_SPREAD',
        'COMPONENT_UNASSIGNED',
      ]),
    );
    expect(report.coverage.unresolvedCandidateIds).toHaveLength(2);
    expect(
      report.units.find((u) => u.kind === 'story')!.metrics.find((m) => m.id === 'stories.exports')
        ?.observation.value,
    ).toBe(1);
  });
  test('tsconfig, alias, imports de type, overrides et motifs de tests', async () => {
    const { base, root, output } = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['shared/*'] }, strict: true },
      }),
      'A/A.tsx': `import type {P} from '@shared/props'; export const A=(p:P)=><div/>`,
      'shared/props.ts': 'export interface P { label:string }',
      'A/check.ts': `test('a',()=>{});`,
    });
    const file = path.join(base, 'config.json');
    await writeFile(
      file,
      JSON.stringify({
        libraries: [{ id: 'ds', root, tsconfig: 'tsconfig.json' }],
        outputDirectory: output,
        testPatterns: { jest: ['**/check.ts'] },
        ownershipOverrides: { 'ds:shared/props.ts': 'A' },
      }),
    );
    const report = await analyze(await loadConfiguration({ config: file }));
    expect(report.units.find((u) => u.relativePath === 'A/A.tsx')?.typeDependencies).toEqual([
      'ds:shared/props.ts',
    ]);
    expect(report.units.find((u) => u.relativePath === 'shared/props.ts')?.ownerComponentId).toBe(
      'ds:A',
    );
    expect(report.status).toBe('complete');
    await writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['shared/*'] }, strict: false },
      }),
    );
    const changed = await analyze(await loadConfiguration({ config: file }));
    expect(changed.configurationFingerprint).not.toBe(report.configurationFingerprint);
    const content = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    content.ownershipOverrides = { 'ds:shared/props.ts': 'Missing' };
    await writeFile(file, JSON.stringify(content));
    await expect(analyze(await loadConfiguration({ config: file }))).rejects.toThrow(
      'Propriétaire',
    );
  });
  test('racine vide : métriques honnêtes et aucune exécution de package', async () => {
    const { root, output } = await fixture({
      'package.json': JSON.stringify({ scripts: { test: 'throw new Error("jamais")' } }),
    });
    const report = await analyze(await loadConfiguration({ root: [root], output }));
    expect(report.status).toBe('complete');
    expect(report.units).toEqual([]);
    expect(report.coverage.eligibleFiles).toBe(0);
  });
  test('déclarations locales lues sans être mesurées et alias irrésolus diagnostiqués', async () => {
    const { root, output } = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@local/*': ['shared/*'] } },
      }),
      'types.d.ts': 'export interface P {label:string}',
      'Button/Button.tsx': `import type {P} from '../types'; import {missing} from '@local/missing'; export function Button(p:P){return <button/>}`,
    });
    const report = await analyze(await loadConfiguration({ root: [root], output }));
    expect(report.units).toHaveLength(1);
    expect(report.diagnostics.filter((d) => d.code === 'IMPORT_UNRESOLVED')).toHaveLength(1);
    expect(report.units[0]!.details.some((d) => d.metricId === 'graph.typeDeclarations')).toBe(
      true,
    );
    expect(
      report.components[0]!.metrics.find((m) => m.id === 'graph.dependencies')?.observation.status,
    ).toBe('estimated');
  });
});
