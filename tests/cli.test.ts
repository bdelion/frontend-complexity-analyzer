import { beforeAll, expect, test } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCli } from '../src/cli.js';
import { sample } from './helpers.js';
import { vi } from 'vitest';

let data: Awaited<ReturnType<typeof sample>>;
beforeAll(async () => {
  data = await sample();
});
async function run(args: string[]) {
  let out = '';
  let err = '';
  const code = await runCli(args, {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
  });
  return { code, out, err };
}

test('aide, version, erreurs et schémas JSON', async () => {
  expect((await run(['--help'])).code).toBe(0);
  expect((await run(['--version'])).out).toContain('0.1.0');
  expect((await run(['unknown'])).code).toBe(2);
  expect((await run(['schema', 'wrong'])).code).toBe(2);
  for (const kind of ['config', 'report']) {
    const result = await run(['schema', kind]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toHaveProperty('$schema');
  }
  expect((await run(['analyze'])).code).toBe(2);
});

test('analyze, validate-config, report, compare et history', async () => {
  const file = path.join(data.base, 'config.json');
  const archives = path.join(data.base, 'archives');
  await writeFile(
    file,
    JSON.stringify({ libraries: [{ id: 'ds', root: data.root }], outputDirectory: data.output }),
  );
  expect((await run(['validate-config', '-c', file])).code).toBe(0);
  const analyzed = await run([
    'analyze',
    '-c',
    file,
    '--stdout',
    '--explain',
    '--history',
    archives,
  ]);
  expect(analyzed.code).toBe(0);
  expect(JSON.parse(analyzed.out).components).toHaveLength(1);
  expect(analyzed.err).toContain('composants');
  const report = path.join(data.output, 'report.json');
  const views = await run([
    'report',
    report,
    '-o',
    path.join(data.base, 'views'),
    '-f',
    'md,html,csv',
  ]);
  expect(views.code).toBe(0);
  expect(
    (await run(['report', report, '-o', path.join(data.base, 'invalid'), '-f', 'invalid'])).code,
  ).toBe(2);
  expect((await run(['compare', report, report])).code).toBe(0);
  const destination = path.join(data.base, 'comparison.json');
  expect((await run(['compare', report, report, '-o', destination])).code).toBe(0);
  expect(JSON.parse(await readFile(destination, 'utf8')).added).toEqual([]);
  expect((await run(['history', 'list', archives])).code).toBe(0);
  const other = path.join(data.base, 'other-archives');
  expect((await run(['history', 'add', report, '-o', other])).code).toBe(0);
  expect((await run(['report', report, '-o', data.output, '-f', 'json'])).code).toBe(2);
});

test('un rapport partiel retourne 1 et explique les limites', async () => {
  const testFile = path.join(data.root, 'Button', 'ambiguous.spec.ts');
  await writeFile(testFile, `test('x',()=>{})`);
  const result = await run(['analyze', '--root', data.root, '--output', data.output, '--explain']);
  expect(result.code).toBe(1);
  expect(result.err).toContain('TEST_FRAMEWORK_AMBIGUOUS');
});

test('progression optionnelle et nettoyage du terminal en cas d’erreur', async () => {
  const silent = await run(['schema', 'config', '--no-progress']);
  expect(silent.code).toBe(0);
  expect(silent.err).toBe('');
  expect(JSON.parse(silent.out)).toHaveProperty('$schema');
  const events: string[] = [];
  expect(
    await runCli(['schema', 'config'], {
      interactive: true,
      out: () => {
        events.push('résultat');
      },
      err: (text) => {
        events.push(text);
      },
    }),
  ).toBe(0);
  const resultIndex = events.indexOf('résultat');
  expect(events[resultIndex - 1]).toBe('\r\u001b[2K');
  let err = '';
  const clear = vi.spyOn(globalThis, 'clearInterval');
  try {
    const result = await runCli(['analyze'], {
      out: () => {},
      err: (t) => {
        err += t;
      },
      interactive: true,
    });
    expect(result).toBe(2);
    expect(clear).toHaveBeenCalled();
    expect(err).toContain('\r\u001b[2K');
    expect(err).toContain('Erreur');
  } finally {
    clear.mockRestore();
  }
});
