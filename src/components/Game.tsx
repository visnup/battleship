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
      {!playing && <Lobby table={table} me={player.id} />}
    </>
  );
}

function Lobby({ table, me }: { table: string; me: Id<"players"> }) {
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
  return (
    <section className="mx-auto my-[1em] max-w-[30em] rounded-[0.6em] bg-black/15 p-[1em]">
      <h1 className="my-[0.67em] text-[2em] font-bold">Monopoly Deal</h1>
      <p>Share this page&apos;s address to bring people to the table.</p>
      <ul>
        {players.map((p) => (
          <li key={p._id}>
            {p._id === me ? (
              <>
                <input
                  aria-label="Your name"
                  className="rounded-[0.3em] bg-[var(--card)] px-[0.4em] py-[0.1em] text-black"
                  value={name}
                  placeholder={`Player ${p.seat + 1}`}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                />{" "}
                (you)
              </>
            ) : (
              (p.name ?? `Player ${p.seat + 1}`)
            )}
          </li>
        ))}
      </ul>
      <p>
        Bots: <button onClick={() => setBots(Math.max(0, bots - 1))}>−</button> {bots} <button onClick={() => setBots(Math.min(5 - players.length, bots + 1))}>+</button>
      </p>
      <button disabled={total < 2 || total > 5} onClick={() => start({ table, players: players.map((p) => p._id), bots })}>
        Deal {total} players
      </button>
    </section>
  );
}
