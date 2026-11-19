import { execSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { availableParallelism, loadavg } from "node:os";
import { parseArgs } from "node:util";

// A page at http://localhost:3002 (monopoly-deal's is 3001) showing how far a round (`round.sh`) has got: each stage from
// its log, games labeled so far from the data's shards, and an ETA from the recent rate. It only
// reads files, so it can't disturb the round. Adapted from monopoly-deal's.

const { values: args } = parseArgs({ options: { round: { type: "string", default: "9" }, games: { type: "string", default: "3000" }, port: { type: "string", default: "3002" } } });
const dir = `dataset/r${args.round}`;
const data = `dataset/data-r${args.round}s`;
const log = `${dir}/log.txt`;
// rough minutes for each player count's games, from round 8, which weigh them in the labeling
const COUNTS = [
  [3, 19],
  [4, 9],
  [5, 13],
  [6, 17],
] as const;
const WEIGHT = COUNTS.reduce((s, [, m]) => s + m, 0);
// rough minutes for the stages after the data, from round 8
const AFTER = [
  ["train", 5],
  ["compare", 8],
  ["train 200", 2],
  ["done", 0],
] as const;

/** How far a fit is, from the last `[iteration]` LightGBM logged. */
const trees = (file: string, of: number) => {
  const done = existsSync(file) && [...readFileSync(file, "utf8").matchAll(/^\[(\d+)\]/gm)].at(-1);
  return done ? Number(done[1]) / of : undefined;
};
const lines = (file: string, re: RegExp) => (existsSync(file) ? (readFileSync(file, "utf8").match(re)?.length ?? 0) : 0);
const PROGRESS: Record<string, () => number | undefined> = {
  train: () => trees(`${dir}/trees.txt`, 1000),
  compare: () => lines(`${dir}/compare.txt`, /^\| learned /gm) / 5,
  "train 200": () => trees(`${dir}/trees-200.txt`, 200),
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
    n += Number(last.match(/"game":(\d+)/)?.[1] ?? -1) + 1;
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

/** How much of the labeling is done, weighted by each player count's minutes, for `sample` to keep. */
let labeled = 0;

function status() {
  const text = existsSync(log) ? readFileSync(log, "utf8") : "";
  const at = text.lastIndexOf(`round ${args.round}: start`);
  const real = at < 0 ? "" : text.slice(text.lastIndexOf("\n", at) + 1);
  const games = Number(args.games);
  const counts = COUNTS.map(([p, weight]) => {
    const done = new RegExp(`^\\d\\d:\\d\\d ${p} players: \\d+ games, \\d+ decisions, ([\\d.]+) min`, "m").exec(real);
    return { p, weight, done: !!done, minutes: done ? Number(done[1]) : 0, games: done ? games : played(p) };
  });
  labeled = counts.reduce((s, c) => s + (c.weight * c.games) / games, 0) / WEIGHT;
  const dataDone = counts.every((c) => c.done);
  const evs = events(real);
  const start = Date.parse(real.slice(0, real.indexOf(" round")));
  // the labeling done over time: each player count's finish from the log, then what `sample` kept
  let weight = 0;
  const progress = Number.isFinite(start)
    ? [
        { t: start, v: 0 },
        ...evs.flatMap((e) => {
          const c = COUNTS.find(([p]) => e.name === `${p} players`);
          return c ? [{ t: e.t, v: (weight += c[1]) / WEIGHT }] : [];
        }),
        ...usage.flatMap((u) => (u.done && u.t > start ? [{ t: u.t, v: u.done }] : [])),
        { t: Date.now(), v: labeled },
      ].sort((a, b) => a.t - b.t)
    : [{ t: Date.now(), v: labeled }];
  // the rate since the first of those in the last 15 minutes, or the one before if that's too recent to say
  const from = progress.find((p, i) => Date.now() - p.t < 15 * 60e3 && (Date.now() - p.t > 3 * 60e3 || i === 0)) ?? progress.findLast((p) => Date.now() - p.t > 3 * 60e3) ?? progress[0];
  const t0 = from.t;
  const rate = (labeled - from.v) / ((Date.now() - t0) / 60e3);
  const since = (Date.now() - (evs.at(-1)?.t ?? Date.now())) / 60e3;
  const after = AFTER.map(([name, min]) => ({ name, min, done: evs.some((e) => e.name === name), progress: 0 }));
  // a run that skips a stage still ends
  if (after.at(-1)!.done) for (const a of after) a.done = true;
  const current = dataDone ? after.find((a) => !a.done) : undefined;
  if (current) current.progress = Math.min(PROGRESS[current.name]?.() ?? since / current.min, 0.99);
  const afterLeft = after.filter((a) => !a.done).reduce((s, a) => s + a.min * (1 - a.progress), 0);
  const dataLeft = dataDone ? 0 : rate > 0 ? (1 - labeled) / rate : NaN;
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
  // Each track's 0 to 100% over time, for the chart: the labeling up to when the data was done,
  // then the stages after it by their usual minutes; and a line on from each to where it should end.
  const minutes = stages.reduce((s, a) => s + a.min, 0);
  const staged = stages.reduce((s, a) => s + a.min * (a.done ? 1 : a.progress), 0) / minutes;
  const dataT = evs.find((e) => e.name === "data")?.t;
  const dataEnd = Date.now() + dataLeft * 60e3;
  let spent = 0;
  const tracks = [
    dataT ? [...progress.filter((p) => p.t < dataT), { t: dataT, v: 1 }] : progress,
    dataT
      ? [
          { t: dataT, v: 0 },
          ...stages.flatMap((a) => {
            const at = evs.find((e) => e.name === a.name)?.t;
            return a.done && at ? [{ t: at, v: (spent += a.min) / minutes }] : [];
          }),
          ...(staged < 1 ? [{ t: Date.now(), v: staged }] : []),
        ]
      : [],
  ];
  const forecast = Number.isFinite(eta)
    ? [...(dataT ? [] : [[tracks[0].at(-1)!, { t: dataEnd, v: 1 }]]), ...(staged < 1 ? [[dataT ? tracks[1].at(-1)! : { t: dataEnd, v: 0 }, { t: Date.now() + eta * 60e3, v: 1 }]] : [])]
    : [];
  /** One stretch of a track, as wide as its `weight`: a bar of how much is done, over its name and a note. */
  const seg = (weight: number, name: string, note: string, f: number) =>
    `<div class="seg" style="flex:${weight} 1 4em"><div class="bar"><div style="width:${(100 * Math.min(1, f)).toFixed(1)}%"></div></div>${name}<small>${note}</small></div>`;
  /** A 0–100% track of `segs`, under its name and how far along it is. */
  const track = (name: string, note: string, segs: string[]) => `<div class="row"><span>${name}</span><small>${note}</small></div><div class="track">${segs.join("")}</div>`;
  const when = Number.isFinite(eta) ? new Date(Date.now() + eta * 60e3).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "…";
  const finished = evs.some((e) => e.name === "done");
  return {
    title: `Round ${args.round} · ${finished ? "done" : Number.isFinite(eta) ? `${Math.round(eta)} min` : "…"}`,
    head: `<h1>Round ${args.round}: ${finished ? "done" : `done ~${when} <small>(${Number.isFinite(eta) ? Math.round(eta) : "…"} min)</small>`}</h1>`,
    body: `${track(
      "Label games",
      `${Math.round(100 * labeled)}%`,
      counts.map((c) => seg(c.weight, `${c.p} players`, c.done ? `${c.minutes} min` : c.games ? `${c.games.toLocaleString()} of ${games.toLocaleString()}` : "", c.games / games)),
    )}
${track(
  "Train and compare",
  `${Math.round(100 * staged)}%`,
  stages.map((a) => seg(a.min, a.name, a === current ? `~${Math.ceil(a.min * (1 - a.progress))} min left` : a.done ? took(a.name) : `~${a.min} min`, a.done ? 1 : a.progress)),
)}
<p><small>Labeling ${Number.isFinite(rate) ? (100 * rate).toFixed(1) : "…"}% a minute over the last ${Math.round((Date.now() - t0) / 60e3)} min. Updates every 15 s.</small></p>
<pre style="opacity:.7;white-space:pre-wrap">${real.split("\n").slice(-8).join("\n")}</pre>`,
    usage,
    cores: CORES,
    // the machine's, since the page may be viewed somewhere set to another, like UTC
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    events: evs,
    ahead,
    tracks,
    forecast,
    start: Number.isFinite(start) ? start : null,
  };
}

/**
 * When each milestone of the round finished: a lap's own clock time (`[N min, 12:34]`), a `date`
 * before "round", or else the start's plus the player counts' minutes added up.
 */
function events(real: string) {
  const start = Date.parse(real.slice(0, real.indexOf(" round")));
  if (!Number.isFinite(start)) return [];
  const out: { t: number; name: string }[] = [];
  let labeled = 0;
  for (const line of real.split("\n").slice(1)) {
    const count = line.match(/^\d\d:\d\d (\d) players: .*, ([\d.]+) min$/);
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
type Usage = { t: number; cores: number; load: number; done?: number; temp?: number; watts?: number };
// kept in a file beside the log, so restarting this page doesn't lose it
const USAGE = `${dir}/usage.jsonl`;
const recent = (u: Usage) => Date.now() - u.t < 12 * 3600e3;
const usage: Usage[] = existsSync(USAGE)
  ? readFileSync(USAGE, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .filter(recent)
  : [];
/** The CPU's temperature and the machine's power draw, from `macmon` (`brew install macmon`), if it's installed. */
const heat = (): { temp?: number; watts?: number } => {
  try {
    const m = JSON.parse(execSync("macmon pipe -s 1", { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString());
    return { temp: m.temp.cpu_temp_avg, watts: m.sys_power };
  } catch {
    return {};
  }
};
const sample = () => {
  if (!existsSync(dir)) return;
  const u = { t: Date.now(), cores: working(), load: loadavg()[0], done: labeled, ...heat() };
  usage.push(u);
  appendFileSync(USAGE, JSON.stringify(u) + "\n");
  while (!recent(usage[0])) usage.shift();
};

// The charts are drawn in the page by Observable Plot, from the round's start to its ETA, so the
// gap right of "now" is what's left: each track from 0 to 100%, with a dashed line on to where it
// should finish and a dashed rule where each later stage should, then cores used, the load
// against the core count (dashed), and the CPU's temperature.
const page = (s: ReturnType<typeof status>) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${s.title}</title>
<style>body{font:15px system-ui;background:#3a1430;color:#fff;max-width:36em;margin:2em auto;padding:0 1em}.row{display:flex;justify-content:space-between;align-items:baseline}.track{display:flex;gap:3px;margin:.3em 0 1.2em}.seg{min-width:0;font-size:12px;line-height:1.3}.seg small{display:block}.bar{background:#ffffff26;border-radius:3px;height:10px;margin-bottom:.35em;overflow:hidden}.bar div{background:#de35a2;height:100%;border-radius:6px}h1{font-size:1.4em}small{opacity:.7}#chart{margin-bottom:1.2em}#chart svg{display:block}</style>
<header>${s.head}</header>
<div id="chart"></div>
<main>${s.body}</main>
<script type="module">
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.19/+esm";
const accent = "#de35a2";
const draw = (s) => {
  document.querySelector("header").innerHTML = s.head;
  document.querySelector("main").innerHTML = s.body;
  document.title = s.title;
  const now = Date.now();
  const end = Math.max(now, ...s.ahead.map((a) => a.t));
  const time = (t) => new Date(t);
  const x = { domain: [time(s.start ?? now - 2 * 3600e3), time(end)], label: null, tickFormat: (d) => d.toLocaleTimeString([], { timeZone: s.zone, hour: "numeric", minute: "2-digit" }) };
  const label = { text: "name", frameAnchor: "top", textAnchor: "start", dx: 3, rotate: 90, fontSize: 10 };
  // room on the right for the last point's label once the round is done
  const shared = { width: 576, marginLeft: 40, marginRight: 96, style: { background: "transparent", color: "#fff" }, x };
  const stages = [
    Plot.ruleX(s.events, { x: (e) => time(e.t), stroke: "#fff4" }),
    Plot.ruleX(s.ahead, { x: (a) => time(a.t), stroke: accent, strokeOpacity: 0.6, strokeDasharray: "3 3" }),
    Plot.ruleX([now], { x: time, stroke: "#fff" }),
  ];
  const charts = [
    {
      height: 170,
      y: { domain: [0, 1], label: null, grid: true, tickFormat: "%", ticks: 4 },
      marks: [
        ...stages,
        Plot.text(s.events, { ...label, x: (e) => time(e.t), fill: "#fffc" }),
        Plot.text(s.ahead, { ...label, x: (a) => time(a.t), fill: accent }),
        Plot.text([now], { ...label, x: time, text: () => "now", fill: "#fff", fontWeight: "bold" }),
        s.tracks.map((track) => [Plot.areaY(track, { x: (p) => time(p.t), y: "v", fill: accent, fillOpacity: 0.2 }), Plot.lineY(track, { x: (p) => time(p.t), y: "v", stroke: accent, strokeWidth: 2 })]),
        s.forecast.map((line) => Plot.lineY(line, { x: (p) => time(p.t), y: "v", stroke: accent, strokeWidth: 2, strokeDasharray: "4 4" })),
      ],
    },
    ...[
      ["cores", accent, [0, s.cores], (u) => u.cores.toFixed(1) + " of " + s.cores + " cores", s.cores],
      ["load", "#ffffffcc", [0, Math.max(2 * s.cores, ...s.usage.map((u) => u.load))], (u) => "load " + u.load.toFixed(1), s.cores],
      ["temp", "#ffab91", [30, Math.max(100, ...s.usage.map((u) => u.temp ?? 0))], (u) => Math.round(u.temp) + " °C, " + Math.round(u.watts) + " W"],
    ].map(([key, stroke, domain, name, rule]) => {
      const rows = s.usage.filter((u) => u[key] !== undefined);
      return rows.length
        ? {
            height: 70,
            y: { domain, label: null, grid: true, ticks: 3 },
            marks: [
              rule ? Plot.ruleY([rule], { stroke: "#fff6", strokeDasharray: "3 3" }) : null,
              ...stages,
              Plot.lineY(rows, { x: (u) => time(u.t), y: key, stroke, strokeWidth: 2 }),
              Plot.text(rows.slice(-1), { x: (u) => time(u.t), y: key, text: name, fill: stroke, textAnchor: "start", dx: 6, fontSize: 12, stroke: "#3a1430", strokeWidth: 4 }),
            ],
          }
        : null;
    }),
  ].filter(Boolean);
  // one time axis, under the last chart
  document.querySelector("#chart").replaceChildren(
    ...charts.map((c, i) => {
      const last = i === charts.length - 1;
      return Plot.plot({ ...shared, ...c, marginTop: 6, marginBottom: last ? 24 : 4, height: c.height + (last ? 20 : 0), x: last ? x : { ...x, axis: null } });
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
