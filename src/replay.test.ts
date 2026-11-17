import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, mulberry32, name } from "./game.ts";
import { deal, replay } from "./replay.ts";

const setup = (players: number, seed: number, bots: boolean) => ({ players, seed, first: seed % players, bots: Array(players).fill(bots) });

test("bots replay the default player's game", () => {
  for (const seed of [1, 2, 3, 4]) {
    const players = 2 + (seed % 4);
    const game = new Game({ players, rng: mulberry32(seed), first: seed % players });
    const dealt = game.draw.map(name);
    const expected = game.run();
    const { result, decisions } = replay(setup(players, seed, true), []);
    assert.deepEqual(result, expected);
    assert.deepEqual(deal(seed).slice(5 * players), dealt);
    assert.ok(decisions.length > 20);
  }
});

test("people's decisions replay the same game, and it waits for each", () => {
  for (const seed of [5, 6, 7]) {
    const players = 2 + (seed % 4);
    const all = replay(setup(players, seed, true), []);
    const log = all.decisions.map((d) => d.choice);
    const kinds = new Set(log.map((c) => c.kind));
    assert.ok(kinds.has("move") && kinds.has("pay"), [...kinds].join());
    assert.deepEqual(replay(setup(players, seed, false), log).result, all.result);
    for (const k of [0, 7, Math.floor(log.length / 2), log.length - 1]) {
      const { prompt, decisions } = replay(setup(players, seed, false), log.slice(0, k));
      assert.equal(prompt?.kind, log[k].kind);
      assert.equal(prompt?.seat, log[k].seat);
      assert.deepEqual(
        decisions.map((d) => d.choice),
        k ? [log[k - 1]] : [],
      );
    }
  }
});

test("a property can't be laid down as another color", () => {
  const seed = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => {
    const { game, prompt } = replay(setup(2, s, false), []);
    return game.players[prompt!.seat].hand.some((c) => c.kind === "property");
  })!;
  const { game, prompt } = replay(setup(2, seed, false), []);
  const p = game.players[prompt!.seat];
  const card = p.hand.findIndex((c) => c.kind === "property");
  const own = (p.hand[card] as { color: string }).color;
  const as = (color: string) => replay(setup(2, seed, false), [{ kind: "move", seat: p.seat, move: { type: "place", card, color } }]);
  assert.throws(() => as(own === "brown" ? "darkBlue" : "brown"), /can't place/);
  assert.equal(as(own).game.players[p.seat].props[0].color, own);
});

test("an illegal decision is refused", () => {
  const { prompt } = replay(setup(2, 1, false), []);
  assert.equal(prompt?.kind, "move");
  assert.throws(() => replay(setup(2, 1, false), [{ kind: "move", seat: prompt!.seat, move: { type: "bank", card: 99 } }]), /no such card/);
  assert.throws(() => replay(setup(2, 1, false), [{ kind: "pay", seat: prompt!.seat, paid: [] }]), /wants move/);
});
