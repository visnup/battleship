import { test } from "node:test";
import assert from "node:assert/strict";
import { DECK } from "./cards.ts";

test("the contents list: 28 properties, 11 wilds, 34 actions, 13 rents, 20 money", () => {
  const count = (kind: string) => DECK.filter((c) => c.kind === kind).length;
  assert.deepEqual(
    { property: count("property"), wild: count("wild"), action: count("action"), rent: count("rent"), money: count("money") },
    { property: 28, wild: 11, action: 34, rent: 13, money: 20 },
  );
  assert.equal(DECK.length, 106);
});

test("money cards add up to $57M", () => {
  const money = DECK.filter((c) => c.kind === "money").reduce((sum, c) => sum + c.value, 0);
  assert.equal(money, 57);
});
