import { parentPort, workerData } from "node:worker_threads";

// A worker thread for parallel.ts: runs its task on each chunk it's sent and posts the result.
const { module, task, args } = workerData;
const m = await import(module);
parentPort!.on("message", async ({ seed, n }) => parentPort!.postMessage(await m[task](...args, seed, n)));
