import * as Plot from "@observablehq/plot";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/** Draws the charts in README.md into charts/, from the README's own tables. */
type Row = Record<string, string>;

const dir = new URL("../charts/", import.meta.url);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const { document } = new JSDOM("").window;

/** The markdown table whose first header cell is `first`, as rows keyed by header. */
function table(first: string): Row[] {
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`| ${first} |`));
  if (start < 0) throw new Error(`no table starting with "${first}"`);
  const cells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  const head = cells(lines[start]);
  const rows: Row[] = [];
  for (let i = start + 2; lines[i]?.startsWith("|"); i++) rows.push(Object.fromEntries(cells(lines[i]).map((c, j) => [head[j], c])));
  return rows;
}
/** A cell's leading number: "56.8%", "+2.1", "−0.3" or "49% (12%)". */
const num = (cell: string) => Number(cell.replace("−", "-").match(/^[-+]?[\d.]+/)?.[0]);
/** The number in parentheses: "49% (12%)". */
const paren = (cell: string) => Number(cell.match(/\(([\d.]+)%\)/)?.[1]);

/** The cards' own inks: the property colors, and the black and white of the card faces. */
const art = {
  brown: "#8a4b2d",
  "light blue": "#7ccbef",
  pink: "#d23f8f",
  orange: "#f39223",
  red: "#e2262a",
  yellow: "#f6d300",
  green: "#1f9d55",
  "dark blue": "#1d4f9e",
  railroad: "#2b2b2b",
  utility: "#b9d89a",
  paper: "#ffffff",
  ink: "#1a1a1a",
  gray: "#8c8c8c",
};
const ns = "http://www.w3.org/2000/svg";

function save(name: string, options: Plot.PlotOptions) {
  const svg = Plot.plot({ document, style: { background: art.paper, color: art.ink }, ...options }) as unknown as SVGSVGElement;
  svg.setAttribute("xmlns", ns);
  // Dark mode flips lightness and keeps hue: paper goes dark, ink light, and the colors stay put.
  const dark = document.createElementNS(ns, "style");
  dark.textContent = "@media (prefers-color-scheme: dark) { :root { filter: invert(1) hue-rotate(180deg); background: none !important } }";
  svg.prepend(dark);
  writeFileSync(new URL(`${name}.svg`, dir), svg.outerHTML + "\n");
}

mkdirSync(dir, { recursive: true });

const counts = [2, 3, 4, 5];
const fair = (players: number) => 100 / players;
const dashed = { stroke: art.ink, strokeDasharray: "3,3" };
const halo = { fill: "currentColor", stroke: art.paper };
const plus = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}`;
// Player counts are ordered, so they're one hue, light to dark.
const playerColor = { domain: counts.map((k) => `${k} players`), range: ["#9ecae1", "#4292c6", "#2171b5", "#08306b"] };
const diverging = { type: "diverging", scheme: "RdYlGn", pivot: 0 } as const;

// Going first: each seat's share of wins, against a fair share.
const seats = table("players").flatMap((r) =>
  ["first", "second", "third", "fourth", "fifth"]
    .map((seat, i) => ({ players: `${r.players} players`, seat: i + 1, over: num(r[seat]) - fair(+r.players) }))
    .filter((d) => !Number.isNaN(d.over)),
);
save("seats", {
  width: 640,
  height: 300,
  marginRight: 70,
  x: { label: "Seat in turn order", ticks: [1, 2, 3, 4, 5], tickFormat: "d" },
  y: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed },
  color: playerColor,
  marks: [
    Plot.ruleY([0], dashed),
    Plot.line(seats, { x: "seat", y: "over", stroke: "players", strokeWidth: 2 }),
    Plot.dot(seats, { x: "seat", y: "over", fill: "players", stroke: art.paper, r: 4 }),
    Plot.text(seats, Plot.selectLast({ x: "seat", y: "over", z: "players", text: "players", textAnchor: "start", dx: 8, ...halo })),
  ],
});

// Which strategy wins: each strategy's wins as a multiple of a fair share, by player count.
const strategies = table("strategy").flatMap((r) =>
  counts.map((k) => ({ strategy: r.strategy, players: k, shares: num(r[`${k} players (fair ${fair(k).toFixed(1)}%)`]) / fair(k) })),
);
save("strategies", {
  width: 640,
  height: 360,
  marginRight: 80,
  x: { label: "Players", ticks: counts, tickFormat: "d" },
  y: { label: "Wins, in fair shares", grid: true },
  marks: [
    Plot.ruleY([1], dashed),
    Plot.line(strategies, { x: "players", y: "shares", z: "strategy", stroke: (d) => (d.strategy === "playouts" ? art["dark blue"] : d.strategy === "default" ? art.ink : art.gray), strokeWidth: 2 }),
    Plot.dot(strategies, { x: "players", y: "shares", fill: (d) => (d.strategy === "playouts" ? art["dark blue"] : d.strategy === "default" ? art.ink : art.gray), stroke: art.paper, r: 4 }),
    // banker and default end within 0.01 of each other, and so do random and pacifist
    ...[-7, 0, 7].map((dy) =>
      Plot.text(
        strategies.filter((d) => (({ banker: -7, random: -7, default: 7, pacifist: 7 }) as Record<string, number>)[d.strategy] === dy || (dy === 0 && !["banker", "random", "default", "pacifist"].includes(d.strategy))),
        Plot.selectLast({ x: "players", y: "shares", z: "strategy", text: "strategy", textAnchor: "start", dx: 8, dy, ...halo }),
      ),
    ),
  ],
});

// Playing well: each variant's wins against a fair share, at 2 and 5 players.
const variantRows = table("variant").filter((r) => r["2 players (fair 50.0%)"]);
const variants = variantRows.flatMap((r) =>
  [2, 5].map((k) => ({ variant: r.variant, players: `${k} players`, over: num(r[`${k} players (fair ${fair(k).toFixed(1)}%)`]) - fair(k) })),
);
const variantOrder = variantRows.map((r) => r.variant);
save("variants", {
  width: 760,
  height: 520,
  marginLeft: 380,
  x: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed },
  y: { label: null, domain: variantOrder },
  fx: { label: null },
  color: diverging,
  marks: [
    Plot.ruleX([0], dashed),
    Plot.ruleY(variants, { fx: "players", y: "variant", x1: 0, x2: "over", stroke: "over", strokeWidth: 2 }),
    Plot.dot(variants, { fx: "players", y: "variant", x: "over", fill: "over", stroke: art.ink, strokeWidth: 0.5, r: 4 }),
  ],
});

// What each card is worth: wins one more copy in an opening hand adds, by player count.
const cardRows = table("card");
const cards = cardRows.flatMap((r) => counts.map((k) => ({ card: r.card, players: `${k}`, value: num(r[`${k} players`]) })));
save("cards", {
  width: 520,
  height: 40 + cardRows.length * 18,
  marginLeft: 240,
  x: { label: "Players", axis: "top", type: "band" },
  y: { label: null, domain: cardRows.map((r) => r.card) },
  color: { ...diverging, type: "diverging-sqrt" },
  marks: [
    Plot.cell(cards, { x: "players", y: "card", fill: "value", inset: 1 }),
    Plot.text(cards, { x: "players", y: "card", text: (d) => plus(d.value), fill: (d) => (Math.abs(d.value) > 15 ? art.paper : art.ink), fontSize: 10 }),
  ],
});

// Which colors to chase: how often each color is a full set in the winner's hand, and a loser's.
const colorRows = table("color");
const colors = colorRows.flatMap((r) => counts.map((k) => ({ color: r.color, players: `${k} players`, winners: num(r[`${k} players`]), losers: paren(r[`${k} players`]) })));
save("colors", {
  width: 760,
  height: 300,
  marginLeft: 80,
  x: { label: "Games ending with it as a full set (%)", grid: true },
  y: { label: null, domain: colorRows.map((r) => r.color) },
  fx: { label: null },
  marks: [
    Plot.barX(colors, { fx: "players", y: "color", x: "winners", fill: (d) => art[d.color as keyof typeof art], stroke: art.ink, strokeWidth: 0.5, insetTop: 2, insetBottom: 2 }),
    Plot.tickX(colors, { fx: "players", y: "color", x: "losers", stroke: art.ink, strokeWidth: 2 }),
  ],
});
