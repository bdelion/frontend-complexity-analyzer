import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir, cpus, totalmem, platform } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Le corpus synthétique et ses rapports restent dans un espace temporaire isolé.
const base = await mkdtemp(path.join(tmpdir(), 'fca-benchmark-'));
const root = path.join(base, 'library');
const count = Number(process.env.FCA_BENCH_COMPONENTS ?? 100);
if (!Number.isInteger(count) || count < 1 || count > 10000)
  throw new Error('FCA_BENCH_COMPONENTS doit être un entier entre 1 et 10000');
for (let index = 0; index < count; index++) {
  const directory = path.join(root, `Component${index}`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'index.tsx'),
    `import {useState} from 'react';\ninterface Props {label:string; onChange?:()=>void}\nexport function Component${index}(p:Props){const [state]=useState(false); if(state && p.label) return <button aria-label="x"/>; return <button/>}\n`,
  );
  await writeFile(
    path.join(directory, 'index.test.ts'),
    `import {test,expect} from 'vitest'; test('rendu',()=>{expect(1).toBe(1)});\n`,
  );
}
const results = [];
for (let index = 0; index < 3; index++) {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [
      'dist/cli.js',
      'analyze',
      '--root',
      root,
      '--output',
      path.join(base, `reports-${index}`),
      '--stdout',
      '--stats',
    ],
    { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || 'Échec du benchmark');
  const report = JSON.parse(result.stdout);
  const stats = JSON.parse(result.stderr.trim().split('\n').at(-1));
  results.push({
    run: index + 1,
    milliseconds: Math.round(performance.now() - started),
    maxRssBytes: stats.maxRssBytes,
    components: report.components.length,
    files: report.coverage.eligibleFiles,
    loc: report.libraries[0].metrics.find((m) => m.id === 'code.loc').observation.value,
  });
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: platform(),
      cpu: cpus()[0]?.model,
      memoryBytes: totalmem(),
      corpus: 'synthétique, processus distincts, cache disque non purgé',
      base,
      results,
    },
    null,
    2,
  ),
);
