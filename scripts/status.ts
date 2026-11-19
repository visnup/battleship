import { execSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { availableParallelism, loadavg } from "node:os";
import { parseArgs } from "node:util";

// A page at http://localhost:3001 showing how far a round (`round.sh`, `overnight.sh`) has got:
// each stage from its log, games labeled so far from the data's shards, and an ETA from the
// recent rate. It only reads files, so it can't disturb the round.

const { values: args } = parseArgs({ options: { round: { type: "string", default: "7" }, games: { type: "string", default: "5000" }, port: { type: "string", default: "3001" } } });
const data = `dataset/data-r${args.round}`;
const log = `dataset/r${args.round}/log.txt`;
// rough minutes for the stages after the data, from earlier rounds
const AFTER = [
  ["extract", 2],
  ["train", 13],
  ["compare learned", 5],
  ["trained on its own data alone", 17],
  ["done", 0],
] as const;

/** How far along a stage after the data is, from what it has written, when that says. */
const trees = (file: string) => {
  const done = existsSync(file) && [...readFileSync(file, "utf8").matchAll(/^\[(\d+)\]/gm)].at(-1);
  return done ? Number(done[1]) / 1000 : undefined;
};
const lines = (file: string, re: RegExp) => (existsSync(file) ? (readFileSync(file, "utf8").match(re)?.length ?? 0) : 0);
const PROGRESS: Record<string, () => number | undefined> = {
  extract: () => (existsSync(`dataset/features-r${args.round}`) ? readdirSync(`dataset/features-r${args.round}`).length / (256 * 4 * 3) : 0),
  train: () => trees(`dataset/r${args.round}/trees.txt`),
  "compare learned": () => lines(`dataset/r${args.round}/compare.txt`, /^learned, /gm) / 4,
  "trained on its own data alone": () => trees(`dataset/r${args.round}/trees-only.txt`),
};

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

/** How much of the labeling is done, by game-seats, for `sample` to keep. */
let labeled = 0;

function status() {
  const text = existsSync(log) ? readFileSync(log, "utf8") : "";
  const at = text.lastIndexOf("the real thing");
  const real = text.slice(at);
  // the log says how many once a player count finishes
  const games = Number(/^\d players: (\d+) games/m.exec(real)?.[1] ?? args.games);
  const counts = [2, 3, 4, 5].map((p) => {
    const done = new RegExp(`^${p} players: \\d+ games, \\d+ decisions, ([\\d.]+) min`, "m").exec(real);
    return { p, done: !!done, minutes: done ? Number(done[1]) : 0, games: done ? games : played(p) };
  });
  const total = counts.reduce((s, c) => s + c.games * c.p, 0);
  labeled = total / (games * 14);
  const dataDone = counts.every((c) => c.done);
  const head = text.slice(text.lastIndexOf("\n", at) + 1);
  const evs = events(head);
  const start = Date.parse(head.slice(0, head.indexOf(" round")));
  // the labeling done over time: each player count's finish from the log, then what `sample` kept
  let seats = 0;
  const progress = Number.isFinite(start)
    ? [
        { t: start, v: 0 },
        ...evs.flatMap((e) => (/^\d players$/.test(e.name) ? [{ t: e.t, v: (seats += Number(e.name[0])) / 14 }] : [])),
        ...usage.flatMap((u) => (u.done && u.t > start ? [{ t: u.t, v: u.done }] : [])),
        { t: Date.now(), v: labeled },
      ].sort((a, b) => a.t - b.t)
    : [{ t: Date.now(), v: labeled }];
  // the rate since the first of those in the last 15 minutes, or the one before if that's too recent to say
  const from = progress.find((p, i) => Date.now() - p.t < 15 * 60e3 && (Date.now() - p.t > 3 * 60e3 || i === 0)) ?? progress.findLast((p) => Date.now() - p.t > 3 * 60e3) ?? progress[0];
  const t0 = from.t;
  const rate = ((labeled - from.v) * games * 14) / ((Date.now() - t0) / 60e3);
  const left = (1 - labeled) * games * 14;
  const since = (Date.now() - (evs.at(-1)?.t ?? Date.now())) / 60e3;
  const after = AFTER.map(([name, min]) => ({ name, min, done: real.includes(`] ${name}`) || real.includes(`: ${name}`), progress: 0 }));
  const current = dataDone ? after.find((a) => !a.done) : undefined;
  if (current) current.progress = Math.min(PROGRESS[current.name]?.() ?? since / current.min, 0.99);
  const afterLeft = after.filter((a) => !a.done).reduce((s, a) => s + a.min * (1 - a.progress), 0);
  const dataLeft = dataDone ? 0 : rate > 0 ? left / rate : NaN;
  const eta = dataLeft + afterLeft;
  // when each stage still to come should finish
  let t = Date.now() + dataLeft * 60e3;
  const ahead = Number.isFinite(eta) ? [...(dataDone ? [] : [{ t, name: "data" }]), ...after.filter((a) => !a.done && a.min).map((a) => ({ t: (t += a.min * (1 - a.progress) * 60e3), name: a.name }))] : [];
  /** How long a finished stage took, to the log's minute: from the milestone before it. */
  const took = (name: string) => {
    const i = evs.findIndex((e) => e.name === name);
    if (i < 1) return "";
    const min = Math.round((evs[i].t - evs[i - 1].t) / 60e3);
    return min ? `${min} min` : "<1 min";
  };
  const stages = after.filter((a) => a.min);
  /** One stretch of a track, as wide as its `weight`: a bar of how much is done, over its name and a note. */
  const seg = (weight: number, name: string, note: string, f: number) =>
    `<div class="seg" style="flex:${weight} 1 4em"><div class="bar"><div style="width:${(100 * Math.min(1, f)).toFixed(1)}%"></div></div>${name}<small>${note}</small></div>`;
  /** A 0–100% track of `segs`, under its name and how far along it is. */
  const track = (name: string, note: string, segs: string[]) => `<div class="row"><span>${name}</span><small>${note}</small></div><div class="track">${segs.join("")}</div>`;
  const when = Number.isFinite(eta) ? new Date(Date.now() + eta * 60e3).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "…";
  const now = usage.at(-1) ?? { cores: 0, load: 0 };
  const title = `Round ${args.round} · ${Number.isFinite(eta) ? `${Math.round(eta)} min` : "…"}`;
  // a run that isn't a round (no `data-rN`) just lists its milestones
  const round = existsSync(data);
  return {
    title: round ? title : `Round ${args.round}`,
    head: round ? `<h1>Round ${args.round}: done ~${when} <small>(${Number.isFinite(eta) ? Math.round(eta) : "…"} min)</small></h1>` : `<h1>Round ${args.round}</h1>`,
    body: `${
      round
        ? `${track(
            "Label games",
            `${Math.round(100 * labeled)}%`,
            counts.map((c) => seg(c.p, `${c.p} players`, c.done ? `${c.minutes} min` : c.games ? `${c.games.toLocaleString()} of ${games.toLocaleString()}` : "", c.games / games)),
          )}
${track(
  "Train and compare",
  `${Math.round((100 * stages.reduce((s, a) => s + a.min * (a.done ? 1 : a.progress), 0)) / stages.reduce((s, a) => s + a.min, 0))}%`,
  stages.map((a) => seg(a.min, a.name, a === current ? `~${Math.ceil(a.min * (1 - a.progress))} min left` : a.done ? took(a.name) : `~${a.min} min`, a.done ? 1 : a.progress)),
)}
<p><small>Labeling ${Number.isFinite(rate) ? Math.round(rate) : "…"} game-seats a minute over the last ${Math.round((Date.now() - t0) / 60e3)} min. Updates every 15 s.</small></p>`
        : `${evs.map((e) => `<div>✓ ${e.name} <small>${new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div>`).join("\n")}`
    }
<pre style="opacity:.7;white-space:pre-wrap">${real.split("\n").slice(-8).join("\n")}</pre>`,
    legend: `<small><span class="key gold"></span>Scripts using ${now.cores.toFixed(1)} of ${CORES} cores · <span class="key"></span>load ${now.load.toFixed(1)}</small>`,
    usage,
    cores: CORES,
    // the machine's, since the page may be viewed somewhere set to another, like UTC
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    events: evs,
    ahead,
    progress,
    start: Number.isFinite(start) ? start : null,
    dataEnd: dataDone || !Number.isFinite(dataLeft) ? null : Date.now() + dataLeft * 60e3,
  };
}

/**
 * When each milestone of the real run finished: a line's own clock time (`12:34` in brackets, or
 * a `date` before "round"), or else the start's plus its `[N min]`, or the player counts' minutes
 * added up.
 */
function events(real: string) {
  const start = Date.parse(real.slice(0, real.indexOf(" round")));
  if (!Number.isFinite(start)) return [];
  const out: { t: number; name: string }[] = [];
  let labeled = 0;
  for (const line of real.split("\n").slice(1)) {
    const count = line.match(/^(\d) players: .*, ([\d.]+) min$/);
    const lap = line.match(/^\s*\[(\d+) min(?:, (\d+):(\d+))?\] (.+)$/);
    const dated = line.match(/^(\w{3} \w{3} +\d+ [\d:]+ \w+ \d{4}) round \w+: (.+)$/);
    if (count) out.push({ t: start + (labeled += Number(count[2])) * 60e3, name: `${count[1]} players` });
    else if (lap && !lap[4].endsWith("so far")) {
      const clock = lap[2] && new Date(start).setHours(Number(lap[2]), Number(lap[3]), 0, 0);
      out.push({ t: clock || start + Number(lap[1]) * 60e3, name: lap[4] });
    } else if (dated) out.push({ t: Date.parse(dated[1]), name: dated[2] });
  }
  return out;
}

const CORES = availableParallelism();
type Usage = { t: number; cores: number; load: number; done?: number };
// kept in a file beside the log, so restarting this page doesn't lose it
const USAGE = `dataset/r${args.round}/usage.jsonl`;
const recent = (u: Usage) => Date.now() - u.t < 12 * 3600e3;
const usage: Usage[] = existsSync(USAGE)
  ? readFileSync(USAGE, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .filter(recent)
  : [];
const sample = () => {
  const u = { t: Date.now(), cores: working(), load: loadavg()[0], done: labeled };
  usage.push(u);
  appendFileSync(USAGE, JSON.stringify(u) + "\n");
  while (!recent(usage[0])) usage.shift();
};

// The charts are drawn in the page by Observable Plot, from the round's start to its ETA, so the
// gap right of "now" is what's left: the labeling done, with a dashed line on to where it should
// finish and a dashed rule where each later stage should, then cores used and the load against
// the core count (dashed).
const page = (s: ReturnType<typeof status>) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${s.title}</title>
<style>body{font:15px system-ui;background:#1d6b4a;color:#fff;max-width:36em;margin:2em auto;padding:0 1em}.row{display:flex;justify-content:space-between;align-items:baseline}.track{display:flex;gap:3px;margin:.3em 0 1.2em}.seg{min-width:0;font-size:12px;line-height:1.3}.seg small{display:block}.bar{background:#ffffff26;border-radius:3px;height:10px;margin-bottom:.35em;overflow:hidden}.bar div{background:#f2c94c;height:100%;border-radius:6px}h1{font-size:1.4em}small{opacity:.7}.key{display:inline-block;width:.8em;height:2px;margin:0 .3em .25em 0;background:#fff9}.key.gold{background:#f2c94c}#legend{margin:0 0 1.2em 40px}</style>
<header>${s.head}</header>
<div id="chart"></div>
<div id="legend">${s.legend}</div>
<main>${s.body}</main>
<script type="module">
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.19/+esm";
const draw = (s) => {
  document.querySelector("header").innerHTML = s.head;
  document.querySelector("main").innerHTML = s.body;
  document.querySelector("#legend").innerHTML = s.legend;
  document.title = s.title;
  const now = Date.now();
  const end = Math.max(now, ...s.ahead.map((a) => a.t));
  const time = (t) => new Date(t);
  const rows = s.usage.flatMap((u) => [{ t: time(u.t), v: u.cores, k: "cores used" }, { t: time(u.t), v: u.load, k: "load" }]);
  const x = { domain: [time(s.start ?? now - 2 * 3600e3), time(end)], label: null, tickFormat: (d) => d.toLocaleTimeString([], { timeZone: s.zone, hour: "numeric", minute: "2-digit" }) };
  const label = { text: "name", frameAnchor: "top", textAnchor: "start", dx: 3, rotate: 90, fontSize: 10 };
  const shared = { width: 576, marginLeft: 40, style: { background: "transparent", color: "#fff" }, x };
  const stages = [
    Plot.ruleX(s.events, { x: (e) => time(e.t), stroke: "#fff4" }),
    Plot.ruleX(s.ahead, { x: (a) => time(a.t), stroke: "#f2c94c", strokeOpacity: 0.6, strokeDasharray: "3 3" }),
    Plot.ruleX([now], { x: time, stroke: "#fff" }),
  ];
  const last = s.progress.at(-1);
  document.querySelector("#chart").replaceChildren(
    Plot.plot({
      ...shared,
      height: 190,
      y: { domain: [0, 1], label: null, grid: true, tickFormat: "%", ticks: 4 },
      marks: [
        ...stages,
        Plot.text(s.events, { ...label, x: (e) => time(e.t), fill: "#fffc" }),
        Plot.text(s.ahead, { ...label, x: (a) => time(a.t), fill: "#f2c94c" }),
        Plot.text([now], { ...label, x: time, text: () => "now", fill: "#fff", fontWeight: "bold" }),
        Plot.areaY(s.progress, { x: (p) => time(p.t), y: "v", fill: "#f2c94c", fillOpacity: 0.2 }),
        Plot.lineY(s.progress, { x: (p) => time(p.t), y: "v", stroke: "#f2c94c", strokeWidth: 2 }),
        s.dataEnd && last ? Plot.lineY([last, { t: s.dataEnd, v: 1 }], { x: (p) => time(p.t), y: "v", stroke: "#f2c94c", strokeWidth: 2, strokeDasharray: "4 4" }) : null,
      ],
    }),
    Plot.plot({
      ...shared,
      height: 120,
      y: { domain: [0, Math.max(2 * s.cores, ...rows.map((r) => r.v))], label: null, grid: true, ticks: 4 },
      color: { domain: ["cores used", "load"], range: ["#f2c94c", "#ffffff99"] },
      marks: [Plot.ruleY([s.cores], { stroke: "#fff6", strokeDasharray: "3 3" }), ...stages, Plot.lineY(rows, { x: "t", y: "v", z: "k", stroke: "k", strokeWidth: 2 })],
    }),
  );
};
draw(${JSON.stringify(s)});
setInterval(async () => { try { draw(await (await fetch("/status")).json()); } catch {} }, 15e3);
</script>`;

status();
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
