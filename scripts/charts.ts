import * as Plot from "@observablehq/plot";
import { mkdirSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { CELLS, colOf, rowOf, SHIPS, shipPlacements } from "../src/board.ts";
import { PLACERS } from "../src/fleets.ts";
import { parquet, query } from "../src/results.ts";
import { SHOOTERS } from "../src/shooters.ts";
import { equilibrium } from "./equilibrium.ts";

/** Draws the charts in README.md into charts/, from the raw data in results/. */
type Row = Record<string, any>;

const dir = new URL("../charts/", import.meta.url);
const { document } = new JSDOM("").window;
const ns = "http://www.w3.org/2000/svg";

/** Inks from the box: the plastic ocean grid, red hit pegs, white miss pegs. */
const art = {
  sea: "#0d3b66",
  peg: "#d1242f",
  paper: "#ffffff",
  ink: "#14202b",
  gray: "#8794a1",
};
const between = (...stops: string[]) => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const cs = stops.map(rgb);
  return (t: number) => {
    const i = Math.min(cs.length - 2, Math.floor(t * (cs.length - 1)));
    const u = t * (cs.length - 1) - i;
    return `rgb(${cs[i].map((x, k) => Math.round(x + (cs[i + 1][k] - x) * u)).join(",")})`;
  };
};

/** Renders a plot to charts/`name`.svg, with its color legend above it when `legend` is set. */
function save(name: string, options: Plot.PlotOptions, legend?: { label: string; tickFormat?: string | ((x: number) => string) }) {
  const plot = Plot.plot({ document, style: { background: art.paper, color: art.ink }, ...options }) as unknown as SVGSVGElement;
  let svg = plot;
  if (legend) {
    const key = plot.legend("color", { width: 320, ...legend }) as unknown as SVGSVGElement;
    const [w, h] = ["width", "height"].map((a) => [plot, key].map((s) => +s.getAttribute(a)!));
    svg = document.createElementNS(ns, "svg") as unknown as SVGSVGElement;
    for (const [a, v] of [["width", Math.max(...w)], ["height", h[0] + h[1]], ["viewBox", `0 0 ${Math.max(...w)} ${h[0] + h[1]}`], ["style", `background: ${art.paper}; color: ${art.ink}`]]) {
      svg.setAttribute(a as string, String(v));
    }
    key.setAttribute("x", "20");
    plot.setAttribute("y", String(h[1]));
    svg.append(key, plot);
  }
  svg.setAttribute("xmlns", ns);
  writeFileSync(new URL(`${name}.svg`, dir), svg.outerHTML + "\n");
}

mkdirSync(dir, { recursive: true });

// The sea's blue is how often a cell holds a ship, or how much longer a fleet survives; the pegs'
// red is how much sooner it sinks. Dashed lines are a reference, solid ones zero difference.
// Both step into 10 bins, since a continuous legend needs a canvas and jsdom has none.
const sequential = (max: number) => ({ type: "quantize", n: 10, interpolate: between(art.paper, "#9cc3e4", art.sea), domain: [0, max] }) as const;
const change = (max: number) => ({ type: "quantize", n: 10, interpolate: between(art.peg, art.paper, art.sea), domain: [-max, max] }) as const;
const dashed = { stroke: art.ink, strokeDasharray: "3,3" };
const halo = { fill: "currentColor", stroke: art.paper };
const percent = (x: number, digits = 0) => `${(100 * x).toFixed(digits)}%`;
const plus = (x: number, digits = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;
/** A board: rows A–J down, columns 1–10 across, square cells. */
const grid = (cell = 24) => ({
  x: { domain: [...Array(10).keys()], tickFormat: (c: number) => c + 1, axis: "top", label: null, tickSize: 0 },
  y: { domain: [...Array(10).keys()], tickFormat: (r: number) => "ABCDEFGHIJ"[r], label: null, tickSize: 0 },
  height: cell * 10 + 60,
  width: cell * 10 + 40,
} as const);
const cells = (data: Row[], fill: string, options: Plot.CellOptions = {}) =>
  Plot.cell(data, { x: (r) => colOf(r.cell), y: (r) => rowOf(r.cell), fill, inset: 0.5, ...options });
const ink = (on: (r: Row) => number, at: number) => (r: Row) => (on(r) > at ? art.paper : art.ink);

const games = parquet("games"), shots = parquet("shots");

// Where ships are: the exact chance each cell holds one, over all 30,093,975,536 arrangements.
const total = 30_093_975_536;
const exact = await query(`select ship, cell, arrangements / ${total} p from ${parquet("arrangements")} order by ship, cell`);
const fleet = Map.groupBy(exact, (r) => r.cell);
const heat = [...fleet].map(([cell, rs]) => ({ cell, p: rs.reduce((s, r) => s + r.p, 0) }));
const hottest = Math.max(...heat.map((r) => r.p));
save("heat", {
  ...grid(36),
  color: sequential(0.25),
  marks: [
    cells(heat, "p"),
    Plot.text(heat, { x: (r) => colOf(r.cell), y: (r) => rowOf(r.cell), text: (r) => percent(r.p), fontSize: 9, fill: ink((r) => r.p, hottest * 0.6) }),
  ],
}, { label: "Chance the cell holds a ship", tickFormat: (x: number) => percent(x) });

save("ships", {
  ...grid(14),
  width: 5 * 150,
  height: 190,
  fx: { domain: SHIPS, label: null },
  color: sequential(0.08),
  marks: [cells(exact, "p", { fx: "ship" })],
}, { label: "Chance the cell holds that ship", tickFormat: (x: number) => percent(x, 1) });

// The fleets each placer makes, from a sample of 200,000 each.
const counts = await query(`
  with u as (unpivot ${parquet("placements")} on ${SHIPS.join(", ")} into name ship value p),
  f as (select count(distinct fleet) fleets from ${parquet("placements")})
  select placer, ship, p, count(*) / any_value(fleets) n from u, f group by placer, ship, p`);
const occupancy = new Map<string, number[]>();
for (const r of counts) {
  const h = occupancy.get(r.placer) ?? occupancy.set(r.placer, Array(CELLS).fill(0)).get(r.placer)!;
  for (const c of shipPlacements(SHIPS.indexOf(r.ship))[r.p]) h[c] += r.n;
}
const placed = PLACERS.flatMap((placer) => occupancy.get(placer)!.map((p, cell) => ({ placer, cell, p })));
save("placers", {
  ...grid(14),
  width: 5 * 150,
  height: 190,
  fx: { domain: PLACERS, label: null },
  color: sequential(0.5),
  marks: [cells(placed, "p", { fx: "placer" })],
}, { label: "Chance the cell holds a ship", tickFormat: (x: number) => percent(x) });

const naive = occupancy.get("naive")!.map((p, cell) => ({ cell, d: p - heat[cell].p }));
save("naive", {
  ...grid(30),
  color: change(0.0125),
  marks: [
    cells(naive, "d"),
    Plot.text(naive, { x: (r) => colOf(r.cell), y: (r) => rowOf(r.cell), text: (r) => plus(100 * r.d), fontSize: 8, fill: ink((r) => Math.abs(r.d), 0.007) }),
  ],
}, { label: "Naive placement's chance minus the exact chance (points)", tickFormat: (x: number) => plus(100 * x, 1) });

// How many shots each shooter needs against a uniform fleet.
const counted = await query(`
  select shooter, shots, count(*) / sum(count(*)) over (partition by shooter) p from ${games}
  where placer = 'uniform' and shooter in (${SHOOTERS.map((s) => `'${s}'`)}) group by shooter, shots order by all`);
const means = await query(`select shooter, avg(shots) mean, median(shots) median from ${games} where placer = 'uniform' group by all`);
const peaks = SHOOTERS.map((s) => counted.filter((r) => r.shooter === s).reduce((a, b) => (b.p > a.p ? b : a)));
save("shots", {
  x: { label: "Shots to sink the whole fleet", domain: [17, 100] },
  y: { label: "Chance", tickFormat: "%", grid: true },
  marks: [
    Plot.ruleX([17], dashed),
    Plot.text([17], { x: (d) => d, frameAnchor: "top", text: () => "17 ship cells", textAnchor: "start", dx: 4, fontSize: 8 }),
    Plot.lineY(counted, { x: "shots", y: "p", z: "shooter", stroke: (r) => (r.shooter === "density" ? art.peg : art.ink), strokeWidth: 1.5 }),
    Plot.text(peaks, {
      x: "shots", y: "p", dy: -8, ...halo, textAnchor: (r: Row) => (r.shooter === "random" ? "end" : "middle"),
      text: (r) => `${r.shooter}, ${means.find((m) => m.shooter === r.shooter).mean.toFixed(1)} on average`,
    }),
  ],
});

// How often each shot hits, by shot number, while the game lasts.
const rates = await query(`
  select shooter, shot, avg(avg(hit)) over (partition by shooter order by shot rows between 2 preceding and 2 following) rate
  from ${shots} group by shooter, shot having count(*) >= 500 order by all`);
const lastRate = SHOOTERS.map((s) => rates.filter((r) => r.shooter === s).at(-1));
save("hit-rate", {
  x: { label: "Shot", domain: [1, 100] },
  y: { label: "Chance it hits", tickFormat: "%", grid: true, domain: [0, 1] },
  marks: [
    Plot.ruleY([0.17], dashed),
    Plot.text([0.17], { y: (d) => d, x: 100, text: () => "17 of 100 cells", textAnchor: "end", dy: -6, fontSize: 8 }),
    Plot.lineY(rates, { x: "shot", y: "rate", z: "shooter", stroke: (r) => (r.shooter === "density" ? art.peg : art.ink), strokeWidth: 1.5 }),
    Plot.text(lastRate, { x: "shot", y: "rate", text: "shooter", textAnchor: "start", dx: 6, ...halo }),
  ],
  marginRight: 50,
});

// Where each shooter looks first: the chance it fires at each cell within its first 20 shots.
const games10k = (await query(`select count(distinct game) n from ${shots}`))[0].n;
const early = await query(`select shooter, cell, count(*) / ${games10k} p from ${shots} where shot <= 20 group by all`);
save("first-shots", {
  ...grid(14),
  width: 4 * 150,
  height: 190,
  fx: { domain: SHOOTERS, label: null },
  color: sequential(0.6),
  marks: [cells(early, "p", { fx: "shooter" })],
}, { label: "Chance the cell is fired at within the first 20 shots", tickFormat: (x: number) => percent(x) });

// Every shooter against every placer, as shots more or fewer than the standard game.
const matrix = await query(`select shooter, placer, avg(shots) shots from ${games} group by all`);
const base = matrix.find((r) => r.shooter === "density" && r.placer === "uniform").shots;
const shooterOrder = [...SHOOTERS, ...PLACERS.map((p) => `tuned ${p}`)];
save("matrix", {
  x: { domain: PLACERS, axis: "top", label: null },
  y: { domain: shooterOrder, label: null },
  color: change(25),
  marginLeft: 100,
  width: 520,
  marks: [
    Plot.cell(matrix, { x: "placer", y: "shooter", fill: (r) => r.shots - base, inset: 0.5 }),
    Plot.text(matrix, { x: "placer", y: "shooter", text: (r) => r.shots.toFixed(1), fill: ink((r) => Math.abs(r.shots - base), 15) }),
  ],
}, { label: `Shots to sink the fleet, more or fewer than density against uniform (${base.toFixed(1)})`, tickFormat: (x: number) => plus(x, 0) });

// The best mixes when each side might be found out.
const mix = await equilibrium();
const shares = [
  ...Object.entries(mix.hide).map(([name, p]) => ({ name: `hide ${name}`, p })),
  ...Object.entries(mix.shoot).map(([name, p]) => ({ name: `shoot ${name}`, p })),
].filter((r) => r.p >= 0.005);
save("equilibrium", {
  x: { label: "Share of games", tickFormat: (x: number) => percent(x), domain: [0, 1] },
  y: { label: null, domain: shares.map((r) => r.name) },
  marginLeft: 120,
  marks: [
    Plot.barX(shares, { x: "p", y: "name", fill: art.sea }),
    Plot.text(shares, { x: "p", y: "name", text: (r) => percent(r.p), textAnchor: "start", dx: 4, fontSize: 8 }),
  ],
});

// When each ship goes down.
const sinks = await query(`
  unpivot (select shooter, ${SHIPS.map((s) => `avg(${s}) ${s}`)} from ${games} where placer = 'uniform' and shooter in (${SHOOTERS.map((s) => `'${s}'`)}) group by all)
  on ${SHIPS.join(", ")} into name ship value shot`);
save("sinks", {
  x: { domain: SHIPS, axis: "top", label: null },
  y: { domain: SHOOTERS, label: null },
  color: sequential(100),
  marginLeft: 60,
  width: 520,
  marks: [
    Plot.cell(sinks, { x: "ship", y: "shooter", fill: "shot", inset: 0.5 }),
    Plot.text(sinks, { x: "ship", y: "shooter", text: (r) => r.shot.toFixed(1), fill: ink((r) => r.shot, 60) }),
  ],
}, { label: "Average shot that sinks it" });
