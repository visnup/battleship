import { v } from "convex/values";
import { shuffle } from "../src/game.ts";
import { type Choice, deal, replay, setup } from "../src/replay.ts";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";

async function play(db: MutationCtx["db"], game: Doc<"games">, log: Choice[], made: Choice[]) {
  const { result, decisions } = replay(setup(game), [...log, ...made]);
  for (const [i, d] of decisions.entries()) await db.insert("decisions", { game: game._id, n: log.length + i, ...d });
  if (result) await db.patch("games", game._id, { winner: result.winner });
}

const log = async (db: QueryCtx["db"], game: Id<"games">) =>
  (
    await db
      .query("decisions")
      .withIndex("byGame", (q) => q.eq("game", game))
      .collect()
  ).map((d) => d.choice as Choice);

export const start = mutation({
  args: { table: v.string(), players: v.array(v.id("players")), bots: v.number() },
  handler: async ({ db }, { table, players, bots }) => {
    const seats = shuffle([...players.map((player) => ({ player })), ...Array.from({ length: bots }, () => ({ bot: "default" as const }))], Math.random);
    if (seats.length < 2 || seats.length > 5) throw new Error("2 to 5 players");
    const seed = Math.floor(Math.random() * 2 ** 32);
    const first = Math.floor(Math.random() * seats.length);
    const id = await db.insert("games", { table, seed, first, seats, deck: deal(seed) });
    await play(db, (await db.get("games", id))!, [], []);
    return id;
  },
});

export const decide = mutation({
  args: { game: v.id("games"), player: v.id("players"), choice: v.any() },
  handler: async ({ db }, { game: id, player, choice }) => {
    const game = (await db.get("games", id))!;
    const seat = game.seats.findIndex((s) => "player" in s && s.player === player);
    if (seat < 0 || choice.seat !== seat) throw new Error("not your seat");
    if (game.winner !== undefined) throw new Error("the game is over");
    await play(db, game, await log(db, id), [choice]);
  },
});

export const get = query({
  args: { table: v.string() },
  handler: async ({ db }, { table }) => {
    const game = await db
      .query("games")
      .withIndex("byTable", (q) => q.eq("table", table))
      .order("desc")
      .first();
    return game && { ...game, log: await log(db, game._id) };
  },
});
