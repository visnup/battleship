import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Board, type Level, LEVELS, setStepSpeed, type Speed, stepSpeed } from "./Board";

const notice = "m-0 grid min-h-dvh place-items-center text-xl font-semibold tracking-wide opacity-80";

export function Game({ table }: { table: string }) {
  const join = useMutation(api.players.join);
  const ping = useMutation(api.players.ping);
  const [player, setPlayer] = useState<Awaited<ReturnType<typeof join>>>();
  const joining = useRef(false);
  const game = useQuery(api.games.get, { table });

  useEffect(() => {
    if (player) sessionStorage.setItem(`player ${table}`, player.id);
  }, [player, table]);

  useEffect(() => {
    if (!player && !joining.current) {
      joining.current = true;
      // kept by table, so visiting another table in this tab doesn't give up a seat at this one
      const id = (sessionStorage.getItem(`player ${table}`) as Id<"players"> | null) ?? undefined;
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

const NEXT: Record<Level, Level> = { builder: "default", default: "learned", learned: "builder" };

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
  const [bots, setBots] = useState<Level[]>(["default"]);
  const [step, setStep] = useState(stepSpeed);
  // each new `now` is a new query, so keep showing the last list while it loads
  const active = useQuery(api.players.active, { table, now });
  const [players, setPlayers] = useState<NonNullable<typeof active>>([]);
  if (active && active !== players) setPlayers(active);
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 5e3) * 5e3), 5e3);
    return () => clearInterval(interval);
  }, []);
  const total = players.length + bots.length;
  const row = "flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5";
  return (
    <div className={alone ? "grid min-h-dvh place-items-center p-4" : "p-4"}>
      <section className="panel mx-auto w-full max-w-sm p-6">
        <h1 className="m-0 text-center text-3xl font-bold">Monopoly Deal</h1>
        <p className="mt-2 mb-5 text-center text-sm opacity-70">Share this page&apos;s address to bring people to the table.</p>
        <ul className="flex flex-col gap-2">
          {players.map((p) =>
            p._id === me ? (
              <li key={p._id} className={row}>
                <input
                  aria-label="Your name"
                  className="min-w-0 flex-1 rounded-lg bg-card px-2 py-1 text-black"
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
          {bots.map((kind, i) => (
            <li key={`bot${i}`} className={row}>
              <span className="flex-1">🤖 Bot</span>
              <button className="quiet w-[4.5em] px-2 py-0.5 text-sm" title={LEVELS[kind].title} onClick={() => setBots(bots.map((k, j) => (j === i ? NEXT[k] : k)))}>
                {LEVELS[kind].name}
              </button>
              <button className="quiet px-2 py-0.5 text-sm" aria-label="Remove bot" onClick={() => setBots(bots.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
          {total < 5 && (
            <li>
              <button className="w-full border-2 border-dashed border-white/30 bg-transparent py-2 text-white/80" onClick={() => setBots([...bots, bots.at(-1) ?? "default"])}>
                + Add a bot
              </button>
            </li>
          )}
        </ul>
        <label className="mt-4 flex items-center justify-between gap-2 text-sm opacity-80">
          Show others&apos; plays one at a time
          <select
            className="rounded-lg bg-white/10 px-2 py-1 text-white"
            value={step}
            onChange={(e) => {
              setStep(e.target.value as Speed);
              setStepSpeed(e.target.value as Speed);
            }}
          >
            <option value="fast">Fast</option>
            <option value="slow">Slow</option>
            <option value="off">Off</option>
          </select>
        </label>
        <button className="primary mt-5 w-full py-2 text-lg" disabled={total < 2} onClick={() => start({ table, players: players.map((p) => p._id), bots })}>
          Deal {total} players
        </button>
      </section>
    </div>
  );
}
