import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** A bot's kind: the default player, or the learned one (`src/hard.ts`). */
export const bot = v.union(v.literal("default"), v.literal("learned"));

export default defineSchema({
  players: defineTable({
    table: v.string(),
    seat: v.number(),
    lastSeen: v.number(),
    name: v.optional(v.string()),
  }).index("byLastSeen", ["table", "lastSeen"]),
  games: defineTable({
    table: v.string(),
    seed: v.number(),
    first: v.number(),
    seats: v.array(v.union(v.object({ player: v.id("players") }), v.object({ bot: bot }))),
    deck: v.array(v.string()),
    winner: v.optional(v.union(v.number(), v.null())),
  }).index("byTable", ["table"]),
  decisions: defineTable({
    game: v.id("games"),
    n: v.number(),
    choice: v.any(),
    bot: v.boolean(),
    hands: v.array(v.array(v.string())),
  }).index("byGame", ["game", "n"]),
});
