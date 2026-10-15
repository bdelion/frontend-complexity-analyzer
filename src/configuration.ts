import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import picomatch from 'picomatch';
import { canonical, contains, portable, safeOutput } from './filesystem.js';

/** Formats disponibles sans service externe. */
export const formats = ['json', 'md', 'csv', 'html'] as const;
/** Format de rapport demandé. */
export type Format = (typeof formats)[number];

/** Configuration déclarative, sans chargement de code exécutable. */
export const configSchema = z
  .object({
    schemaVersion: z.literal('1.0.0').default('1.0.0'),
    libraries: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
            root: z.string().min(1),
            tsconfig: z.string().optional(),
            componentGlobs: z.array(z.string()).default(['**']),
          })
          .strict(),
      )
      .min(1),
    exclusions: z
      .array(z.string())
      .default(['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.git/**']),
    testPatterns: z
      .object({
        jest: z.array(z.string()).default([]),
        vitest: z.array(z.string()).default([]),
        playwright: z.array(z.string()).default([]),
      })
      .strict()
      .default({ jest: [], vitest: [], playwright: [] }),
    ownershipOverrides: z.record(z.string(), z.string().nullable()).default({}),
    outputDirectory: z.string().default('./reports'),
    formats: z.array(z.enum(formats)).min(1).default(['json', 'md']),
  })
  .strict();
/** Configuration résolue avec chemins canoniques. */
export type Configuration = z.infer<typeof configSchema>;

/** Paramètres de la ligne de commande prioritaires sur le JSON. */
export interface ConfigOptions {
  config?: string;
  root?: string[];
  output?: string;
  format?: string;
}

/** Compile un filtre glob portable.
 * @param patterns Motifs à combiner.
 * @returns Prédicat de correspondance.
 * @example matcher(['** /Button'.replace(' ', '')])('src/Button')
 */
export function matcher(patterns: readonly string[]): (value: string) => boolean {
  const match = picomatch([...patterns], { dot: true });
  return (value) => match(portable(value)) || match(`${portable(value)}/`);
}

/** Lit et valide la configuration, puis protège les racines.
 * @param options Arguments prioritaires.
 * @returns Configuration canonique.
 * @throws Si les chemins, formats ou paramètres sont invalides.
 * @example await loadConfiguration({ root: ['./lib'] })
 */
export async function loadConfiguration(options: ConfigOptions): Promise<Configuration> {
  const base = options.config ? path.dirname(path.resolve(options.config)) : process.cwd();
  let input: Record<string, unknown> = {};
  if (options.config) {
    const parsed: unknown = JSON.parse(await readFile(options.config, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Configuration JSON objet attendue');
    input = parsed as Record<string, unknown>;
  }
  if ('sourceFolders' in input)
    throw new Error('Migrer sourceFolders vers libraries[{id,root}] ; voir docs/user-guide.md');
  const candidate = { ...input };
  if (options.root)
    candidate.libraries = options.root.map((root, index) => ({
      id: `${
        path
          .basename(path.resolve(root))
          .normalize('NFKD')
          .replace(/[^a-zA-Z0-9_.-]+/g, '-') || 'library'
      }-${index + 1}`,
      root: path.resolve(root),
    }));
  if (options.output) candidate.outputDirectory = path.resolve(options.output);
  if (options.format) candidate.formats = options.format.split(',');
  const config = configSchema.parse(candidate);
  const ids = new Set<string>();
  for (const library of config.libraries) {
    if (ids.has(library.id)) throw new Error(`Identifiant de librairie dupliqué : ${library.id}`);
    ids.add(library.id);
    library.root = await canonical(path.resolve(base, library.root));
    if (!(await stat(library.root)).isDirectory())
      throw new Error(`Racine non répertoire : ${library.root}`);
    if (library.tsconfig) {
      library.tsconfig = await canonical(path.resolve(library.root, library.tsconfig));
      if (!contains(library.root, library.tsconfig))
        throw new Error('Le tsconfig doit appartenir à sa librairie');
    }
  }
  for (const [index, library] of config.libraries.entries()) {
    for (const other of config.libraries.slice(index + 1)) {
      if (contains(library.root, other.root) || contains(other.root, library.root))
        throw new Error('Racines de librairies superposées');
    }
  }
  for (const [key, owner] of Object.entries(config.ownershipOverrides)) {
    if (
      !key.includes(':') ||
      (owner !== null && (path.isAbsolute(owner) || owner.split(/[\\/]/).includes('..')))
    ) {
      throw new Error('Appartenance invalide : clé libraryId:chemin et répertoire relatif requis');
    }
  }
  config.outputDirectory = await safeOutput(
    path.resolve(base, config.outputDirectory),
    config.libraries.map((l) => l.root),
  );
  return config;
}

/** Empreinte du périmètre, indépendante des chemins absolus et sorties.
 * @param config Configuration validée.
 * @param component Filtre de composant éventuel.
 * @returns SHA-256 du périmètre logique.
 * @example fingerprint(config)
 */
export function fingerprint(config: Configuration, component?: string): string {
  const logical = {
    libraries: config.libraries.map(({ id, componentGlobs, tsconfig, root }) => ({
      id,
      componentGlobs,
      tsconfig: tsconfig ? portable(path.relative(root, tsconfig)) : null,
    })),
    exclusions: config.exclusions,
    testPatterns: config.testPatterns,
    ownershipOverrides: Object.fromEntries(Object.entries(config.ownershipOverrides).sort()),
    component: component ?? null,
  };
  return createHash('sha256').update(JSON.stringify(logical)).digest('hex');
}
