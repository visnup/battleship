import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Board } from "./Board";

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

  if (player === undefined || game === undefined) return <p>Joining…</p>;
  if (player === null) return <p>Every seat is taken.</p>;
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
  const [now, setNow] = useState(() => Math.floor(Date.now() / 5e3) * 5e3);
  const [bots, setBots] = useState(1);
  const players = useQuery(api.players.active, { table, now }) ?? [];
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 5e3) * 5e3), 5e3);
    return () => clearInterval(interval);
  }, []);
  const total = players.length + bots;
  return (
    <section>
      <h1>Monopoly Deal</h1>
      <p>Share this page&apos;s address to bring people to the table.</p>
      <ul>
        {players.map((p) => (
          <li key={p._id}>
            Player {p.seat + 1}
            {p._id === me && " (you)"}
          </li>
        ))}
      </ul>
      <p>
        Bots: <button onClick={() => setBots(Math.max(0, bots - 1))}>−</button> {bots} <button onClick={() => setBots(Math.min(5 - players.length, bots + 1))}>+</button>
      </p>
      <button disabled={total < 2 || total > 5} onClick={() => start({ table, players: players.map((p) => p._id), bots })}>
        Deal {total} players
      </button>
      <style jsx>{`
        section {
          max-width: 30em;
          margin: 1em auto;
          padding: 1em;
          background: rgba(0, 0, 0, 0.15);
          border-radius: 0.6em;
        }
      `}</style>
    </section>
  );
}
