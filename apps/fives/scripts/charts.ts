import * as Plot from "@observablehq/plot";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/** Draws the charts in README.md into charts/, from the README's own tables, as in monopoly-deal. */
type Row = Record<string, string>;

const dir = new URL("../charts/", import.meta.url);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const { document } = new JSDOM("").window;

/** The markdown table whose first header cell is `first`, as rows keyed by header. */
function table(first: string): Row[] {
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`| ${first} |`));
  if (start < 0) throw new Error(`no table starting with "${first}"`);
  const cells = (l: string) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
  const head = cells(lines[start]);
  const rows: Row[] = [];
  for (let i = start + 2; lines[i]?.startsWith("|"); i++) rows.push(Object.fromEntries(cells(lines[i]).map((c, j) => [head[j], c])));
  return rows;
}
/** A cell's leading number: "56.8%", "+2.1" or "−0.3". */
const num = (cell: string) => Number(cell.replace("−", "-").match(/^[-+]?[\d.]+/)?.[0]);

/** The booklet's inks: the magenta of the Magenta line, and its blue. */
const art = { magenta: "#de35a2", blue: "#2f5db1", paper: "#ffffff", ink: "#1a1a1a", gray: "#8c8c8c" };
const ns = "http://www.w3.org/2000/svg";

/** Dark mode flips lightness and keeps hue, so paper goes dark and ink light. */
function save(name: string, options: Plot.PlotOptions) {
  const svg = Plot.plot({ document, style: { background: art.paper, color: art.ink }, ...options }) as unknown as SVGSVGElement;
  svg.setAttribute("xmlns", ns);
  const dark = document.createElementNS(ns, "style");
  dark.textContent = "@media (prefers-color-scheme: dark) { :root { filter: invert(1) hue-rotate(180deg); background: none !important } }";
  svg.prepend(dark);
  writeFileSync(new URL(`${name}.svg`, dir), svg.outerHTML + "\n");
}

mkdirSync(dir, { recursive: true });

const counts = [3, 4];
const fair = (players: number) => 100 / players;
const dashed = { stroke: art.ink, strokeDasharray: "3,3" };
const halo = { fill: "currentColor", stroke: art.paper };
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}`;
const fairCell = (r: Row, k: number) => num(r[`${k} players`] ?? r[`${k} players (fair ${fair(k).toFixed(1)}%)`]);
// Player counts are ordered, so they're one hue, light to dark.
const playerColor = { domain: counts.map((k) => `${k} players`), range: ["#e576be", "#8a1462"] };

// The players: each one's wins against the default, as a multiple of a fair share.
const playerRows = table("player");
const kind = (s: string) => (s.includes("playouts") ? art.blue : s.startsWith("learned") ? art.magenta : art.gray);
const players = playerRows.flatMap((r) => counts.map((k) => ({ player: r.player, players: k, shares: fairCell(r, k) / fair(k) })));
save("players", {
  width: 640,
  height: 360,
  marginRight: 260,
  x: { label: "Players", type: "point", domain: counts, padding: 0.4 },
  y: { label: "Wins against the default, in fair shares", grid: true },
  marks: [
    Plot.ruleY([1], dashed),
    Plot.line(players, { x: "players", y: "shares", z: "player", stroke: (d) => kind(d.player), strokeWidth: 2, marker: true }),
    Plot.text(players, Plot.selectLast({ x: "players", y: "shares", z: "player", text: (d) => `${d.player} ${d.shares.toFixed(2)}`, fill: (d) => kind(d.player), textAnchor: "start", dx: 8, stroke: art.paper })),
  ],
});

// The learned player's rounds: each model at a table of the one before it, and against the default, over a fair share.
const versus = ["at a table of the model before", "against the default"];
const roundNames = table("round, against the default").map((r) => r["round, against the default"]);
const rounds = [
  ...table("round").flatMap((r) => counts.map((k) => ({ round: r.round, against: versus[0], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) }))),
  ...table("round, against the default").flatMap((r) => counts.map((k) => ({ round: r["round, against the default"], against: versus[1], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) }))),
];
save("rounds", {
  width: 760,
  height: 320,
  x: { label: "Round", type: "point", domain: roundNames, padding: 0.3, insetLeft: 60 },
  y: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed },
  fx: { label: null, domain: versus },
  color: playerColor,
  marks: [
    Plot.ruleY([0], dashed),
    Plot.line(rounds, { fx: "against", x: "round", y: "over", stroke: "players", strokeWidth: 2, marker: true }),
    Plot.text(
      rounds.filter((d) => d.against === versus[1]),
      Plot.selectFirst({ fx: "against", x: "round", y: "over", z: "players", text: "players", textAnchor: "end", dx: -8, ...halo }),
    ),
  ],
});

// A chip lead: the chance to win by chips ahead of the next best player, a line for each number of hands left.
const ahead = "chips ahead of the next best";
const left = ["3 hands left", "2 hands left", "1 hand left"];
const chips = table(ahead).flatMap((r) => counts.flatMap((k) => left.map((l) => ({ lead: num(r[ahead]), players: `${k} players`, left: l, win: num(r[`${k} players, ${l}`]) }))).filter((d) => !Number.isNaN(d.win)));
save("chips", {
  width: 760,
  height: 320,
  x: { label: "Chips ahead of the next best player", tickFormat: signed },
  y: { label: "Chance to win (%)", grid: true, domain: [0, 100] },
  fx: { label: null },
  marginRight: 90,
  color: { domain: left, range: ["#f0a8d6", "#de35a2", "#8a1462"] },
  marks: [
    Plot.ruleY(counts, { fx: (k) => `${k} players`, y: fair, ...dashed }),
    Plot.line(chips, { fx: "players", x: "lead", y: "win", stroke: "left", strokeWidth: 2, marker: true }),
    Plot.text(chips, Plot.selectLast({ fx: "players", x: "lead", y: "win", z: "left", text: "left", textAnchor: "start", dx: 8, ...halo })),
  ],
});
