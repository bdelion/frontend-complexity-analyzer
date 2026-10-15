/** Calcule profondeur et cycles sur un graphe condensé en composantes connexes.
 * @param edges Adjacence des unités internes.
 * @returns Profondeur en arêtes et groupes cycliques.
 * @example graphSummary(new Map([['a', ['b']], ['b', []]]))
 */
export function graphSummary(edges: ReadonlyMap<string, readonly string[]>): {
  depth: number;
  cycles: string[][];
} {
  let index = 0;
  const indices = new Map<string, number>();
  const lows = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const groups: string[][] = [];
  function visit(id: string): void {
    indices.set(id, index);
    lows.set(id, index++);
    stack.push(id);
    active.add(id);
    for (const dependency of edges.get(id) ?? []) {
      if (!edges.has(dependency)) continue;
      if (!indices.has(dependency)) {
        visit(dependency);
        lows.set(id, Math.min(lows.get(id)!, lows.get(dependency)!));
      } else if (active.has(dependency))
        lows.set(id, Math.min(lows.get(id)!, indices.get(dependency)!));
    }
    if (lows.get(id) === indices.get(id)) {
      const group: string[] = [];
      let entry: string;
      do {
        entry = stack.pop()!;
        active.delete(entry);
        group.push(entry);
      } while (entry !== id);
      groups.push(group.sort());
    }
  }
  for (const id of edges.keys()) if (!indices.has(id)) visit(id);
  const membership = new Map(groups.flatMap((group, i) => group.map((id) => [id, i] as const)));
  const adjacency = groups.map(() => new Set<number>());
  for (const [id, dependencies] of edges)
    for (const target of dependencies) {
      const a = membership.get(id);
      const b = membership.get(target);
      if (a !== undefined && b !== undefined && a !== b) adjacency[a]!.add(b);
    }
  const depths = new Map<number, number>();
  function depth(group: number): number {
    if (!depths.has(group))
      depths.set(group, Math.max(0, ...[...adjacency[group]!].map((next) => 1 + depth(next))));
    return depths.get(group)!;
  }
  return {
    depth: Math.max(0, ...groups.map((_, i) => depth(i))),
    cycles: groups.filter((g) => g.length > 1 || edges.get(g[0]!)?.includes(g[0]!)),
  };
}
