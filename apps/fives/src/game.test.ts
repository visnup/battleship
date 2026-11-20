import assert from "node:assert/strict";
import { test } from "node:test";
import { type Card, type Color, DECK, deck } from "./cards.ts";
import { face, Game, mulberry32, type Play, type Policy } from "./game.ts";

const card = (color: Color, value: number) => DECK.find((c) => c.color === color && c.value === value)!;
const [B, G, S, M] = (["blue", "green", "silver", "magenta"] as const).map((color) => (value: number) => card(color, value));
const up = (c: Card): Play => ({ card: c, down: false });
const down = (c: Card): Play => ({ card: c, down: true });

/** A game with `hands` dealt, seat `lead` to play first. */
function dealt(hands: Card[][], lead = 0, policies?: Policy[]) {
  const g = new Game({ players: hands.length, rng: mulberry32(1), policies });
  g.players.forEach((p, i) => (p.hand = [...hands[i]]));
  g.current = lead;
  return g;
}
const same = (a: Play[], b: Play[]) => assert.deepEqual(new Set(a.map((x) => `${x.card.color} ${x.card.value} ${x.down}`)), new Set(b.map((x) => `${x.card.color} ${x.card.value} ${x.down}`)));

test("52 cards: 1 to 13 in three colors, and magenta without its 5; 36 at 3 players", () => {
  assert.equal(DECK.length, 52);
  assert.ok(!DECK.some((c) => c.color === "magenta" && c.value === 5));
  assert.equal(deck(3).length, 36);
  assert.ok(deck(3).every((c) => c.value < 10));
});

test("13 cards each at 4 players and 12 at 3, everyone with 5 chips, and the magenta 0 leads", () => {
  for (const n of [3, 4]) {
    const g = new Game({ players: n, rng: mulberry32(n) });
    assert.deepEqual(
      g.players.map((p) => [p.hand.length, p.chips]),
      Array(n).fill([n === 4 ? 13 : 12, 5]),
    );
    assert.ok(g.players[g.current].hand.includes(M(0)));
  }
});

test("the highest of the led color wins, and those without it play anything", () => {
  // the booklet's first example: blue 5 led, blue 2, green 9, blue 8
  const g = dealt([
    [B(5), B(1)],
    [B(2), G(1)],
    [G(9), G(2)],
    [B(8), S(1)],
  ]);
  same(g.legal(g.players[2]), [up(G(9)), up(G(2)), down(G(9)), down(G(2))]);
  for (const p of [up(B(5)), up(B(2)), up(G(9)), up(B(8))]) g.step(p);
  assert.equal(g.current, 3);
  assert.deepEqual(g.players[3].won, [up(B(8))]);
  assert.deepEqual(g.players[2].voids, ["blue"]);
});

test("silver is trump", () => {
  const g = dealt([
    [B(4), B(1)],
    [S(2), S(1)],
    [B(8), G(1)],
    [B(5), G(2)],
  ]);
  for (const p of [up(B(4)), up(S(2)), up(B(8)), up(B(5))]) g.step(p);
  assert.equal(g.current, 1);
});

test("a magenta 5 face down: led makes everyone follow magenta, and it can win", () => {
  // the booklet: silver 5 played as a magenta 5 leads; magenta 1, blue 3, magenta 7
  const g = dealt([
    [S(5), S(1)],
    [M(1), G(1)],
    [B(3), G(2)],
    [M(7), M(2)],
  ]);
  g.step(down(S(5)));
  same(g.legal(g.players[1]), [up(M(1))]);
  for (const p of [up(M(1)), up(B(3)), up(M(7))]) g.step(p);
  assert.equal(g.current, 3);
});

test("following magenta, any card can go face down, even holding magenta", () => {
  const g = dealt([
    [M(7), S(1)],
    [S(4), M(1)],
    [G(8), G(2)],
    [M(2), B(1)],
  ]);
  g.step(up(M(7)));
  same(g.legal(g.players[1]), [up(M(1)), down(S(4)), down(M(1))]);
  g.step(down(S(4)));
  // only one magenta 5 a trick
  same(g.legal(g.players[2]), [up(G(8)), up(G(2))]);
});

test("the last card of the led color must be played, but can be flipped", () => {
  const g = dealt([
    [S(4), B(1)],
    [S(6), S(1)],
    [B(13), G(1)],
    [S(9), M(2)],
  ]);
  g.step(up(S(4)));
  same(g.legal(g.players[1]), [up(S(6)), up(S(1))]);
  g.step(up(S(6)));
  g.step(up(B(13)));
  same(g.legal(g.players[3]), [up(S(9)), down(S(9))]);
  g.step(down(S(9)));
  assert.equal(g.current, 1);
  assert.deepEqual(g.players[3].voids, ["silver"]);
});

/** Scores a hand where each seat won `wins`, with `chips` before it. */
function scored(wins: (Card | Play)[][], chips = wins.map(() => 5), pot = 0, hand = 1) {
  const g = new Game({ players: wins.length, rng: mulberry32(1) });
  g.players.forEach((p, i) => {
    const won = wins[i].map((w) => ("card" in w ? w : up(w)));
    Object.assign(p, { won, points: won.reduce((s, w) => s + face(w).value, 0), chips: chips[i], hand: [] });
  });
  Object.assign(g, { pot, hand });
  g.score();
  return g;
}

test("the booklet's scoring example: 26 busts, 25 exactly takes 3+1+1, and two 22s tie for third", () => {
  const g = scored([
    [B(10), B(12), G(4)],
    [M(13), S(12)],
    [G(10), G(2), S(5), down(B(11))],
    [S(9), S(1), S(6), M(6)],
  ]);
  assert.deepEqual(g.scores[0].totals, [26, 25, 22, 22]);
  assert.deepEqual(g.scores[0].gained, [-1, 5, 1, 1]);
});

test("ties take the lowest place, and a bust with the best tied goes to the pot, then the next hand's closest", () => {
  const g = scored([[B(13), B(12), B(1)], [B(10), B(11)], [G(10), G(11)], [G(1)]]);
  // 26 busts; 21 and 21 tie for first, so both take second
  assert.deepEqual(g.scores[0].gained, [-1, 2, 2, 1]);
  assert.equal(g.pot, 1);
  const next = scored([[B(1)], [B(2)], [B(3)], [B(4)]], [4, 7, 7, 6], 1, 2);
  assert.deepEqual(next.scores[0].gained, [0, 1, 2, 4]);
  assert.equal(next.pot, 0);
});

test("3 players: 2 for the closest, 1 for second", () => {
  const g = scored([[B(9), B(8), G(8)], [B(7)], [G(9), G(7), M(9), M(1)]]);
  // 2 for the closest, 1 for 25 exactly, and the bust's chip
  assert.deepEqual(g.scores[0].gained, [4, 1, -1]);
});

test("a bust with no chips gives nothing", () => {
  const g = scored([[B(13), B(12), B(1)], [B(1)], [B(2)], [B(3)]], [0, 5, 5, 5]);
  assert.deepEqual(g.scores[0].gained, [0, 1, 2, 3]);
});

test("four hands, then the most chips wins, then the closest to 25 in the last hand", () => {
  const g = scored([[B(9)], [B(8)], [B(7)], [B(6)]], [5, 6, 7, 8], 0, 4);
  // everyone ends on 8, and seat 0's 9 was closest
  assert.deepEqual(g.winners, [0]);
  const tie = scored([[B(9)], [B(8)], [B(7)], [B(6)]], [5, 7, 8, 10], 0, 4);
  assert.deepEqual(
    tie.players.map((p) => p.chips),
    [8, 9, 9, 10],
  );
  assert.deepEqual(tie.winners, [3]);
  const close = scored([[B(9)], [B(8)], [B(7)], [B(6)]], [5, 7, 7, 4], 0, 4);
  assert.deepEqual(close.winners, [1]);
});

test("a whole game plays out with every play legal", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = new Game({ players: 3 + (seed % 2), rng: mulberry32(seed) });
    const r = g.run();
    assert.ok(r.winners!.length >= 1);
    assert.equal(g.scores.length, 4);
  }
});
