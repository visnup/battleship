import assert from "node:assert/strict";
import { test } from "node:test";
import { replay, type Setup } from "./replay.ts";
import { review } from "./review.ts";
import { STRATEGIES } from "./strategies.ts";

const setup: Setup = { players: 3, seed: 7, first: 0, bots: ["default", "default", "default"] };
const log = replay(setup, []).decisions.map((d) => d.choice);

test("a review plays out what the player chose and what the Hint would at each of their decisions", () => {
  const rows = [...review(setup, log, 1, { deals: 8, cap: 4 })];
  assert.ok(rows.filter((r) => r.kind === "move").length > 5);
  assert.ok(rows.some((r) => r.kind === "pay"));
  for (const r of rows) {
    assert.deepEqual([log[r.n].seat, log[r.n].kind], [1, r.kind]);
    // a game the default player played: its choice is the Hint's
    assert.equal(r.chose, r.hint, `${r.kind} ${r.n}`);
    assert.ok(r.options.some((o) => o.key === r.chose));
    assert.ok(r.options.length >= 2 && (r.kind === "move" || r.options.length <= 4) && r.options.every((o) => o.win >= 0 && o.win <= 1));
  }
});

test("a decision made while another player's card is half played can be played out", () => {
  // redealing the others' hands a decision later than this lost the card being played ("not there")
  const setup: Setup = { players: 3, seed: 1, first: 1, bots: ["default", "default", "default"] };
  const log = replay(setup, []).decisions.map((d) => d.choice);
  assert.ok([...review(setup, log, 0, { deals: 16 })].some((r) => r.kind === "sayNo"));
});

test("a bot plays as its kind in the playouts", () => {
  const easy: Setup = { ...setup, bots: [false, "builder", "builder"] };
  const builder = STRATEGIES.builder(0);
  const wins = (bots: Record<string, typeof builder>) => [...review(easy, log, 0, { deals: 8, bots })].map((r) => r.options.map((o) => o.win));
  assert.deepEqual(
    wins({}),
    [...review(setup, log, 0, { deals: 8 })].map((r) => r.options.map((o) => o.win)),
  );
  assert.notDeepEqual(wins({ builder }), wins({}));
});

test("workers sharing a review cover every play once, with the same numbers", () => {
  const whole = [...review(setup, log, 1, { deals: 8 })];
  const parts = [0, 1, 2].flatMap((i) => [...review(setup, log, 1, { deals: 8, part: [i, 3] })]).sort((a, b) => a.n - b.n);
  assert.deepEqual(parts, whole);
});
