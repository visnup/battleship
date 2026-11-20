import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, mulberry32 } from "./game.ts";
import { replay, type Setup } from "./replay.ts";
import { review } from "./review.ts";

test("bots replay a game as it plays, and people making the same decisions do too", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const players = 3 + (seed % 2);
    const bots = Array(players).fill("default");
    const played = replay({ players, seed, bots }, []);
    const direct = new Game({ players, rng: mulberry32(seed) }).run();
    assert.deepEqual(played.result?.winners, direct.winners);
    assert.equal(played.tricks.length, 4 * (players === 3 ? 12 : 13));
    const again = replay({ players, seed, bots: bots.map(() => false) }, played.decisions);
    assert.equal(again.prompt, undefined);
    assert.deepEqual(again.result?.winners, direct.winners);
  }
});

test("a person's seat waits for them, and a bad choice is refused", () => {
  const setup: Setup = { players: 4, seed: 7, bots: [false, false, false, false] };
  const { prompt, game } = replay(setup, []);
  assert.equal(prompt?.seat, game.current);
  assert.throws(() => replay(setup, [{ kind: "play", seat: (game.current + 1) % 4, card: 0, down: false }]), /wants/);
  assert.throws(() => replay(setup, [{ kind: "play", seat: game.current, card: 99, down: false }]), /no such card/);
});

test("a review plays out every option at each of a seat's decisions with a choice", () => {
  const setup: Setup = { players: 4, seed: 3, bots: Array(4).fill("default") };
  const { decisions } = replay(setup, []);
  const reviewed = [...review(setup, decisions, 1, { deals: 4 })];
  assert.ok(reviewed.length > 0);
  const parts = [0, 1, 2].flatMap((i) => [...review(setup, decisions, 1, { deals: 4, part: [i, 3] })].map((r) => r.n));
  assert.deepEqual(
    parts.sort((a, b) => a - b),
    reviewed.map((r) => r.n),
  );
  for (const r of reviewed) {
    assert.ok(r.options.some((o) => o.label === r.chose));
    assert.equal(r.chose, r.hint);
  }
});
