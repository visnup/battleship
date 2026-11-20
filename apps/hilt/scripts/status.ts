import { execSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { availableParallelism, loadavg } from "node:os";
import { parseArgs } from "node:util";

// A page at http://localhost:3002 (monopoly-deal's is 3001) showing how far a round (`round.sh`)
// has got: the newest one in dataset/, or `--round N`. The round says what it is in `run.json`
// and when each stage started and ended in `events.jsonl`; this adds games labeled so far from
// the data's shards and an ETA from the recent rate. It only reads the round's files, so it can't
// disturb it. Adapted from monopoly-deal's.

const { values: args } = parseArgs({ options: { round: { type: "string" }, port: { type: "string", default: "3002" } } });

type Run = { round: string; prev: string; start: number; games: number; trees: number; data: string; compares: number; stages: string[] };
type Event = { t: number; stage: string; state: "start" | "done" | "skipped" | "failed" };
type Usage = { t: number; cores: number; load: number; done?: number; temp?: number; watts?: number };

const jsonl = <T>(file: string): T[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const read = (round: string): Run | undefined => {
  try {
    return JSON.parse(readFileSync(`dataset/r${round}/run.json`, "utf8"));
  } catch {
    // no run.json, or a smoke test's round deleted since it was listed
  }
};
/** The round started last. */
const newest = () =>
  readdirSync("dataset")
    .flatMap((d) => (/^r\d/.test(d) ? (read(d.slice(1)) ?? []) : []))
    .sort((a, b) => a.start - b.start)
    .at(-1);

// rough minutes for each player count's games, from round 8, which weigh them in the labeling
const COUNTS = [
  [3, 19],
  [4, 9],
  [5, 13],
  [6, 17],
] as const;
const WEIGHT = COUNTS.reduce((s, [, m]) => s + m, 0);
// minutes a stage takes, when the round before didn't time it, from round 8
const MINUTES: Record<string, number> = { data: WEIGHT, train: 5, compare: 8, "train 200": 2 };
/** How long each stage of `round` took, in minutes. */
const durations = (round: string) => {
  const evs = jsonl<Event>(`dataset/r${round}/events.jsonl`);
  return new Map(evs.flatMap((e) => (e.state === "done" ? [[e.stage, (e.t - evs.find((s) => s.stage === e.stage && s.state === "start")!.t) / 60e3] as const] : [])));
};

/** How far along a running stage is, from what it has written, when that says. */
const progress = (run: Run, stage: string) => {
  const dir = `dataset/r${run.round}`;
  const trees = (file: string, of: number) => {
    const done = existsSync(file) && [...readFileSync(file, "utf8").matchAll(/^\[(\d+)\]/gm)].at(-1);
    return done ? Number(done[1]) / of : undefined;
  };
  if (stage === "train") return trees(`${dir}/trees.txt`, run.trees);
  if (stage === "compare") return existsSync(`${dir}/compare.txt`) ? (readFileSync(`${dir}/compare.txt`, "utf8").match(/^\| learned /gm)?.length ?? 0) / run.compares : 0;
  if (stage === "train 200") return trees(`${dir}/trees-200.txt`, 200);
};

/** Games finished in each shard of `players`, from the game number on its last row. */
function played(data: string, players: number) {
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

const CORES = availableParallelism();
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const mins = (m: number) => (Math.round(m) ? `${Math.round(m)} min` : "<1 min");
type Point = { t: number; v: number };

function status() {
  const run = args.round ? read(args.round) : newest();
  // the machine's zone, since the page may be viewed somewhere set to another, like UTC
  const base = { cores: CORES, zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (!run) {
    const what = args.round ? `dataset/r${args.round}/run.json` : "round with a run.json in dataset/";
    return {
      ...base,
      title: "No round",
      head: `<h1>No ${what}</h1>`,
      body: "<p>scripts/round.sh writes one when it starts.</p>",
      usage: [] as Usage[],
      events: [],
      ahead: [],
      tracks: [],
      forecast: [],
      start: null,
      live: undefined,
      labeled: 0,
    };
  }
  const dir = `dataset/r${run.round}`;
  const now = Date.now();
  const evs = jsonl<Event>(`${dir}/events.jsonl`);
  const usage = jsonl<Usage>(`${dir}/usage.jsonl`);
  const before = durations(run.prev);
  const stages = run.stages
    .map((name) => {
      const of = evs.filter((e) => e.stage === name);
      const t0 = of.find((e) => e.state === "start")?.t;
      const end = of.find((e) => e.state !== "start");
      const min = before.get(name) ?? MINUTES[name] ?? 7;
      const running = t0 !== undefined && !end;
      return { name, min, t0, t1: end?.t, state: end?.state ?? (running ? "running" : "pending"), f: end?.state === "done" ? 1 : running ? Math.min(progress(run, name) ?? (now - t0) / 60e3 / min, 0.99) : 0 };
    })
    .filter((s) => s.state !== "skipped");
  const failed = stages.find((s) => s.state === "failed");
  const live = !failed && stages.some((s) => s.state !== "done");

  // labeling, weighted by each player count's minutes: its games so far, and the rate over the last 15 minutes
  const data = stages.find((s) => s.name === "data");
  const counts = COUNTS.map(([p, weight]) => ({ p, weight, games: data?.state === "done" ? run.games : data?.t0 ? Math.min(played(run.data, p), run.games) : 0 }));
  const labeled = counts.reduce((s, c) => s + (c.weight * c.games) / run.games, 0) / WEIGHT;
  const series: Point[] = data?.t0 ? [{ t: data.t0, v: 0 }, ...usage.flatMap((u) => (u.done && u.t > data.t0! && u.t < (data.t1 ?? now) ? [{ t: u.t, v: u.done }] : [])), { t: data.t1 ?? now, v: labeled }] : [];
  const from = series.find((p, i) => now - p.t < 15 * 60e3 && (now - p.t > 3 * 60e3 || i === 0)) ?? series.findLast((p) => now - p.t > 3 * 60e3) ?? series[0];
  const rate = from && data?.state === "running" ? (labeled - from.v) / ((now - from.t) / 60e3) : NaN;
  if (data?.state === "running") data.f = Math.min(labeled, 0.99);
  /** Minutes a stage still needs: the labeling by its rate once there is one, the rest by how long they usually take. */
  const left = (s: (typeof stages)[number]) => (s.state === "done" ? 0 : s === data && rate > 0 ? (1 - labeled) / rate : s.min * (1 - s.f));

  // two tracks, each 0 to 100%: the labeling, and what comes after
  const at = stages.indexOf(data!);
  const groups = [
    { name: "Label games", stages: data ? [data] : [] },
    { name: "Train and compare", stages: stages.slice(at + 1) },
  ].filter((g) => g.stages.length);
  let t = now;
  const ahead: { t: number; name: string }[] = [];
  const tracks: Point[][] = [];
  const forecast: Point[][] = [];
  const html = groups.map((g) => {
    const total = g.stages.reduce((s, a) => s + a.min, 0);
    const f = g.stages.reduce((s, a) => s + a.min * a.f, 0) / total;
    const begun = g.stages[0].t0;
    const complete = g.stages.every((s) => s.state === "done");
    // the track over time: the labeling as sampled, the others a point as each stage ends
    let spent = 0;
    const track: Point[] =
      g.stages[0] === data ? series : begun ? [{ t: begun, v: 0 }, ...g.stages.flatMap((s) => (s.state === "done" ? [{ t: s.t1!, v: (spent += s.min) / total }] : [])), ...(complete ? [] : [{ t: now, v: f }])] : [];
    tracks.push(track);
    const starts = t;
    for (const s of g.stages) if (s.state !== "done") ahead.push({ t: (t += left(s) * 60e3), name: s.name });
    if (!complete && !failed) forecast.push([track.at(-1) ?? { t: starts, v: 0 }, { t, v: 1 }]);
    const segs = g.stages.flatMap((s) => {
      const note = s.state === "done" ? mins((s.t1! - s.t0!) / 60e3) : s.state === "failed" ? "failed" : s.state === "running" ? `~${Math.ceil(left(s))} min left` : `~${mins(s.min)}`;
      return s === data
        ? counts.map((c) => [c.weight, `${c.p} players`, c.games === run.games ? "" : c.games ? `${c.games.toLocaleString()} of ${run.games.toLocaleString()}` : "", c.games / run.games] as const)
        : [[s.min, s.name, note, s.f] as const];
    });
    const note =
      g.stages[0] === data && data.state !== "pending" ? (data.state === "done" ? mins((data.t1! - data.t0!) / 60e3) : `${Math.round(100 * f)}%, ~${Math.ceil(left(data))} min left`) : `${Math.round(100 * f)}%`;
    return `<div class="row"><span>${g.name}</span><small>${note}</small></div><div class="track">${segs
      .map(([weight, name, note, f]) => `<div class="seg" style="flex:${weight} 1 4em"><div class="bar"><div style="width:${(100 * Math.min(1, f)).toFixed(1)}%"></div></div>${name}<small>${note}</small></div>`)
      .join("")}</div>`;
  });
  const eta = (t - now) / 60e3;
  const state = failed
    ? `failed at ${failed.name}`
    : live
      ? `done ~${clock(t)} <small>(${Math.round(eta)} min)</small>`
      : `done at ${clock(stages.at(-1)!.t1!)} <small>(${mins((stages.at(-1)!.t1! - run.start) / 60e3)})</small>`;
  const log = existsSync(`${dir}/log.txt`) ? readFileSync(`${dir}/log.txt`, "utf8").trim().split("\n").slice(-8).join("\n") : "";
  return {
    ...base,
    title: `Round ${run.round} · ${failed ? "failed" : live ? `${Math.round(eta)} min` : "done"}`,
    head: `<h1>Round ${run.round}: ${state}</h1>`,
    body: `${html.join("\n")}
<p><small>${rate > 0 ? `Labeling ${(100 * rate).toFixed(1)}% a minute over the last ${Math.round((now - from.t) / 60e3)} min. ` : ""}Updates every 15 s.</small></p>
<pre style="opacity:.7;white-space:pre-wrap">${log.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`,
    usage: usage.filter((u) => u.t >= run.start),
    events: stages.flatMap((s) => (s.state === "done" ? [{ t: s.t1!, name: s.name }] : [])),
    ahead: failed ? [] : ahead,
    tracks,
    forecast,
    start: run.start,
    live: live ? dir : undefined,
    labeled,
  };
}

/** The CPU's temperature and the machine's power draw, from `macmon` (`brew install macmon`), if it's installed. */
const heat = (): { temp?: number; watts?: number } => {
  try {
    const m = JSON.parse(execSync("macmon pipe -s 1", { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString());
    return { temp: m.temp.cpu_temp_avg, watts: m.sys_power };
  } catch {
    return {};
  }
};
/** A round that's still running gets a line in its `usage.jsonl`, so restarting this page loses nothing. */
const sample = () => {
  const s = status();
  if (!s.live) return;
  const u: Usage = { t: Date.now(), cores: working(), load: loadavg()[0], done: s.labeled, ...heat() };
  if (existsSync(s.live)) appendFileSync(`${s.live}/usage.jsonl`, JSON.stringify(u) + "\n");
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
  // a round still running runs on to its ETA; one that's over ends at the last thing it wrote
  const running = s.ahead.length ? [now] : [];
  const end = Math.max(...running, ...s.ahead.map((a) => a.t), ...s.events.map((e) => e.t), ...s.usage.map((u) => u.t), s.start ?? now);
  const time = (t) => new Date(t);
  const x = { domain: [time(s.start ?? now - 2 * 3600e3), time(end)], label: null, tickFormat: (d) => d.toLocaleTimeString([], { timeZone: s.zone, hour: "numeric", minute: "2-digit" }) };
  const label = { text: "name", frameAnchor: "top", textAnchor: "start", dx: 3, rotate: 90, fontSize: 10 };
  // room on the right for the last point's label once the round is done
  const shared = { width: 576, marginLeft: 40, marginRight: 96, style: { background: "transparent", color: "#fff" }, x };
  const stages = [
    Plot.ruleX(s.events, { x: (e) => time(e.t), stroke: "#fff4" }),
    Plot.ruleX(s.ahead, { x: (a) => time(a.t), stroke: accent, strokeOpacity: 0.6, strokeDasharray: "3 3" }),
    Plot.ruleX(running, { x: time, stroke: "#fff" }),
  ];
  const charts = [
    {
      height: 170,
      y: { domain: [0, 1], label: null, grid: true, tickFormat: "%", ticks: 4 },
      marks: [
        ...stages,
        Plot.text(s.events, { ...label, x: (e) => time(e.t), fill: "#fffc" }),
        Plot.text(s.ahead, { ...label, x: (a) => time(a.t), fill: accent }),
        Plot.text(running, { ...label, x: time, text: () => "now", fill: "#fff", fontWeight: "bold" }),
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

sample();
setInterval(sample, 30e3);
createServer((req, res) => {
  const s = status();
  if (req.url === "/status") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(s));
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(page(s));
}).listen(Number(args.port), () => console.log(`http://localhost:${args.port}`));
