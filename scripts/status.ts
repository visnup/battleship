import { execSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { availableParallelism, loadavg } from "node:os";
import { parseArgs } from "node:util";

// A page at http://localhost:3001 showing how far a round (`round.sh`, `overnight.sh`) has got:
// each stage from its log, games labeled so far from the data's shards, and an ETA from the
// recent rate. It only reads files, so it can't disturb the round.

const { values: args } = parseArgs({ options: { round: { type: "string", default: "7" }, games: { type: "string", default: "5000" }, port: { type: "string", default: "3001" } } });
const data = `dataset/data-r${args.round}`;
const log = `dataset/r${args.round}/log.txt`;
const games = Number(args.games);
// rough minutes for the stages after the data, from earlier rounds
const AFTER = [
  ["extract", 2],
  ["train", 13],
  ["compare learned", 5],
  ["trained on its own data alone", 17],
  ["done", 0],
] as const;

/** Games finished in each shard of `players`, from the game number on its last row. */
function played(players: number) {
  if (!existsSync(data)) return 0;
  let n = 0;
  for (const f of readdirSync(data).filter((f) => f.startsWith(`${players}p-`))) {
    const path = `${data}/${f}`;
    const size = statSync(path).size;
    if (!size) continue;
    const fd = openSync(path, "r");
    const buf = Buffer.alloc(Math.min(size, 8192));
    readSync(fd, buf, 0, buf.length, size - buf.length);
    closeSync(fd);
    const last = buf.toString().trim().split("\n").at(-1)!;
    n += Number(last.match(/"game":"\d+p-\d+-(\d+)"/)?.[1] ?? -1) + 1;
  }
  return n;
}

/** Cores busy with this repo's scripts and training, from `ps`. */
const working = () =>
  execSync("ps -Ao pcpu=,command=")
    .toString()
    .split("\n")
    .filter((l) => /scripts\/(?!status)|learn\.py/.test(l))
    .reduce((s, l) => s + parseFloat(l), 0) / 100;

const samples: [number, number][] = [];

function status() {
  const text = existsSync(log) ? readFileSync(log, "utf8") : "";
  const real = text.slice(text.lastIndexOf("the real thing"));
  const counts = [2, 3, 4, 5].map((p) => {
    const done = new RegExp(`^${p} players: \\d+ games, \\d+ decisions, ([\\d.]+) min`, "m").exec(real);
    return { p, done: !!done, minutes: done ? Number(done[1]) : 0, games: done ? games : played(p) };
  });
  const total = counts.reduce((s, c) => s + c.games * c.p, 0);
  samples.push([Date.now(), total]);
  while (samples.length > 2 && Date.now() - samples[0][0] > 15 * 60e3) samples.shift();
  const [t0, g0] = samples[0];
  const rate = (total - g0) / ((Date.now() - t0) / 60e3);
  const left = counts.reduce((s, c) => s + (games - c.games) * c.p, 0);
  const dataDone = counts.every((c) => c.done);
  const after = AFTER.map(([name, min]) => ({ name, min, done: real.includes(`] ${name}`) || real.includes(`: ${name}`) }));
  const afterLeft = after.filter((a) => !a.done).reduce((s, a) => s + a.min, 0);
  const eta = (dataDone ? 0 : rate > 0 ? left / rate : NaN) + afterLeft;
  const bar = (f: number) => `<div class="bar"><div style="width:${(100 * Math.min(1, f)).toFixed(1)}%"></div></div>`;
  const when = Number.isFinite(eta) ? new Date(Date.now() + eta * 60e3).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "…";
  const now = usage.at(-1)!;
  const title = `Round ${args.round} · ${Number.isFinite(eta) ? `${Math.round(eta)} min` : "…"}`;
  return {
    title,
    body: `<h1>Round ${args.round}: done about ${when} <small>(${Number.isFinite(eta) ? Math.round(eta) : "…"} min)</small></h1>
${counts.map((c) => `${c.p} players: ${c.games.toLocaleString()} of ${games.toLocaleString()} games${c.done ? ` · ${c.minutes} min` : ""}${bar(c.games / games)}`).join("\n")}
${after.map((a) => `<div>${a.done ? "✓" : "○"} ${a.name}</div>`).join("\n")}
<p><small>Labeling ${Number.isFinite(rate) ? Math.round(rate) : "…"} game-seats a minute over the last ${Math.round((Date.now() - t0) / 60e3)} min. Updates every 15 s.</small></p>
<pre style="opacity:.7;white-space:pre-wrap">${real.split("\n").slice(-8).join("\n")}</pre>
<div><span class="key gold"></span>Scripts using ${now.cores.toFixed(1)} of ${CORES} cores · <span class="key"></span>load ${now.load.toFixed(1)}</div>`,
    usage,
    cores: CORES,
  };
}

const CORES = availableParallelism();
const usage: { t: number; cores: number; load: number }[] = [];
const sample = () => {
  usage.push({ t: Date.now(), cores: working(), load: loadavg()[0] });
  if (usage.length > 240) usage.shift();
};

// The chart is drawn in the page by Observable Plot: cores used and the load over the last two
// hours, against the core count (dashed).
const page = (s: ReturnType<typeof status>) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${s.title}</title>
<style>body{font:15px system-ui;background:#1d6b4a;color:#fff;max-width:36em;margin:2em auto;padding:0 1em}.bar{background:#ffffff26;border-radius:6px;height:10px;margin:.3em 0 1em}.bar div{background:#f2c94c;height:100%;border-radius:6px}h1{font-size:1.4em}small{opacity:.7}.key{display:inline-block;width:.8em;height:2px;margin:0 .3em .25em 0;background:#fff9}.key.gold{background:#f2c94c}</style>
<main>${s.body}</main>
<div id="chart"></div>
<script type="module">
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.19/+esm";
const draw = (s) => {
  document.querySelector("main").innerHTML = s.body;
  document.title = s.title;
  const now = Date.now();
  const rows = s.usage.flatMap((u) => [{ t: new Date(u.t), v: u.cores, k: "cores used" }, { t: new Date(u.t), v: u.load, k: "load" }]);
  document.querySelector("#chart").replaceChildren(
    Plot.plot({
      height: 160,
      style: { background: "transparent", color: "#fff" },
      x: { domain: [new Date(now - 2 * 3600e3), new Date(now)], label: null },
      y: { domain: [0, Math.max(2 * s.cores, ...rows.map((r) => r.v))], label: null, grid: true },
      color: { domain: ["cores used", "load"], range: ["#f2c94c", "#ffffff99"] },
      marks: [Plot.ruleY([s.cores], { stroke: "#fff6", strokeDasharray: "3 3" }), Plot.lineY(rows, { x: "t", y: "v", z: "k", stroke: "k", strokeWidth: 2 })],
    }),
  );
};
draw(${JSON.stringify(s)});
setInterval(async () => { try { draw(await (await fetch("/status")).json()); } catch {} }, 15e3);
</script>`;

sample();
setInterval(sample, 30e3);
setInterval(status, 30e3);
createServer((req, res) => {
  const s = status();
  if (req.url === "/status") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(s));
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(page(s));
}).listen(Number(args.port), () => console.log(`http://localhost:${args.port}`));
