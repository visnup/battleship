import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

const CHUNKS = 256;

/**
 * Runs `n` games' worth of `task` in up to 256 chunks, seeded 1, 2, …, that a worker per core
 * takes in turn, then adds up what they return (numbers, arrays, objects or Maps of them) in chunk
 * order, or combines them with `combine`. `task` is an export of `module` called as
 * `task(...args, seed, n)`; `module` must not do anything at the top level but define things, so
 * scripts guard their main code with `import.meta.main`.
 */
export async function parallel<T>(module: string, task: string, args: unknown[], n: number, combine: (a: T, b: T) => T = add): Promise<T> {
  const k = Math.min(CHUNKS, n);
  const sizes = Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
  const parts: T[] = [];
  let next = 0, done = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(availableParallelism(), k) }, () => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { workerData: { module, task, args } });
      return new Promise<void>((resolve, reject) => {
        let i = 0;
        const take = () => {
          if (next === k) return void worker.terminate().then(() => resolve());
          i = next++;
          worker.postMessage({ seed: i + 1, n: sizes[i] });
        };
        worker.on("message", (part: T) => {
          parts[i] = part;
          if (++done % Math.ceil(k / 10) === 0 || done === k)
            console.error(`${task}: ${Math.round((100 * done) / k)}% after ${((performance.now() - start) / 1000).toFixed(0)}s`);
          take();
        });
        worker.once("error", reject);
        take();
      });
    }),
  );
  return parts.reduce(combine);
}

/**
 * Runs `task` like `parallel`, where it returns an array of rows per game, and
 * concatenates them, numbering each game in a `key` column.
 */
export async function collect<T>(module: string, task: string, args: unknown[], n: number, key = "game") {
  const parts = await parallel<T[][]>(module, task, args, n, (a, b) => a.concat(b));
  return parts.flatMap((rows, i) => rows.map((r) => ({ [key]: i, ...r })));
}

function add<T>(a: T, b: T): T {
  if (typeof a === "number") return (a + (b as number)) as T;
  if (Array.isArray(a)) return a.map((x, i) => add(x, (b as unknown[])[i])) as T;
  if (a instanceof Map) return new Map([...a].map(([key, x]) => [key, add(x, (b as Map<unknown, unknown>).get(key))])) as T;
  if (a && typeof a === "object") {
    return Object.fromEntries(Object.entries(a).map(([key, x]) => [key, add(x, (b as Record<string, unknown>)[key])])) as T;
  }
  return a;
}
