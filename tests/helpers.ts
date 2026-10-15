import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Project, ts } from 'ts-morph';
import type { SourceUnit, Diagnostic } from '../src/models.js';
import { analyzeCode } from '../src/code-analyzer.js';
import { analyzeInteractions } from '../src/interaction-analyzer.js';
import { analyzeTests } from '../src/test-analyzer.js';
import { loadConfiguration } from '../src/configuration.js';
import { analyze } from '../src/engine.js';

/** Crée une arborescence synthétique isolée dans le dossier temporaire. */
export async function fixture(
  files: Record<string, string> = {},
): Promise<{ base: string; root: string; output: string }> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'fca-épreuve-'));
  const root = path.join(base, 'lib avec espaces');
  const output = path.join(base, 'reports');
  await mkdir(root, { recursive: true });
  for (const [relative, text] of Object.entries(files)) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, text, 'utf8');
  }
  return { base, root, output };
}

/** Analyse un fragment sans importer ni exécuter React ou les tests. */
export function fragment(
  text: string,
  kind: SourceUnit['kind'] = 'production',
  framework?: string,
) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true, jsx: ts.JsxEmit.Preserve },
  });
  const source = project.createSourceFile('/lib/Button/Button.tsx', text);
  const unit: SourceUnit = {
    id: 'ds:Button/Button.tsx',
    libraryId: 'ds',
    relativePath: 'Button/Button.tsx',
    kind,
    ownerComponentId: 'ds:Button',
    usedByComponentIds: [],
    dependencies: [],
    externalDependencies: [],
    typeDependencies: [],
    metrics: [],
    details: [],
    analysisStatus: 'complete',
  };
  const diagnostics: Diagnostic[] = [];
  analyzeCode(source, unit, diagnostics);
  if (kind === 'production') analyzeInteractions(source, unit, diagnostics);
  if (kind === 'test') analyzeTests(source, unit, diagnostics, framework);
  return {
    unit,
    diagnostics,
    source,
    project,
    value: (id: string) => unit.metrics.find((m) => m.id === id)?.observation.value,
  };
}

/** Produit un rapport réel sur un corpus synthétique minimal. */
export async function sample() {
  const locations = await fixture({
    'Button/Button.tsx': `import { useState as state } from 'react';
interface Props { label: string; onChange?: () => void }
/** Affiche le bouton. */
export function Button(props: Props) {
  const [value] = state(0);
  if (value && props.label) return <button aria-label="label">Oui</button>;
  return <button onKeyDown={event => { if (event.key === 'Escape') props.onChange?.() }}>Non</button>;
}`,
    'Button/Button.test.ts': `import { test, expect } from 'vitest'; test('bouton', () => { expect(1).toBe(1); });`,
  });
  const config = await loadConfiguration({ root: [locations.root], output: locations.output });
  return { ...locations, config, report: await analyze(config) };
}
