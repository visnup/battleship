import { v } from "convex/values";
import { type Choice, deal, replay } from "../src/replay.ts";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server.js";

const setup = (game: Doc<"games">) => ({ players: game.seats.length, seed: game.seed, first: game.first, bots: game.seats.map((s) => "bot" in s) });

async function play(db: MutationCtx["db"], game: Doc<"games">, log: Choice[], made: Choice[]) {
  const { result, decisions } = replay(setup(game), [...log, ...made]);
  for (const [i, d] of decisions.entries()) await db.insert("decisions", { game: game._id, n: log.length + i, ...d });
  if (result) await db.patch("games", game._id, { winner: result.winner });
}

export const start = mutation({
  args: { table: v.string(), players: v.array(v.id("players")), bots: v.number() },
  handler: async ({ db }, { table, players, bots }) => {
    const seats = [...players.map((player) => ({ player })), ...Array.from({ length: bots }, () => ({ bot: "default" as const }))];
    if (seats.length < 2 || seats.length > 5) throw new Error("2 to 5 players");
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
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

const log = async (db: MutationCtx["db"], game: Id<"games">) =>
  (
    await db
      .query("decisions")
      .withIndex("byGame", (q) => q.eq("game", game))
      .collect()
  ).map((d) => d.choice as Choice);

export const get = query({
  args: { table: v.string() },
  handler: async ({ db }, { table }) => {
    const game = await db
      .query("games")
      .withIndex("byTable", (q) => q.eq("table", table))
      .order("desc")
      .first();
    if (!game) return null;
    const decisions = await db
      .query("decisions")
      .withIndex("byGame", (q) => q.eq("game", game._id))
      .collect();
    return { ...game, log: decisions.map((d) => d.choice as Choice) };
  },
});
