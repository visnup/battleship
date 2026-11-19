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

/** The booklet's inks, averaged from its pages: the magenta of the Magenta line, and the orange chip. */
const art = { magenta: "#de35a2", orange: "#eb801d", blue: "#305fb3", paper: "#ffffff", ink: "#1a1a1a", gray: "#8c8c8c" };
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

const counts = [3, 4, 5, 6];
const fair = (players: number) => 100 / players;
const dashed = { stroke: art.ink, strokeDasharray: "3,3" };
const halo = { fill: "currentColor", stroke: art.paper };
const plus = (x: number) => `${x > -0.05 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}`;
const fairCell = (r: Row, k: number) => num(r[`${k} players`] ?? r[`${k} players (fair ${fair(k).toFixed(1)}%)`]);
// Player counts are ordered, so they're one hue, light to dark.
const playerColor = { domain: counts.map((k) => `${k} players`), range: ["#f2b3dc", "#e576be", art.magenta, "#8a1462"] };
const mix = (a: string, b: string, t: number) => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};
// A loss runs to magenta, a gain to blue, through white.
const change = { type: "diverging-sqrt", pivot: 0, interpolate: (t: number) => (t < 0.5 ? mix(art.magenta, art.paper, t * 2) : mix(art.paper, art.blue, t * 2 - 1)) } as const;

/** A rule from 0 and a dot at each row's value, labeled with its signed value, faceted by player count. */
function lollipop(name: string, data: { label: string; players: string; over: number }[], options: Plot.PlotOptions & { xLabel: string }) {
  const order = [...new Set(data.map((d) => d.label))];
  save(name, {
    width: 760,
    height: 60 + order.length * 24,
    ...options,
    x: { label: options.xLabel, grid: true, tickFormat: signed, insetLeft: 40, insetRight: 40 },
    y: { label: null, domain: order },
    fx: { label: null },
    color: change,
    marks: [
      Plot.ruleX([0], dashed),
      Plot.ruleY(data, { fx: "players", y: "label", x1: 0, x2: "over", stroke: "over", strokeWidth: 2 }),
      Plot.dot(data, { fx: "players", y: "label", x: "over", fill: "over", stroke: art.ink, strokeWidth: 0.5, r: 4 }),
      ...[1, -1].map((side) =>
        Plot.text(
          data.filter((d) => (d.over >= 0 ? 1 : -1) === side),
          { fx: "players", y: "label", x: "over", text: (d) => plus(d.over), textAnchor: side > 0 ? "start" : "end", dx: 7 * side, fontSize: 9, ...halo },
        ),
      ),
    ],
  });
}

// Going first: each seat's share of wins, against a fair share.
const seats = table("players").flatMap((r) => [1, 2, 3, 4, 5, 6].map((seat) => ({ players: `${r.players} players`, seat, over: num(r[`seat ${seat}`]) - fair(+r.players) })).filter((d) => !Number.isNaN(d.over)));
save("seats", {
  width: 640,
  height: 300,
  marginRight: 70,
  x: { label: "Seat, the Favor's first", type: "point", domain: [1, 2, 3, 4, 5, 6], padding: 0.4 },
  y: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed, insetTop: 12 },
  color: playerColor,
  marks: [
    Plot.ruleY([0], dashed),
    Plot.line(seats, { x: "seat", y: "over", stroke: "players", strokeWidth: 2, marker: true }),
    // seat 2's four lines meet within a point of each other
    Plot.text(
      seats.filter((d) => d.seat === 2 && d.players === "6 players"),
      { x: "seat", y: "over", text: (d) => plus(d.over), dy: -10, fontSize: 9, ...halo },
    ),
    Plot.text(
      seats.filter((d) => d.seat === 1),
      { x: "seat", y: "over", text: (d) => plus(d.over), textAnchor: "end", dx: -8, fontSize: 9, ...halo },
    ),
    Plot.text(seats, Plot.selectLast({ x: "seat", y: "over", z: "players", text: "players", textAnchor: "start", dx: 8, ...halo })),
  ],
});

// Against strong players: what dropping each rule does with playouts in every other seat.
const strongRows = table("without the rule");
const strongBase = strongRows.find((r) => r["without the rule"] === "today's default")!;
lollipop(
  "strong",
  strongRows.filter((r) => r !== strongBase).flatMap((r) => [3, 6].map((k) => ({ label: r["without the rule"], players: `${k} players`, over: num(r[`${k} players`]) - num(strongBase[`${k} players`]) }))),
  { marginLeft: 300, xLabel: "Wins against playouts, over today's default (points)" },
);

// Which chip to fight over: each way of picking against a fair share.
lollipop(
  "chips",
  table("chip").flatMap((r) => [3, 6].map((k) => ({ label: r.chip, players: `${k} players`, over: fairCell(r, k) - fair(k) }))),
  { marginLeft: 260, xLabel: "Wins over a fair share (points)" },
);

// What each card is worth: wins one more copy in an opening hand adds, by player count.
const cardRows = table("card");
const cards = cardRows.flatMap((r) => counts.map((k) => ({ card: r.card, players: `${k}`, value: num(r[`${k} players`]) })));
save("cards", {
  width: 420,
  height: 40 + cardRows.length * 22,
  marginLeft: 80,
  x: { label: "Players", axis: "top", type: "band" },
  y: { label: null, domain: cardRows.map((r) => r.card) },
  color: change,
  marks: [
    Plot.cell(cards, { x: "players", y: "card", fill: "value", inset: 0.5 }),
    Plot.text(cards, { x: "players", y: "card", text: (d) => plus(d.value), fill: (d) => (Math.abs(d.value) > 4.5 ? art.paper : art.ink), fontSize: 10 }),
  ],
});

// Strategies: each one's wins against the default, as a multiple of a fair share.
const strategyRows = table("strategy");
const kind = (s: string) => (s.startsWith("playouts") ? art.blue : s.startsWith("learned") ? art.magenta : s === "default" ? art.ink : art.gray);
const strategies = strategyRows.flatMap((r) => counts.map((k) => ({ strategy: r.strategy, players: k, shares: fairCell(r, k) / fair(k) })));
save("strategies", {
  width: 640,
  height: 400,
  marginRight: 170,
  x: { label: "Players", type: "point", domain: counts, padding: 0.4 },
  y: { label: "Wins against the default, in fair shares", grid: true },
  marks: [
    Plot.line(strategies, { x: "players", y: "shares", z: "strategy", stroke: (d) => kind(d.strategy), strokeWidth: 2, marker: true }),
    Plot.text(
      strategies.filter((d) => d.players === 3 && d.shares > 0.5),
      { x: "players", y: "shares", text: (d) => d.shares.toFixed(2), textAnchor: "end", dx: -8, fontSize: 8, ...halo },
    ),
    // the losing strategies end within 0.05 of each other, so they share one label
    Plot.text(
      strategies.filter((d) => d.shares > 0.5),
      Plot.selectLast({ x: "players", y: "shares", z: "strategy", text: (d) => `${d.strategy} ${d.shares.toFixed(2)}`, fill: (d) => kind(d.strategy), textAnchor: "start", dx: 8, stroke: art.paper }),
    ),
    Plot.text([{ players: 6, shares: Math.max(...strategies.filter((d) => d.shares <= 0.5 && d.players === 6).map((d) => d.shares)) }], {
      x: "players",
      y: "shares",
      text: () => "spender, no Bait, random, passive",
      textAnchor: "start",
      dx: 8,
      fill: art.gray,
      stroke: art.paper,
    }),
  ],
});

// The learned player's rounds: each model at a table of the one before it, and against the default, over a fair share.
const versus = ["at a table of the model before", "against the default"];
const rounds = [
  ...table("rounds").flatMap((r) => counts.map((k) => ({ rounds: r.rounds, against: versus[0], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) }))),
  ...table("rounds, against the default").flatMap((r) => counts.map((k) => ({ rounds: r["rounds, against the default"], against: versus[1], players: `${k} players`, over: num(r[`${k} players`]) - fair(k) }))),
];
save("rounds", {
  width: 760,
  height: 320,
  x: { label: "Rounds of training", type: "point", domain: table("rounds").map((r) => r.rounds), padding: 0.3, insetLeft: 60 },
  y: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed },
  fx: { label: null, domain: versus },
  color: playerColor,
  marks: [
    Plot.ruleY([0], dashed),
    Plot.line(rounds, { fx: "against", x: "rounds", y: "over", stroke: "players", strokeWidth: 2, marker: true }),
    // the lines start furthest apart in round 3 at a table of the model before
    Plot.text(
      rounds.filter((d) => d.against === versus[0]),
      Plot.selectFirst({ fx: "against", x: "rounds", y: "over", z: "players", text: "players", textAnchor: "end", dx: -8, ...halo }),
    ),
  ],
});
