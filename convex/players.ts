import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

/** How long since a ping a player still counts as at the table. */
export const window = 30e3;

export const join = mutation({
  args: { table: v.string(), id: v.optional(v.id("players")) },
  handler: async ({ db }, { table, id }) => {
    const now = Date.now();
    const previous = id ? await db.get("players", id) : null;
    const returning = previous?.table === table ? previous : null;
    const active = await db
      .query("players")
      .withIndex("byLastSeen", (q) => q.eq("table", table).gt("lastSeen", now - window))
      .collect();
    const seats = new Set(active.filter((p) => p._id !== returning?._id).map((p) => p.seat));
    const seat = returning && !seats.has(returning.seat) ? returning.seat : [0, 1, 2, 3, 4].find((n) => !seats.has(n));
    if (seat === undefined) return null;
    if (returning) {
      await db.patch("players", returning._id, { seat, lastSeen: now });
      return { id: returning._id, table, seat };
    } else {
      const id = await db.insert("players", { table, seat, lastSeen: now });
      return { id, table, seat };
    }
  },
});

export const ping = mutation({
  args: { id: v.id("players") },
  handler: ({ db }, { id }) => db.patch("players", id, { lastSeen: Date.now() }),
});

export const active = query({
  args: { table: v.string(), now: v.number() },
  handler: async ({ db }, { table, now }) =>
    (
      await db
        .query("players")
        .withIndex("byLastSeen", (q) => q.eq("table", table).gt("lastSeen", now - window))
        .collect()
    ).sort((a, b) => a.seat - b.seat),
});
