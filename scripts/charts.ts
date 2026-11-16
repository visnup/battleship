import * as Plot from "@observablehq/plot";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/** Draws the charts in README.md into charts/, from the README's own tables. */
type Row = Record<string, string>;

const dir = new URL("../charts/", import.meta.url);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const { document } = new JSDOM("").window;

/** The markdown table whose first header cell is `first`, after the heading `after` if given, as rows keyed by header. */
function table(first: string, after = ""): Row[] {
  const lines = readme.split("\n");
  const from = after ? lines.indexOf(after) : 0;
  const start = lines.findIndex((l, i) => i > from && l.startsWith(first ? `| ${first} |` : "| |"));
  if (start < 0) throw new Error(`no table starting with "${first}"`);
  const cells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim());
  const head = cells(lines[start]);
  const rows: Row[] = [];
  for (let i = start + 2; lines[i]?.startsWith("|"); i++) rows.push(Object.fromEntries(cells(lines[i]).map((c, j) => [head[j], c])));
  return rows;
}
/** A cell's leading number: "56.8%", "+2.1", "−0.3" or "49% (12%)". */
const num = (cell: string) => Number(cell.replace("−", "-").match(/^[-+]?[\d.]+/)?.[0]);
/** The number in parentheses: "49% (12%)" or "+2.8 (−0.2)". */
const paren = (cell: string) => Number(cell.replaceAll("−", "-").match(/\(([-+]?[\d.]+)%?\)/)?.[1]);

/** The cards' own inks: the property colors, sampled from rules/properties.jpg and white-balanced against each card's paper. */
const art = {
  brown: "#6e432c",
  "light blue": "#acd6ef",
  pink: "#ab3970",
  orange: "#cf6a2d",
  red: "#c4261e",
  yellow: "#ffde22",
  green: "#39933c",
  "dark blue": "#184477",
  railroad: "#141414",
  utility: "#c8eac9",
  paper: "#ffffff",
  ink: "#1a1a1a",
  gray: "#8c8c8c",
};
const ns = "http://www.w3.org/2000/svg";

/**
 * Dark mode flips lightness and keeps hue, so paper goes dark and ink light. With `trueColors`,
 * it swaps only paper and ink instead, so property colors stay as printed: dark blue stays dark.
 * (Flipping those back with a second filter works in Chrome, but WebKit ignores CSS filters on
 * SVG elements.)
 */
function save(name: string, options: Plot.PlotOptions, trueColors = false) {
  const svg = Plot.plot({ document, style: { background: art.paper, color: art.ink }, ...options }) as unknown as SVGSVGElement;
  svg.setAttribute("xmlns", ns);
  const dark = document.createElementNS(ns, "style");
  dark.textContent = trueColors
    ? `@media (prefers-color-scheme: dark) { :root { background: ${art.ink} !important; color: ${art.paper} !important } [stroke="${art.ink}"] { stroke: ${art.paper} } [stroke="${art.paper}"] { stroke: ${art.ink} } }`
    : "@media (prefers-color-scheme: dark) { :root { filter: invert(1) hue-rotate(180deg); background: none !important } }";
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
  x: { label: "Seat in turn order", type: "point", domain: [1, 2, 3, 4, 5], padding: 0.4 },
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
  x: { label: "Players", type: "point", domain: counts, padding: 0.4 },
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
  height: 600,
  marginLeft: 380,
  x: { label: "Wins over a fair share (points)", grid: true, tickFormat: signed, insetLeft: 40, insetRight: 30 },
  y: { label: null, domain: variantOrder },
  fx: { label: null },
  color: diverging,
  marks: [
    Plot.ruleX([0], dashed),
    Plot.ruleY(variants, { fx: "players", y: "variant", x1: 0, x2: "over", stroke: "over", strokeWidth: 2 }),
    Plot.dot(variants, { fx: "players", y: "variant", x: "over", fill: "over", stroke: art.ink, strokeWidth: 0.5, r: 4 }),
    ...[1, -1].map((side) =>
      Plot.text(
        variants.filter((d) => (d.over >= 0 ? 1 : -1) === side),
        { fx: "players", y: "variant", x: "over", text: (d) => plus(d.over), textAnchor: side > 0 ? "start" : "end", dx: 7 * side, fontSize: 9, ...halo },
      ),
    ),
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
    Plot.cell(cards, { x: "players", y: "card", fill: "value", inset: 0.5 }),
    Plot.text(cards, { x: "players", y: "card", text: (d) => plus(d.value), fill: (d) => (Math.abs(d.value) > 15 ? art.paper : art.ink), fontSize: 10 }),
  ],
});

// Played or banked: each action card's value banked on the first play, and played.
const usedRows = table("card", "### Played or banked");
const used = usedRows.flatMap((r) =>
  [2, 5].flatMap((k) => {
    const cell = r[`${k} players`];
    return [
      { card: r.card, players: `${k} players`, use: "banked", value: num(cell) },
      { card: r.card, players: `${k} players`, use: "played", value: paren(cell) },
    ];
  }),
);
save("used", {
  width: 760,
  height: 60 + usedRows.length * 20,
  marginLeft: 170,
  x: { label: "Value (points)", grid: true, tickFormat: signed, insetLeft: 10, insetRight: 10 },
  y: { label: null, domain: usedRows.map((r) => r.card) },
  fx: { label: null },
  color: { domain: ["played", "banked"], range: [art["dark blue"], art.gray] },
  marks: [
    Plot.text(
      used.filter((d) => d.card === usedRows[0].card && d.players === "2 players"),
      { fx: "players", y: "card", x: "value", text: "use", fill: "use", dy: -11, fontSize: 10, ...halo },
    ),
    Plot.ruleX([0], dashed),
    Plot.ruleY(
      usedRows.flatMap((r) => [2, 5].map((k) => ({ card: r.card, players: `${k} players`, x1: num(r[`${k} players`]), x2: paren(r[`${k} players`]) }))),
      { fx: "players", y: "card", x1: "x1", x2: "x2", stroke: art.gray, strokeOpacity: 0.5 },
    ),
    Plot.dot(used, { fx: "players", y: "card", x: "value", fill: "use", stroke: art.paper, r: 4 }),
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
    Plot.barX(colors, { fx: "players", y: "color", x: "winners", fill: (d) => art[d.color as keyof typeof art], stroke: art.gray, strokeWidth: 0.5, insetTop: 2, insetBottom: 2 }),
    Plot.tickX(colors, { fx: "players", y: "color", x: "losers", stroke: art.paper, strokeWidth: 4 }),
    Plot.tickX(colors, { fx: "players", y: "color", x: "losers", stroke: art.ink, strokeWidth: 2 }),
  ],
}, true);

// When a game is decided: after each round, how often the player ahead wins, and the one furthest behind.
const decided = table("after round").flatMap((r) =>
  counts.flatMap((k) => {
    const m = r[`${k} players`].match(/: ([\d.]+)% \(([\d.]+)%\)/);
    if (!m) return [];
    return [
      { round: +r["after round"], players: `${k} players`, who: "ahead", wins: +m[1] },
      { round: +r["after round"], players: `${k} players`, who: "behind", wins: +m[2] },
    ];
  }),
);
save("decided", {
  width: 640,
  height: 360,
  marginRight: 70,
  x: { label: "After round", type: "point", padding: 0.4 },
  y: { label: "Goes on to win (%)", grid: true, domain: [0, 100] },
  color: playerColor,
  marks: [
    Plot.line(decided.filter((d) => d.who === "ahead"), { x: "round", y: "wins", stroke: "players", strokeWidth: 2 }),
    Plot.line(decided.filter((d) => d.who === "behind"), { x: "round", y: "wins", stroke: "players", strokeWidth: 2, strokeDasharray: "4,3" }),
    Plot.dot(decided, { x: "round", y: "wins", fill: "players", stroke: art.paper, r: 3 }),
    Plot.text(
      decided.filter((d) => d.round === 4 && d.players === "2 players"),
      { x: "round", y: "wins", text: (d) => (d.who === "ahead" ? "the player ahead" : "the one furthest behind"), dy: -12, ...halo },
    ),
    // 4 and 5 players end a point apart
    ...[-6, 0, 6].map((dy) =>
      Plot.text(
        decided.filter((d) => d.who === "ahead" && (({ "4 players": -6, "5 players": 6 }) as Record<string, number>)[d.players] === (dy || undefined)),
        Plot.selectLast({ x: "round", y: "wins", z: "players", text: "players", textAnchor: "start", dx: 8, dy, ...halo }),
      ),
    ),
  ],
});

// Paying: how often payments cost property, and how many players ever pay in property.
const pays = table("")
  .filter((r) => r[`${counts[0]} players`].endsWith("%"))
  .flatMap((r) => counts.map((k) => ({ measure: r[""], players: k, share: num(r[`${k} players`]) })));
save("paying", {
  width: 640,
  height: 320,
  marginRight: 200,
  x: { label: "Players", type: "point", domain: counts, padding: 0.4 },
  y: { label: "Share (%)", grid: true, domain: [0, 80] },
  marks: [
    Plot.line(pays, { x: "players", y: "share", z: "measure", stroke: art.ink, strokeWidth: 2 }),
    Plot.dot(pays, { x: "players", y: "share", fill: art.ink, stroke: art.paper, r: 4 }),
    Plot.text(pays, Plot.selectLast({ x: "players", y: "share", z: "measure", text: "measure", textAnchor: "start", dx: 8, ...halo })),
  ],
});

// Opening hands: wins in fair shares by how many of each kind of card the opening hand held.
const openings = (["actions", "properties", "money cards"] as const).flatMap((kind) =>
  table(kind).flatMap((r) => counts.map((k) => ({ kind, held: +r[kind], players: `${k} players`, shares: num(r[`${k} players`]) }))),
);
save("openings", {
  width: 760,
  height: 300,
  marginRight: 70,
  x: { label: "In the opening hand", type: "point", padding: 0.3 },
  y: { label: "Wins, in fair shares", grid: true },
  fx: { label: null, domain: ["actions", "properties", "money cards"], padding: 0.3 },
  color: playerColor,
  marks: [
    Plot.ruleY([1], dashed),
    Plot.line(openings, { fx: "kind", x: "held", y: "shares", stroke: "players", strokeWidth: 2 }),
    Plot.dot(openings, { fx: "kind", x: "held", y: "shares", fill: "players", stroke: art.paper, r: 3 }),
    Plot.text(openings.filter((d) => d.kind === "actions"), Plot.selectLast({ fx: "kind", x: "held", y: "shares", z: "players", text: "players", textAnchor: "start", dx: 8, ...halo })),
  ],
});

// Rules questions: how often each other reading changes the winner.
const readingRows = table("reading");
const readings = readingRows.flatMap((r) => counts.map((k) => ({ reading: r.reading, players: `${k}`, changed: num(r[`${k} players`]) })));
save("readings", {
  width: 560,
  height: 40 + readingRows.length * 24,
  marginLeft: 300,
  x: { label: "Players", axis: "top", type: "band" },
  y: { label: null, domain: readingRows.map((r) => r.reading) },
  color: { type: "sqrt", scheme: "Blues", domain: [0, 25] },
  marks: [
    Plot.cell(readings, { x: "players", y: "reading", fill: "changed", inset: 0.5 }),
    Plot.text(readings, { x: "players", y: "reading", text: (d) => `${d.changed.toFixed(1)}%`, fill: (d) => (d.changed > 10 ? art.paper : art.ink), fontSize: 10 }),
  ],
});
