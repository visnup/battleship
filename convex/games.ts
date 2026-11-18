import { v } from "convex/values";
import { shuffle } from "../src/game.ts";
import { hard } from "../src/hard.ts";
import { type Choice, deal, replay, setup } from "../src/replay.ts";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server.js";
import { window } from "./players.js";
import { bot } from "./schema.js";

async function play(db: MutationCtx["db"], game: Doc<"games">, log: Choice[], made: Choice[]) {
  const { result, decisions } = replay(setup(game), [...log, ...made], { learned: hard() });
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
  args: { table: v.string(), players: v.array(v.id("players")), bots: v.array(bot) },
  handler: async ({ db }, { table, players, bots }) => {
    const seats = shuffle([...players.map((player) => ({ player })), ...bots.map((bot) => ({ bot }))], Math.random);
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

/** Seats a bot for every player who's stopped pinging, and plays on. */
export const replaceGone = mutation({
  args: { game: v.id("games") },
  handler: async ({ db }, { game: id }) => {
    const game = (await db.get("games", id))!;
    if (game.winner !== undefined) return;
    const now = Date.now();
    const seats = await Promise.all(
      game.seats.map(async (s) => {
        if (!("player" in s)) return s;
        const p = await db.get("players", s.player);
        return p && p.lastSeen > now - window ? s : { bot: "default" as const };
      }),
    );
    if (seats.every((s, i) => s === game.seats[i])) return;
    await db.patch("games", id, { seats });
    await play(db, { ...game, seats }, await log(db, id), []);
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
    if (!game) return game;
    const names = await Promise.all(game.seats.map(async (s) => ("player" in s ? ((await db.get("players", s.player))?.name ?? null) : null)));
    return { ...game, log: await log(db, game._id), names };
  },
});
