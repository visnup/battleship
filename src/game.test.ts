import assert from "node:assert/strict";
import { test } from "node:test";
import { type Card, DECK } from "./cards.ts";
import { defaultPolicy, Game, type Move, mulberry32, needed, type Policy, won } from "./game.ts";

const force = (value: number) => DECK.find((c) => c.kind === "force" && c.value === value)!;
const fate = (kind: Card["kind"]) => DECK.find((c) => c.kind === kind)!;

/** A game whose players play `scripts[seat]` in order, then pass. */
function scripted(hands: Card[][], scripts: ((g: Game) => Move)[][], favor = 0) {
  const policies: Policy[] = scripts.map((s) => ({ ...defaultPolicy, color: () => "pink", move: (g) => (s.length ? s.shift()!(g) : null) }));
  const g = new Game({ players: hands.length, rng: mulberry32(1), policies, first: favor });
  g.players.forEach((p, i) => (p.hand = [...hands[i], force(1)]));
  return g;
}
const play = (c: Card, take?: Card) => () => ({ card: c, take });

test("the deck is 96 cards and the Favor", () => {
  assert.equal(DECK.length, 96);
  const count = (f: (c: Card) => boolean) => DECK.filter(f).length;
  assert.equal(count((c) => c.kind === "force" && c.value === 1), 15);
  for (const v of [2, 3, 4, 5, 6, 10]) assert.equal(count((c) => c.kind === "force" && c.value === v), 8);
  assert.deepEqual(
    ["bait", "fury", "legend", "winter", "crows", "doves"].map((k) => count((c) => c.kind === k)),
    [15, 6, 3, 3, 3, 3],
  );
});

test("everyone is dealt ten cards, plus one a chip at a redeal", () => {
  const g = new Game({ players: 4, rng: mulberry32(1) });
  assert.deepEqual(
    g.players.map((p) => p.hand.length),
    [10, 10, 10, 10],
  );
  g.players[2].chips = [1, 1, 0];
  g.deal();
  assert.deepEqual(
    g.players.map((p) => p.hand.length),
    [10, 10, 12, 10],
  );
});

test("the Favor holder starts with 1 strength, and wins a battle nobody plays in", () => {
  const g = scripted([[], [], []], [[], [], []], 1);
  assert.equal(g.strength(g.players[1]), 1);
  g.battle();
  assert.equal(g.favor, 1);
  assert.deepEqual(g.players[1].chips, [1, 0, 0]);
});

test("the first turn is left of the Favor holder", () => {
  const order: number[] = [];
  const g = new Game({ players: 4, rng: mulberry32(1), first: 2, policies: { ...defaultPolicy, move: (g, p) => (order.push(p.seat), null) } });
  g.battle();
  assert.deepEqual(order, [3, 0, 1, 2]);
});

test("Winter makes every force card 1, Fury doubles force cards, and Legend is always 10", () => {
  const g = scripted([[force(10), fate("fury"), fate("legend")], [fate("winter")]], [[play(force(10)), play(fate("fury")), play(fate("legend"))], [play(fate("winter"))]], 1);
  g.players[0].row = [force(10), fate("fury"), fate("legend")];
  assert.equal(g.strength(g.players[0]), 30);
  g.winter = true;
  assert.equal(g.strength(g.players[0]), 12);
});

test("ties go to fewer cards, then the highest card, then clockwise from the Favor holder", () => {
  const g = new Game({ players: 3, rng: mulberry32(1), first: 0 });
  const [a, b, c] = g.players;
  a.row = [force(4)];
  b.row = [force(2), force(3)];
  c.row = [force(5)];
  assert.equal(g.leader(), 2);
  c.row = [force(1), force(4)];
  b.row = [force(2), force(3)];
  a.row = [force(1), force(3)];
  assert.equal(g.leader(), 2);
  b.row = [force(1), force(4)];
  assert.equal(g.leader(), 1);
});

test("Crows ends the battle, and whoever leads wins it", () => {
  const g = scripted([[force(6)], [fate("crows")], [force(10)]], [[play(force(6))], [play(fate("crows"))], [play(force(10))]], 2);
  g.battle();
  assert.deepEqual(g.players[0].chips, [1, 0, 0]);
  assert.equal(g.favor, 0);
  assert.ok(g.players[2].hand.includes(force(10)));
});

test("Doves ends the battle with no winner, and the Favor and chip stay", () => {
  const g = scripted([[force(6)], [fate("doves")], []], [[play(force(6))], [play(fate("doves"))], []], 2);
  g.battle();
  assert.deepEqual(g.players[0].chips, [0, 0, 0]);
  assert.equal(g.favor, 2);
  assert.equal(g.color, "pink");
});

test("Bait takes back a force card played this battle", () => {
  const g = scripted(
    [[force(6), fate("bait")], [force(10)]],
    [
      [play(force(6)), play(fate("bait"), force(6))],
      [play(force(10))],
    ],
    1,
  );
  g.battle();
  assert.ok(g.players[0].hand.includes(force(6)));
  assert.ok(!g.players[0].hand.includes(fate("bait")));
  assert.deepEqual(g.players[1].chips, [1, 0, 0]);
});

test("Fury once a player and Winter once a battle", () => {
  const g = new Game({ players: 3, rng: mulberry32(1) });
  const p = g.players[0];
  assert.ok(g.playable(p, fate("fury")));
  p.row = [fate("fury")];
  assert.ok(!g.playable(p, fate("fury")));
  assert.ok(g.playable(p, fate("winter")));
  g.winter = true;
  assert.ok(!g.playable(p, fate("winter")));
  assert.ok(!g.playable(g.players[1], fate("bait")));
});

test("a round ends when only one player has cards, which they discard", () => {
  const g = scripted([[force(6)], [force(10)], [force(2)]], [[play(force(6)), play(force(1))], [play(force(10)), play(force(1))], []], 2);
  g.players[2].hand = [force(2), force(3)];
  g.battle();
  assert.equal(g.rounds, 2);
  assert.deepEqual(
    g.players.map((p) => p.hand.length),
    [10, 11, 10],
  );
});

test("passing without force cards can discard the hand", () => {
  const g = scripted([[fate("crows")], [force(10)], [force(2)]], [[], [], []], 2);
  g.players[0].hand = [fate("crows"), fate("doves")];
  g.battle();
  assert.equal(g.players[0].hand.length, 0);
});

test("three of a color or one of each wins", () => {
  assert.ok(won([3, 0, 0]));
  assert.ok(won([1, 1, 1]));
  assert.ok(!won([2, 2, 0]));
  assert.equal(needed([2, 2, 0]), 1);
  assert.equal(needed([0, 0, 0]), 3);
  assert.equal(needed([2, 0, 0]), 1);
});
