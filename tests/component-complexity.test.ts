import { describe, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { link, mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers.js';

interface ScriptRow {
  id: string;
  component: string;
  index: number | null;
  indexStatus: string;
  percentile: number | null;
  estimatedDays: number;
  details: {
    files: number;
    propsCount: number | null;
    hooks: number;
    fanOut: number;
    fanIn: number;
    sharedDeps: number;
    dependencies: string[];
    typeDependencies: string[];
    paths: string[];
    observations: Record<
      string,
      { status: string; value: number | null; evidence: { path: string; startLine: number }[] }
    >;
  };
}
interface ScriptReport {
  schemaVersion: string;
  diagnostics: { code: string }[];
  ranking: ScriptRow[];
  effort: {
    model: string;
    totalDays: number;
    anchors: Record<string, { days: number; estimated: number }>;
    crossValidation?: { mae: number };
    lotEstimate?: { totalDays: number; savingDays: number };
  };
}
const script = path.resolve('scripts/component-complexity.mjs');
const simple = {
  'components/basic/Button/Button.tsx': 'export function Button(){return <button/>}',
};

/** Exécute le script autonome sur un corpus isolé, sans importer son implémentation. */
function run(root: string, output: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [script, '--src', root, '--out', output, ...args], {
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stderr: result.stderr,
    report:
      result.status === 0 && existsSync(output)
        ? (JSON.parse(readFileSync(output, 'utf8')) as ScriptReport)
        : undefined,
  };
}

describe('script autonome : unités, métriques et graphe', () => {
  test('S02/S03/S08 : identités distinctes, frontière stable, exports par défaut et singleton', async () => {
    const f = await fixture({
      ...simple,
      'components/other/Button/index.tsx': 'export default () => <button/>',
      'components/basic/Button/helpers/nested.ts': 'export const value=1;',
      'hooks/useFocus.ts': 'export function useFocus(){return 1}',
      'internal/useFocus.ts': 'export function useFocus(){return 2}',
    });
    const result = run(f.root, path.join(f.base, 'nested', 'result.json'));
    expect(result.status, result.stderr).toBe(0);
    const rows = result.report!.ranking;
    expect(rows.map((r) => r.id).sort()).toEqual([
      'components/basic/Button',
      'components/other/Button',
      'hooks/useFocus.ts',
      'internal/useFocus.ts',
    ]);
    expect(rows.find((r) => r.id === 'components/basic/Button')!.details.files).toBe(2);
    expect(rows.find((r) => r.id === 'components/other/Button')!.details.files).toBe(1);
    expect(existsSync(path.join(f.base, 'nested', 'result.md'))).toBe(true);
    expect(existsSync(path.join(f.base, 'nested', 'result.csv'))).toBe(true);
    expect(result.report!.schemaVersion).toBe('2.0.0');
    const one = await fixture(simple);
    expect(run(one.root, path.join(one.base, 'one.json')).report!.ranking[0]!.percentile).toBe(0);
  });

  test('S03/S04 : barrels cycliques, dossiers, alias, fan-in partagé et imports de types', async () => {
    const f = await fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@hooks/*': ['hooks/*'] } },
      }),
      'components/basic/A/A.tsx':
        "import {B} from '../../other/B'; import {useFocus} from '@hooks/index'; import type {P} from '../../../types/P'; export function A(){useFocus();return <B/>}",
      'components/other/B/index.ts': "export {B} from './B';",
      'components/other/B/B.tsx': 'export function B(){return <button/>}',
      'hooks/index.ts': "export {useFocus} from './useFocus'; export * from './cycle';",
      'hooks/cycle.ts': "export * from './index';",
      'hooks/useFocus.ts': 'export function useFocus(){return 1}',
      'types/P.ts': 'export interface P { label:string }',
    });
    const result = run(f.root, path.join(f.base, 'result.json'));
    expect(result.status, result.stderr).toBe(0);
    const a = result.report!.ranking.find((r) => r.component === 'A')!;
    expect(a.details.dependencies).toEqual(['components/other/B', 'hooks/useFocus.ts']);
    expect(a.details.typeDependencies).toEqual(['types']);
    expect(a.details.sharedDeps).toBe(1);
    expect(result.report!.ranking.find((r) => r.id === 'hooks/useFocus.ts')!.details.fanIn).toBe(1);
    expect(result.report!.ranking.find((r) => r.component === 'B')!.details.fanIn).toBe(1);
    expect(result.report!.ranking.some((r) => r.id.endsWith('index.ts'))).toBe(false);
  });

  test('S09 : props importées/composées, auxiliaires, stories, alias React et preuves', async () => {
    const f = await fixture({
      'components/basic/Button/Button.tsx': `import {useState as state} from 'react';
import type {Base} from '../../../types/Base';
interface Extended extends Base { description:string }
type Props=(Extended & { extra?:boolean }) | { label:string; other:number };
function helper({ignored}:{ignored:string}){return ignored}
interface UnusedConfig { unrelated:string }
export function Button({label,...rest}:Props){state(0); return <button {...rest}>{label}</button>}`,
      'components/basic/Button/Button.stories.tsx':
        'export const Story=()=> <button aria-label="story"/>',
      'components/basic/Button/Button.test.tsx': 'invalid syntax !!!',
      'types/Base.ts': 'export interface Base {label:string}',
      'internal/local.ts': 'function useState(){return 1}; export const value=useState();',
    });
    const result = run(f.root, path.join(f.base, 'result.json'));
    expect(result.status, result.stderr).toBe(0);
    const button = result.report!.ranking.find((r) => r.component === 'Button')!;
    expect(button.details.propsCount).toBe(4);
    expect(button.details.hooks).toBe(1);
    expect(button.details.files).toBe(1);
    expect(button.details.observations.propsCount!.status).toBe('measured');
    expect(button.details.observations.ariaCount!.status).toBe('estimated');
    expect(button.details.observations.propsCount!.evidence[0]!.startLine).toBeGreaterThan(0);
    expect(result.report!.ranking.find((r) => r.id === 'internal/local.ts')!.details.hooks).toBe(0);
    expect(result.report!.diagnostics.some((d) => d.code === 'JSX_SPREAD')).toBe(true);
  });

  test('S09 : props non résolues estimées ou indisponibles sans faux zéro', async () => {
    const f = await fixture({
      'components/basic/A/A.tsx': 'export function A({a,...rest}:any){return <button/>}',
      'components/basic/B/B.tsx': 'export function B(p:Missing){return <button/>}',
    });
    const result = run(f.root, path.join(f.base, 'result.json'));
    expect(result.status, result.stderr).toBe(0);
    expect(
      result.report!.ranking.find((r) => r.component === 'A')!.details.observations.propsCount,
    ).toMatchObject({ value: 1, status: 'estimated' });
    expect(result.report!.ranking.find((r) => r.component === 'B')).toMatchObject({
      index: null,
      indexStatus: 'unavailable',
      details: { propsCount: null },
    });
    const effort = run(f.root, path.join(f.base, 'effort.json'), ['--effort', 'A:1']);
    expect(effort.status).toBe(1);
    expect(effort.stderr).toContain('indisponibles');
  });

  test('S04 : un import manquant derrière un barrel dégrade le graphe', async () => {
    const f = await fixture({
      ...simple,
      'components/basic/Button/Button.tsx':
        "import {x} from '../../../hooks'; export function Button(){return <button/>}",
      'hooks/index.ts': "export {x} from './missing';",
    });
    const result = run(f.root, path.join(f.base, 'result.json'));
    expect(result.status, result.stderr).toBe(0);
    expect(result.report!.diagnostics.some((d) => d.code === 'IMPORT_UNRESOLVED')).toBe(true);
    expect(result.report!.ranking[0]!.details.observations.fanOut!.status).toBe('estimated');
  });
  test('S09 : dossiers générés exclus et erreur de parsing explicite sans résultat trompeur', async () => {
    const f = await fixture({
      ...simple,
      'node_modules/invalid.ts': 'invalid !!!',
      'dist/invalid.ts': 'invalid !!!',
      'coverage/invalid.ts': 'invalid !!!',
      'assets/invalid.ts': 'invalid !!!',
    });
    const result = run(f.root, path.join(f.base, 'valid.json'));
    expect(result.status, result.stderr).toBe(0);
    expect(result.report!.ranking).toHaveLength(1);
    await writeFile(path.join(f.root, 'broken.ts'), 'export const = ;');
    const invalid = run(f.root, path.join(f.base, 'invalid.json'));
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('non parsable');
    expect(existsSync(path.join(f.base, 'invalid.json'))).toBe(false);
  });
});

describe('script autonome : calibration et arguments', () => {
  const corpus = {
    'components/basic/A/A.tsx': 'export function A(){return <button/>}',
    'components/basic/B/B.tsx': 'export function B(){return <button/>}',
    'components/basic/C/C.tsx':
      'export function C(){if(true)return <button aria-label="x"/>;return <button/>}',
  };
  test('S01 : le lot réutilise les jours individuels et ne facture pas les ancres deux fois', async () => {
    const f = await fixture(corpus);
    const result = run(f.root, path.join(f.base, 'result.json'), [
      '--effort',
      'A:1,C:3',
      '--overhead',
      '10',
      '--lot-rate',
      '0.5',
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.report!.effort.totalDays).toBe(15);
    expect(result.report!.effort.lotEstimate).toMatchObject({ totalDays: 14.5, savingDays: 0.5 });
    expect(result.report!.effort.anchors.A).toMatchObject({ days: 1, estimated: 1 });
  });
  test('S06/S07 : constante, fichier JSON et désactivation du lot', async () => {
    const f = await fixture(corpus);
    const anchors = path.join(f.base, 'ancres.json');
    await writeFile(anchors, JSON.stringify({ A: 2 }));
    const result = run(f.root, path.join(f.base, 'result.json'), [
      '--effort',
      anchors,
      '--lot-rate',
      '1',
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.report!.effort.model).toBe('constant');
    expect(result.report!.ranking.every((r) => r.estimatedDays === 2)).toBe(true);
    expect(result.report!.effort.lotEstimate).toBeUndefined();
  });
  test('S06 : ancres au même indice moyennées et signalées', async () => {
    const f = await fixture(corpus);
    const result = run(f.root, path.join(f.base, 'result.json'), ['--effort', '{"A":1,"B":3}']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.report!.effort.model).toBe('constant');
    expect(result.report!.effort.anchors.A!.estimated).toBe(2);
    expect(result.report!.diagnostics.some((d) => d.code === 'ANCHORS_MERGED')).toBe(true);
  });
  test('calibration : quatre indices, validation croisée et sorties cohérentes', async () => {
    const f = await fixture(
      Object.fromEntries(
        [0, 1, 2, 3].map((i) => [
          `components/basic/C${i}/C${i}.tsx`,
          `export function C${i}(){ ${'if(true){}\n'.repeat(i * 20)} return <button/> }`,
        ]),
      ),
    );
    const out = path.join(f.base, 'result.json');
    const result = run(f.root, out, ['--effort', 'C0:0,C1:1,C2:2,C3:3']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.report!.effort.crossValidation?.mae).toBeGreaterThanOrEqual(0);
    for (const anchor of Object.values(result.report!.effort.anchors)) {
      expect(anchor.estimated).toBe(anchor.days);
    }
    const md = readFileSync(path.join(f.base, 'result.md'), 'utf8');
    const csv = readFileSync(path.join(f.base, 'result.csv'), 'utf8');
    expect(md).toContain('leave-one-out');
    expect(md).toContain(String(result.report!.effort.totalDays));
    expect(csv).toContain('estimatedDays');
    expect(csv).toContain('components/basic/C0');
  });
  test.each([
    ['--unknown'],
    ['--effort'],
    ['--effort', ''],
    ['--effort', 'A:1', '--overhead', ''],
    ['--src', '   '],
    ['--overhead', '1'],
    ['--lot-rate', 'NaN'],
    ['--effort', 'A:-1'],
    ['--effort', 'A:Infinity'],
    ['--effort', '{"A":"abc"}'],
    ['--effort', 'A:1,A:2'],
    ['--effort', 'Missing:1'],
    ['--effort', 'missing.json'],
    ['--effort', 'A:1', '--lot-rate', '1.1'],
    ['--effort', 'A:1', '--overhead', 'Infinity'],
    ['--effort', 'A:1e308'],
  ])('S07 : refuse les arguments invalides %j sans créer de sortie', async (...args) => {
    const f = await fixture(corpus);
    const out = path.join(f.base, 'result.json');
    const result = run(f.root, out, args);
    expect(result.status).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(existsSync(out)).toBe(false);
  });
  test('S02/S07 : une ancre courte ambiguë exige un chemin', async () => {
    const f = await fixture({
      ...simple,
      'components/other/Button/Button.tsx': 'export function Button(){return <button/>}',
    });
    expect(run(f.root, path.join(f.base, 'bad.json'), ['--effort', 'Button:1']).stderr).toContain(
      'ambiguë',
    );
    const result = run(f.root, path.join(f.base, 'ok.json'), [
      '--effort',
      'components/basic/Button:1',
    ]);
    expect(result.status, result.stderr).toBe(0);
  });
  test('S07 : aide disponible sans analyser les entrées', () => {
    const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--tsconfig');
  });
});

describe('script autonome : écritures protégées', () => {
  test('S05 : sources préservées et toutes les destinations vérifiées avant écriture', async () => {
    const f = await fixture(simple);
    const source = path.join(f.root, Object.keys(simple)[0]!);
    const before = readFileSync(source, 'utf8');
    expect(run(f.root, source).status).toBe(1);
    expect(readFileSync(source, 'utf8')).toBe(before);
    const out = path.join(f.base, 'result.json');
    await mkdir(path.join(f.base, 'result.md'));
    expect(run(f.root, out).status).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
  test('S05 : jonction de sortie vers les sources refusée', async () => {
    const f = await fixture(simple);
    const junction = path.join(f.base, 'linked');
    await symlink(f.root, junction, process.platform === 'win32' ? 'junction' : 'dir');
    expect(run(f.root, path.join(junction, 'result.json')).status).toBe(1);
    expect(existsSync(path.join(f.root, 'result.json'))).toBe(false);
  });
  test('S05 : un lien physique de sortie ne tronque pas la source', async () => {
    const f = await fixture(simple);
    const source = path.join(f.root, Object.keys(simple)[0]!);
    const out = path.join(f.base, 'result.json');
    await link(source, out);
    const before = readFileSync(source, 'utf8');
    const result = run(f.root, out);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(source, 'utf8')).toBe(before);
    expect(result.report!.ranking).toHaveLength(1);
  });
  test('S05 : le fichier d’ancres est protégé et les formules CSV sont neutralisées', async () => {
    const f = await fixture({
      'components/basic/=SUM(1,1)/Button.tsx': 'export function Button(){return <button/>}',
    });
    const out = path.join(f.base, 'ancres.json');
    const anchors = JSON.stringify({ 'components/basic/=SUM(1,1)': 1 });
    await writeFile(out, anchors);
    const invalid = run(f.root, out, ['--effort', out]);
    expect(invalid.status).toBe(1);
    expect(readFileSync(out, 'utf8')).toBe(anchors);
    expect(existsSync(path.join(f.base, 'ancres.md'))).toBe(false);
    const valid = run(f.root, path.join(f.base, 'result.json'));
    expect(valid.status, valid.stderr).toBe(0);
    expect(readFileSync(path.join(f.base, 'result.csv'), 'utf8')).toContain('"\'=SUM(1,1)"');
  });
});
