import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Board } from "./Board";

const notice = "m-0 grid min-h-dvh place-items-center text-xl font-semibold tracking-wide opacity-80";

export function Game({ table }: { table: string }) {
  const join = useMutation(api.players.join);
  const ping = useMutation(api.players.ping);
  const [player, setPlayer] = useState<Awaited<ReturnType<typeof join>>>();
  const joining = useRef(false);
  const game = useQuery(api.games.get, { table });

  useEffect(() => {
    if (player) sessionStorage.setItem("player", JSON.stringify(player));
  }, [player]);

  useEffect(() => {
    if (!player && !joining.current) {
      joining.current = true;
      const stored = JSON.parse(sessionStorage.getItem("player") || "null");
      const id = stored?.table === table ? (stored.id as Id<"players">) : undefined;
      join({ table, id }).then(setPlayer);
    }
  }, [join, table, player]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (player) ping({ id: player.id });
    }, 5e3);
    return () => clearInterval(interval);
  }, [ping, player]);

  if (player === undefined || game === undefined) return <p className={`${notice} animate-pulse`}>Joining…</p>;
  if (player === null)
    return game ? (
      <>
        <p className="m-0 pt-[0.8em] text-center text-sm opacity-80">Every seat is taken, so you&apos;re watching.</p>
        <Board game={game} />
      </>
    ) : (
      <p className={notice}>Every seat is taken.</p>
    );
  const playing = game && game.winner === undefined && game.seats.some((s) => "player" in s && s.player === player.id);
  return (
    <>
      {game && <Board game={game} me={player.id} />}
      {!playing && <Lobby table={table} me={player.id} alone={!game} />}
    </>
  );
}

/** Who's at the table and the bots to deal in; `alone` centers it in the window when there's no board above. */
function Lobby({ table, me, alone }: { table: string; me: Id<"players">; alone: boolean }) {
  const start = useMutation(api.games.start);
  const rename = useMutation(api.players.rename);
  // remembered across tables in this browser, and saved shortly after typing stops
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("name") ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    const timeout = setTimeout(() => {
      rename({ id: me, name });
      try {
        localStorage.setItem("name", name);
      } catch {}
    }, 400);
    return () => clearTimeout(timeout);
  }, [rename, me, name]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 5e3) * 5e3);
  const [bots, setBots] = useState(1);
  // each new `now` is a new query, so keep showing the last list while it loads
  const active = useQuery(api.players.active, { table, now });
  const [players, setPlayers] = useState<NonNullable<typeof active>>([]);
  if (active && active !== players) setPlayers(active);
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 5e3) * 5e3), 5e3);
    return () => clearInterval(interval);
  }, []);
  const total = players.length + bots;
  const row = "flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5";
  return (
    <div className={alone ? "grid min-h-dvh place-items-center p-4" : "p-4"}>
      <section className="mx-auto w-full max-w-sm rounded-2xl bg-[var(--bar)] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <h1 className="m-0 text-center text-3xl font-bold">Monopoly Deal</h1>
        <p className="mt-2 mb-5 text-center text-sm opacity-70">Share this page&apos;s address to bring people to the table.</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {players.map((p) =>
            p._id === me ? (
              <li key={p._id} className={row}>
                <input
                  aria-label="Your name"
                  className="min-w-0 flex-1 rounded-md bg-[var(--card)] px-2 py-1 text-black"
                  value={name}
                  placeholder={`Player ${p.seat + 1}`}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                />
                <span className="text-sm opacity-70">you</span>
              </li>
            ) : (
              <li key={p._id} className={row}>
                {p.name ?? `Player ${p.seat + 1}`}
              </li>
            ),
          )}
          {Array.from({ length: bots }, (_, i) => (
            <li key={`bot${i}`} className={row}>
              <span className="flex-1">🤖 Bot</span>
              <button className="bg-white/15 px-2 py-0.5 text-sm text-white" aria-label="Remove bot" onClick={() => setBots(bots - 1)}>
                Remove
              </button>
            </li>
          ))}
          {total < 5 && (
            <li>
              <button className="w-full border-2 border-dashed border-white/30 bg-transparent py-2 text-white/80" onClick={() => setBots(bots + 1)}>
                + Add a bot
              </button>
            </li>
          )}
        </ul>
        <button className="mt-5 w-full bg-[gold] py-2 text-lg font-bold" disabled={total < 2} onClick={() => start({ table, players: players.map((p) => p._id), bots })}>
          Deal {total} players
        </button>
      </section>
    </div>
  );
}
