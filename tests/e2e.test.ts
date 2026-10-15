import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers.js';

test('binaire compilé : Windows, stdout JSON, exit codes et entrées intactes', async () => {
  const text = 'export function Button(p:{label:string}){return <button aria-label="bouton"/>}';
  const { root, output, base } = await fixture({ 'Button/Button.tsx': text });
  const command = (...args: string[]) =>
    spawnSync(process.execPath, ['dist/cli.js', ...args], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  expect(command('--version').stdout.trim()).toBe('0.1.0');
  const imported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import {TOOL_VERSION} from './dist/index.js'; console.log(TOOL_VERSION);",
      'argument-sans-fichier',
    ],
    { encoding: 'utf8' },
  );
  expect(imported.status).toBe(0);
  expect(imported.stdout.trim()).toBe('0.1.0');
  const alias = path.join(base, 'bin-alias');
  await symlink(path.resolve('dist'), alias, 'junction');
  expect(
    spawnSync(process.execPath, [path.join(alias, 'cli.js'), '--version'], {
      encoding: 'utf8',
    }).stdout.trim(),
  ).toBe('0.1.0');
  const result = command(
    'analyze',
    '--root',
    root,
    '--output',
    output,
    '--stdout',
    '--stats',
    '--format',
    'json,md,html,csv',
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).components).toHaveLength(1);
  expect(JSON.parse(result.stderr.trim().split('\n').at(-1)!).maxRssBytes).toBeGreaterThan(0);
  expect(await readFile(path.join(root, 'Button/Button.tsx'), 'utf8')).toBe(text);
  expect(command('analyze', '--root', root, '--output', path.join(root, 'reports')).status).toBe(2);
  await writeFile(path.join(root, 'Button', 'broken.ts'), 'const = ;');
  expect(command('analyze', '--root', root, '--output', output).status).toBe(1);
});
