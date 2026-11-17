import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { COLOR_NAMES, defaultPolicy, fullSets, type Game, moves, type Move, type Player, rent } from "../game.ts";
import { type Choice, choose, type Ref, replay } from "../replay.ts";
import { Card, colorName, label } from "./Card";

type Props = { game: Doc<"games"> & { log: Choice[] }; me: Id<"players"> };

export function Board({ game, me }: Props) {
  const decide = useMutation(api.games.decide);
  const [error, setError] = useState<string>();
  const state = useMemo(() => replay({ players: game.seats.length, seed: game.seed, first: game.first, bots: game.seats.map((s) => "bot" in s) }, game.log), [game]);
  const seat = game.seats.findIndex((s) => "player" in s && s.player === me);
  const who = (n: number) => (n === seat ? "You" : "bot" in game.seats[n] ? `Bot ${n + 1}` : `Player ${n + 1}`);
  const send = (choice: Choice) => {
    setError(undefined);
    decide({ game: game._id, player: me, choice }).catch((e) => setError(String(e.message ?? e)));
  };
  const { prompt, result } = state;
  const g = state.game;
  const order = Array.from({ length: g.players.length }, (_, i) => (Math.max(seat, 0) + i) % g.players.length);
  return (
    <div className="board">
      <section className="middle">
        <div className="pile">
          <span>Draw {g.draw.length}</span>
          {g.pile.length ? <Card card={g.pile[g.pile.length - 1]} /> : <span className="empty">Discard</span>}
        </div>
        <ol className="log">
          {(g.log ?? []).slice(-6).map((line, i) => (
            <li key={i}>
              {line
                .replace(/P(\d)/g, (_, n) => who(Number(n)))
                .replace(/\bYou (\w+)s\b/g, "You $1")
                .replace(/\b[a-z]+[A-Z]\w*/g, colorName)}
            </li>
          ))}
        </ol>
      </section>
      {order.map((n) => (
        <Seat key={n} game={g} p={g.players[n]} name={who(n)} current={!result && g.current === n} mine={n === seat} />
      ))}
      <section className="prompt">
        {result ? (
          <p>{result.winner === null ? "Nobody won." : `${who(result.winner)} won!`}</p>
        ) : prompt && prompt.seat === seat ? (
          <Ask game={g} p={g.players[seat]} prompt={prompt} who={who} send={send} />
        ) : (
          <>
            <p>Waiting for {prompt ? who(prompt.seat) : "…"}</p>
            {seat >= 0 && (
              <div className="hand">
                {g.players[seat].hand.map((c, i) => (
                  <Card key={i} card={c} />
                ))}
              </div>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </section>
      <style jsx>{`
        .board {
          display: flex;
          flex-direction: column;
          gap: 0.8em;
          padding: 0.8em;
          max-width: 60em;
          margin: 0 auto;
        }
        .middle {
          display: flex;
          gap: 1em;
          align-items: flex-start;
        }
        .pile {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3em;
          font-size: small;
        }
        .empty {
          width: 4.5em;
          height: 6.3em;
          border: 2px dashed rgba(255, 255, 255, 0.4);
          border-radius: 0.4em;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .log {
          margin: 0;
          padding-left: 1.2em;
          font-size: small;
          opacity: 0.8;
        }
        .prompt {
          position: sticky;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          padding: 0.6em 0.8em;
          border-radius: 0.6em;
        }
        .error {
          color: #ff8a8a;
        }
        .hand {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4em;
        }
      `}</style>
    </div>
  );
}

function Seat({ game, p, name, current, mine }: { game: Game; p: Player; name: string; current: boolean; mine: boolean }) {
  const colors = COLOR_NAMES.filter((c) => p.props.some((x) => x.color === c));
  const banked = p.bank.reduce((s, c) => s + c.value, 0);
  return (
    <section className={current ? "seat current" : "seat"}>
      <h2>
        {name}{" "}
        <small>
          {mine ? "" : `${p.hand.length} in hand · `}${banked}M banked
        </small>
      </h2>
      <div className="row">
        {colors.map((c) => (
          <div key={c} className={fullSets(game, p, c) ? "set full" : "set"}>
            {p.props
              .filter((x) => x.color === c)
              .map((x, i) => (
                <Card key={i} card={x.card} color={x.color} />
              ))}
            {p.built
              .filter((x) => x.color === c)
              .map((x, i) => (
                <Card key={`b${i}`} card={x.card} />
              ))}
          </div>
        ))}
      </div>
      {p.bank.length > 0 && (
        <div className="row bank">
          {p.bank.map((c, i) => (
            <Card key={i} card={c} />
          ))}
        </div>
      )}
      <style jsx>{`
        .seat {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 0.6em;
          padding: 0.5em 0.8em;
        }
        .current {
          outline: 2px solid gold;
        }
        h2 {
          font-size: 1em;
          margin: 0 0 0.4em;
        }
        small {
          font-weight: normal;
          opacity: 0.7;
        }
        .row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6em;
        }
        .set {
          display: flex;
          gap: 0;
        }
        .set > :global(*:not(:first-child)) {
          margin-left: -2.8em;
        }
        .full {
          outline: 2px solid white;
          border-radius: 0.4em;
        }
        .bank {
          margin-top: 0.4em;
          font-size: 0.7em;
        }
      `}</style>
    </section>
  );
}

function describe(game: Game, p: Player, m: Move, who: (n: number) => string): string {
  const to = "target" in m && m.target !== undefined ? who(m.target) : "";
  const theirs = to === "You" ? "your" : `${to}'s`;
  if (m.type === "bank") return "Bank it";
  if (m.type === "place") return m.card.kind === "action" ? `Build on ${colorName(m.color)}` : "Lay it down";
  if (m.type === "rent") {
    const amount = rent(game, p, m.color) * 2 ** m.doubles.length;
    return `Charge ${colorName(m.color)} rent, $${amount}M${to ? ` to ${to}` : " to everyone"}${m.doubles.length ? ` (${m.doubles.length}× Double the Rent)` : ""}`;
  }
  if (m.card.kind !== "action") return label(m.card);
  switch (m.card.action) {
    case "passGo":
      return "Pass Go: draw 2";
    case "birthday":
      return "Birthday: $2M from everyone";
    case "debtCollector":
      return `Debt Collector: $5M from ${to}`;
    case "slyDeal":
      return `Take ${theirs} ${label(m.take!.card)}${m.take!.card.kind === "wild" ? ` (${colorName(m.take!.color)})` : ""}`;
    case "forcedDeal":
      return `Swap ${who(p.seat) === "You" ? "your" : "their"} ${label(m.give!.card)} for ${theirs} ${label(m.take!.card)}`;
    case "dealBreaker":
      return `Take ${theirs} ${colorName(m.color!)} set`;
    default:
      return label(m.card);
  }
}

function Ask({ game, p, prompt, who, send }: { game: Game; p: Player; prompt: NonNullable<ReturnType<typeof replay>["prompt"]>; who: (n: number) => string; send: (c: Choice) => void }) {
  const [picked, setPicked] = useState<number>();
  const payable: Ref[] = [
    ...p.bank.map((_, i) => ({ pile: "bank" as const, i })),
    ...p.built.map((_, i) => ({ pile: "built" as const, i })),
    ...p.props.flatMap((x, i) => (x.card.value > 0 ? [{ pile: "props" as const, i }] : [])),
  ];
  const suggested = useMemo(() => {
    if (prompt.kind === "pay") return defaultPolicy.pay(game, p, prompt.amount).map((x) => ("kind" in x ? `bank${p.bank.indexOf(x)}` : p.built.includes(x) ? `built${p.built.indexOf(x)}` : `props${p.props.indexOf(x)}`));
    if (prompt.kind === "discard") return defaultPolicy.discard(game, p, prompt.n).map((c) => `hand${p.hand.indexOf(c)}`);
    return [];
  }, [game, p, prompt]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(suggested));
  const toggle = (k: string) => setChosen((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const hand = (onClick: (i: number) => void, selected: (i: number) => boolean) => (
    <div className="hand">
      {p.hand.map((c, i) => (
        <Card key={i} card={c} selected={selected(i)} onClick={() => onClick(i)} />
      ))}
      <style jsx>{`
        .hand {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4em;
          padding-top: 0.6em;
        }
      `}</style>
    </div>
  );
  if (prompt.kind === "move") {
    // moves() lists one of each identical card, so match the picked card by what it is
    const list = picked === undefined ? [] : moves(game, p, prompt.left).filter((m) => JSON.stringify(m.card) === JSON.stringify(p.hand[picked]));
    return (
      <div>
        <p>
          Your turn: {prompt.left} play{prompt.left === 1 ? "" : "s"} left. <button onClick={() => send({ kind: "move", seat: p.seat, move: null })}>End turn</button>
        </p>
        {hand(
          (i) => setPicked(i === picked ? undefined : i),
          (i) => i === picked,
        )}
        {picked !== undefined && (
          <ul>
            {list.length ? (
              list.map((m, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      const c = choose(game, p, { ...m, card: p.hand[picked] } as Move);
                      setPicked(undefined);
                      send({ kind: "move", seat: p.seat, move: c });
                    }}
                  >
                    {describe(game, p, m, who)}
                  </button>
                </li>
              ))
            ) : (
              <li>Nothing to do with it now.</li>
            )}
          </ul>
        )}
      </div>
    );
  }
  if (prompt.kind === "pay") {
    const picks = payable.filter((r) => chosen.has(`${r.pile}${r.i}`));
    const value = (r: Ref) => (r.pile === "bank" ? p.bank[r.i].value : p[r.pile][r.i].card.value);
    const total = picks.reduce((s, r) => s + value(r), 0);
    const enough = total >= prompt.amount || picks.length === payable.length;
    return (
      <div>
        <p>
          You owe {who(prompt.to)} ${prompt.amount}M. Picked ${total}M.{" "}
          <button disabled={!enough} onClick={() => send({ kind: "pay", seat: p.seat, paid: picks })}>
            Pay
          </button>
        </p>
        <div className="cards">
          {payable.map((r) => {
            const card = r.pile === "bank" ? p.bank[r.i] : p[r.pile][r.i].card;
            return <Card key={`${r.pile}${r.i}`} card={card} color={r.pile === "props" ? p.props[r.i].color : undefined} selected={chosen.has(`${r.pile}${r.i}`)} onClick={() => toggle(`${r.pile}${r.i}`)} />;
          })}
        </div>
        <style jsx>{`
          .cards {
            display: flex;
            flex-wrap: wrap;
            gap: 0.4em;
            padding-top: 0.6em;
          }
        `}</style>
      </div>
    );
  }
  if (prompt.kind === "sayNo")
    return (
      <div>
        <p>
          {who(prompt.from)}: {describe(game, game.players[prompt.from], prompt.move, who)}. Just Say No? <button onClick={() => send({ kind: "sayNo", seat: p.seat, no: true })}>Say no</button>{" "}
          <button onClick={() => send({ kind: "sayNo", seat: p.seat, no: false })}>Let it through</button>
        </p>
        {hand(
          () => {},
          () => false,
        )}
      </div>
    );
  const cards = [...chosen].filter((k) => k.startsWith("hand")).map((k) => Number(k.slice(4)));
  return (
    <div>
      <p>
        Put {prompt.n} card{prompt.n === 1 ? "" : "s"} back under the deck.{" "}
        <button disabled={cards.length !== prompt.n} onClick={() => send({ kind: "discard", seat: p.seat, cards })}>
          Done
        </button>
      </p>
      {hand(
        (i) => toggle(`hand${i}`),
        (i) => chosen.has(`hand${i}`),
      )}
    </div>
  );
}
