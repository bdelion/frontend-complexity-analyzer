import { lstat, realpath, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/** Normalise les séparateurs pour les identités et les rapports.
 * @param value Chemin local.
 * @returns Chemin portable.
 * @example portable('src/Button.tsx')
 */
export function portable(value: string): string {
  return value.replaceAll('\\', '/');
}

/** Détermine l'inclusion de chemins canoniques.
 * @param parent Répertoire englobant.
 * @param child Chemin à tester.
 * @returns Vrai si le chemin est inclus ou égal.
 * @example contains('/a', '/a/b')
 */
export function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

/** Résout aussi les parents existants d'un futur fichier.
 * @param target Chemin existant ou à créer.
 * @returns Chemin physique canonique.
 * @throws Si un lien pendant ou une erreur d'accès empêche la résolution.
 * @example await canonical('reports/report.json')
 */
export async function canonical(target: string): Promise<string> {
  const absolute = path.resolve(target);
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Un lien pendant ne doit pas être traité comme un nouveau chemin ordinaire.
    try {
      if ((await lstat(absolute)).isSymbolicLink()) throw new Error(`Lien pendant : ${absolute}`);
    } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
    }
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(await canonical(parent), path.basename(absolute));
  }
}

/** Refuse toute écriture recouvrant une racine inspectée.
 * @param target Destination du rapport.
 * @param roots Racines protégées.
 * @returns Destination canonique.
 * @throws Si la destination recouvre les entrées.
 * @example await safeOutput('reports', ['/data/lib'])
 */
export async function safeOutput(target: string, roots: readonly string[]): Promise<string> {
  const destination = await canonical(target);
  for (const root of roots) {
    const source = await canonical(root);
    if (contains(source, destination) || contains(destination, source)) {
      throw new Error(`La sortie recouvre une racine analysée : ${target}`);
    }
  }
  return destination;
}

/** Écrit uniquement après contrôle de la destination et de ses liens.
 * @param target Fichier de sortie.
 * @param content Contenu généré.
 * @param roots Racines à préserver.
 * @param exclusive Refuser un remplacement, notamment pour l'historique.
 * @returns Promesse de fin d'écriture.
 * @throws Si la destination est protégée ou inaccessible.
 * @example await writeSafe('reports/a.json', '{}', ['/data/lib'])
 */
export async function writeSafe(
  target: string,
  content: string,
  roots: readonly string[],
  exclusive = false,
): Promise<void> {
  const destination = await safeOutput(target, roots);
  await mkdir(path.dirname(destination), { recursive: true });
  await safeOutput(destination, roots);
  if (exclusive) {
    await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' });
  } else {
    // Remplacer le nom de sortie évite aussi de tronquer une source liée par lien physique.
    const temporary = path.join(path.dirname(destination), `.fca-${randomUUID()}.tmp`);
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    if ((await safeOutput(destination, roots)) !== destination)
      throw new Error('Destination modifiée pendant l’écriture');
    await rename(temporary, destination);
  }
}

/** Parcourt sans suivre de lien symbolique, dans un ordre stable.
 * @param root Répertoire racine.
 * @param exclude Prédicat d'exclusion des chemins relatifs.
 * @returns Fichiers candidats et nombre d'entrées ignorées.
 * @throws Si un répertoire n'est pas lisible.
 * @example await walk('/data/lib', p => p === 'dist')
 */
export async function walk(
  root: string,
  exclude: (relative: string) => boolean,
): Promise<{ files: string[]; excluded: number; links: string[] }> {
  const files: string[] = [];
  const links: string[] = [];
  let excluded = 0;
  async function visit(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    );
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      const relative = portable(path.relative(root, file));
      if (entry.isSymbolicLink()) {
        links.push(relative);
        continue;
      }
      // Une entrée exclue représente une frontière, pas un comptage des fichiers cachés dessous.
      if (exclude(relative)) {
        excluded++;
        continue;
      }
      if (entry.isDirectory()) await visit(file);
      else if (
        entry.isFile() &&
        /\.(?:tsx?|jsx?)$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts')
      )
        files.push(file);
    }
  }
  await visit(root);
  return { files, excluded, links };
}
