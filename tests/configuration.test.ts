import { expect, test, describe } from 'vitest';
import { writeFile, mkdir, symlink, readFile, link } from 'node:fs/promises';
import path from 'node:path';
import { loadConfiguration, fingerprint, matcher } from '../src/configuration.js';
import { canonical, contains, portable, safeOutput, writeSafe, walk } from '../src/filesystem.js';
import { fixture } from './helpers.js';

describe('configuration et frontières du système de fichiers', () => {
  test('priorités, chemins relatifs au fichier, formats et empreinte', async () => {
    const { root, base, output } = await fixture();
    const file = path.join(base, 'config.json');
    await writeFile(
      file,
      JSON.stringify({
        libraries: [{ id: 'ds', root: path.basename(root) }],
        outputDirectory: 'rapports',
        formats: ['md'],
      }),
    );
    const config = await loadConfiguration({ config: file });
    expect(config.libraries[0]!.root).toBe(await canonical(root));
    expect(config.outputDirectory).toBe(path.join(base, 'rapports'));
    const override = await loadConfiguration({
      config: file,
      root: [root],
      output,
      format: 'json,html',
    });
    expect(override.formats).toEqual(['json', 'html']);
    expect(fingerprint(config)).toBe(fingerprint({ ...config, outputDirectory: 'elsewhere' }));
    expect(fingerprint(config, 'Button')).not.toBe(fingerprint(config));
    expect(matcher(['**/Button'])('src/Button')).toBe(true);
    expect(portable('A\\B')).toBe('A/B');
  });
  test.each([
    null,
    [],
    { sourceFolders: ['x'] },
    { libraries: [] },
    { libraries: [{ id: 'bad name', root: '.' }] },
    { libraries: [{ id: 'a', root: '.' }], thresholds: { warning: 70 } },
  ])('rejette configuration invalide %j', async (input) => {
    const { base } = await fixture();
    const file = path.join(base, 'invalid.json');
    await writeFile(file, JSON.stringify(input));
    await expect(loadConfiguration({ config: file })).rejects.toThrow();
  });
  test('identités dupliquées, racines superposées et fichiers non répertoires', async () => {
    const { root, base, output } = await fixture({ 'a.ts': 'export {}' });
    const file = path.join(base, 'config.json');
    for (const libraries of [
      [
        { id: 'a', root },
        { id: 'a', root },
      ],
      [
        { id: 'a', root },
        { id: 'b', root },
      ],
      [{ id: 'a', root: path.join(root, 'a.ts') }],
    ]) {
      await writeFile(file, JSON.stringify({ libraries, outputDirectory: output }));
      await expect(loadConfiguration({ config: file })).rejects.toThrow();
    }
  });
  test('tsconfig externe et overrides de traversée refusés', async () => {
    const { root, base, output } = await fixture();
    const file = path.join(base, 'config.json');
    for (const extra of [
      { libraries: [{ id: 'ds', root, tsconfig: '../other.json' }] },
      { ownershipOverrides: { 'ds:file': '../outside' } },
      { ownershipOverrides: { file: 'Button' } },
    ]) {
      await writeFile(
        file,
        JSON.stringify({ libraries: [{ id: 'ds', root }], outputDirectory: output, ...extra }),
      );
      await expect(loadConfiguration({ config: file })).rejects.toThrow();
    }
  });
  test('sorties directes, ancêtres et liens vers les entrées refusés', async () => {
    const { root, base, output } = await fixture({
      'Button.tsx': 'export const Button=()=> <button/>',
    });
    expect(contains(root, path.join(root, 'Button.tsx'))).toBe(true);
    expect(contains(root, path.join(base, 'lib-sibling'))).toBe(false);
    await expect(safeOutput(path.join(root, 'reports'), [root])).rejects.toThrow('recouvre');
    await expect(safeOutput(base, [root])).rejects.toThrow('recouvre');
    const junctionPath = path.join(base, 'link');
    await symlink(root, junctionPath, 'junction');
    await expect(safeOutput(path.join(junctionPath, 'reports'), [root])).rejects.toThrow(
      'recouvre',
    );
    await mkdir(output);
    await symlink(root, path.join(output, 'nested'), 'junction');
    await expect(
      writeSafe(path.join(output, 'nested', 'report.json'), '{}', [root]),
    ).rejects.toThrow('recouvre');
    await writeSafe(path.join(output, 'safe.json'), '{}', [root]);
    expect(await readFile(path.join(output, 'safe.json'), 'utf8')).toBe('{}');
    const linked = path.join(output, 'hardlink.json');
    await link(path.join(root, 'Button.tsx'), linked);
    await writeSafe(linked, 'nouveau rapport', [root]);
    expect(await readFile(path.join(root, 'Button.tsx'), 'utf8')).toBe(
      'export const Button=()=> <button/>',
    );
    expect(await readFile(linked, 'utf8')).toBe('nouveau rapport');
  });
  test('scan stable : exclusions et liens jamais suivis', async () => {
    const { root, base } = await fixture({
      'B/B.ts': 'x',
      'A/A.tsx': 'x',
      'A/A.d.ts': 'x',
      'A/readme.md': 'x',
      'dist/a.ts': 'x',
    });
    await symlink(root, path.join(root, 'cycle'), 'junction');
    const result = await walk(root, (p) => p === 'dist');
    expect(result.files.map((f) => path.relative(root, f).replaceAll('\\', '/'))).toEqual([
      'A/A.tsx',
      'B/B.ts',
    ]);
    expect(result.links).toEqual(['cycle']);
    expect(result.excluded).toBe(1);
    expect(await canonical(path.join(base, 'new', 'deep', 'file'))).toBe(
      path.join(base, 'new', 'deep', 'file'),
    );
  });
});
