import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, mulberry32 } from "./game.ts";
import { replay, type Setup } from "./replay.ts";

test("bots replay a game as it plays", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const players = 3 + (seed % 4);
    const bots = Array(players).fill("default");
    const played = replay({ players, seed, first: seed % players, bots }, []);
    const direct = new Game({ players, rng: mulberry32(seed), first: seed % players }).run();
    assert.equal(played.result?.winner, direct.winner);
    // the same decisions made by people instead
    const again = replay({ players, seed, first: seed % players, bots: bots.map(() => false) }, played.decisions);
    assert.equal(again.prompt, undefined);
    assert.equal(again.result?.winner, direct.winner);
  }
});

test("a person's seat waits for them, and a bad choice is refused", () => {
  const setup: Setup = { players: 3, seed: 7, first: 0, bots: [false, "default", "default"] };
  const { prompt } = replay(setup, []);
  assert.deepEqual(prompt, { kind: "color", seat: 0 });
  assert.throws(() => replay(setup, [{ kind: "move", seat: 0, card: 0 }]), /wants color by 0/);
  const after = replay(setup, [{ kind: "color", seat: 0, color: "orange" }]);
  assert.equal(after.game.color, "orange");
  assert.equal(after.prompt?.seat, 0);
});
