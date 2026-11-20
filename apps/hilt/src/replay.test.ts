import assert from "node:assert/strict";
import { test } from "node:test";
import { Game, mulberry32 } from "./game.ts";
import { onBoard, replay, type Setup } from "./replay.ts";

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

test("a game saved when players with no cards were still asked to move replays the same", () => {
  // the old rule: the first turn went left of the Favor holder, cards or not
  const begin = Game.prototype.begin;
  Game.prototype.begin = function () {
    begin.call(this);
    this.current = (this.favor + 1) % this.players.length;
  };
  let old;
  try {
    for (let seed = 1; seed < 200 && !old; seed++) {
      const setup: Setup = { players: 4, seed, first: 0, bots: Array(4).fill("default") };
      const played = replay(setup, []);
      const people: Setup = { ...setup, bots: setup.bots.map(() => false) };
      // games where somebody empty-handed was asked
      const asked = played.decisions.filter((c, n) => c.kind === "move" && c.card === null && !replay(people, played.decisions.slice(0, n)).game.players[c.seat].hand.length);
      if (asked.length) old = { setup, people, played };
    }
  } finally {
    Game.prototype.begin = begin;
  }
  assert.ok(old, "no game asked a player with no cards");
  const now = replay(old.people, old.played.decisions);
  assert.equal(now.prompt, undefined);
  assert.equal(now.result?.winner, old.played.result?.winner);
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

test("the board keeps a battle Doves ended in view until the next one has a card in it", () => {
  // find a default game where a battle ends on Doves, and replay it up to just after
  for (let seed = 1; seed < 500; seed++) {
    const setup: Setup = { players: 4, seed, first: 0, bots: Array(4).fill("default") };
    const all = replay(setup, []);
    const doves = all.lines.findIndex((l) => / plays doves/.test(l));
    if (doves < 0) continue;
    const people: Setup = { ...setup, bots: setup.bots.map(() => false) };
    // the fewest decisions whose log reaches the Doves line
    let n = 0;
    while (replay(people, all.decisions.slice(0, n)).lines.length <= doves) n++;
    const after = replay(people, all.decisions.slice(0, n));
    const board = onBoard(after.game, after.lines);
    assert.equal(board.current, false);
    assert.ok(board.lines.some((l) => / plays doves/.test(l)));
    assert.ok(after.last?.rows.flat().some((c) => c.kind === "doves"));
    return;
  }
  assert.fail("no game ended a battle on Doves");
});
