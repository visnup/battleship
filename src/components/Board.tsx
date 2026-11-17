import { useMutation } from "convex/react";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { banked, COLOR_NAMES, count, defaultPolicy, fullColors, fullSets, type Game, moves, type Move, payable, type Player, rent, size } from "../game.ts";
import { type Choice, choose, type Ref, ref, replay, setup } from "../replay.ts";
import { Card, colorName, label } from "./Card";

type Props = { game: Doc<"games"> & { log: Choice[] }; me: Id<"players"> };

const id = (r: Ref) => `${r.pile}${r.i}`;

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-[0.4em] pt-[0.6em]">{children}</div>;
}

const deck = "box-border flex h-[6.3em] w-[4.5em] shrink-0 flex-col items-center justify-center rounded-[0.4em] px-[0.3em] text-center text-[0.85rem] leading-[1.2]";
const drawn = "border-[0.3em] border-white bg-[#b8292f] font-extrabold text-white shadow-[2px_2px_0_-1px_white,2px_2px_0_0_rgba(0,0,0,0.3),4px_4px_0_-1px_white,4px_4px_0_0_rgba(0,0,0,0.3)]";
const empty = "border-2 border-dashed border-white/40";

/** The log with a heading for each turn, and the mover's own lines without their name. */
function turns(log: string[], who: (n: number) => string) {
  const entries: { turn: boolean; text: string }[] = [];
  let mover = -1;
  for (const line of log) {
    const t = line.match(/^turn (\d+): P(\d) (.*)/);
    if (t) {
      mover = Number(t[2]);
      entries.push({ turn: true, text: `Turn ${t[1]}: ${who(mover)}` }, { turn: false, text: t[3] });
    } else entries.push({ turn: false, text: line.startsWith(`P${mover} `) ? line.slice(3) : line });
  }
  return entries;
}

export function Board({ game, me }: Props) {
  const decide = useMutation(api.games.decide);
  const [error, setError] = useState<string>();
  const state = useMemo(() => replay(setup(game), game.log), [game]);
  const log = useRef<HTMLUListElement>(null);
  const height = useRef(0);
  const lines = state.game.log?.length;
  // follow new lines only when already at the bottom, so scrolling back through it stays put
  useLayoutEffect(() => {
    const ul = log.current;
    if (!ul) return;
    if (ul.scrollTop + ul.clientHeight >= height.current - 4) ul.scrollTo({ top: ul.scrollHeight });
    height.current = ul.scrollHeight;
  }, [lines]);
  const seat = game.seats.findIndex((s) => "player" in s && s.player === me);
  const who = (n: number) => (n === seat ? "You" : "bot" in game.seats[n] ? `Bot ${n + 1}` : `Player ${n + 1}`);
  const send = (choice: Choice) => {
    setError(undefined);
    decide({ game: game._id, player: me, choice }).catch((e) => setError(String(e.message ?? e)));
  };
  const { prompt, result } = state;
  const g = state.game;
  const entries = turns(g.log ?? [], who);
  const others = Array.from({ length: g.players.length }, (_, i) => (seat < 0 ? i : seat + 1 + i) % g.players.length).filter((n) => n !== seat);
  return (
    <div className="mx-auto flex max-w-[60em] flex-col gap-[0.8em] p-[0.8em]">
      <section className="flex items-start justify-center gap-[1em]">
        <div className={g.draw.length ? `${deck} ${drawn}` : `${deck} ${empty}`}>
          Draw Pile <span className="text-[#d0d0d0]">{g.draw.length}</span>
        </div>
        {g.pile.length ? <Card card={g.pile[g.pile.length - 1]} /> : <span className={`${deck} ${empty}`}>Discard</span>}
        <ul className="m-0 h-[5.4rem] list-none overflow-y-auto p-0 text-[small] opacity-80" ref={log}>
          {entries.map(({ turn, text }, i) => (
            <li
              key={i}
              className={
                turn
                  ? "mt-[0.3em] flex items-center gap-[0.5em] font-semibold first:mt-0 before:flex-1 before:border-t before:border-white/40 before:content-[''] after:flex-1 after:border-t after:border-white/40 after:content-['']"
                  : undefined
              }
            >
              {turn
                ? text
                : text
                    .replace(/P(\d)/g, (_, n) => who(Number(n)))
                    .replace(/\bYou (\w+)s\b/g, "You $1")
                    .replace(/\b[a-z]+[A-Z]\w*/g, colorName)
                    .replace(/^./, (c) => c.toUpperCase())}
            </li>
          ))}
        </ul>
      </section>
      {others.map((n) => (
        <Seat key={n} game={g} p={g.players[n]} name={who(n)} current={!result && g.current === n} mine={false} />
      ))}
      <section className="sticky bottom-0 rounded-[0.6em] bg-[#123f2c] shadow-[0_-4px_12px_rgba(0,0,0,0.3)] px-[0.8em] py-[0.6em] text-white">
        {seat >= 0 && <Seat game={g} p={g.players[seat]} name={who(seat)} current={!result && g.current === seat} mine />}
        {result ? (
          <p>{result.winner === null ? "Nobody won." : `${who(result.winner)} won!`}</p>
        ) : prompt && prompt.seat === seat ? (
          <Ask key={game.log.length} game={g} p={g.players[seat]} prompt={prompt} who={who} send={send} />
        ) : (
          <>
            <p>Waiting for {prompt ? who(prompt.seat) : "…"}</p>
            {seat >= 0 && (
              <Row>
                {g.players[seat].hand.map((c, i) => (
                  <Card key={i} card={c} />
                ))}
              </Row>
            )}
          </>
        )}
        {error && <p className="text-[#ff8a8a]">{error}</p>}
      </section>
    </div>
  );
}

function Seat({ game, p, name, current, mine }: { game: Game; p: Player; name: string; current: boolean; mine: boolean }) {
  const colors = COLOR_NAMES.filter((c) => p.props.some((x) => x.color === c));
  const full = fullColors(game, p).length;
  const nearest = colors
    .filter((c) => !fullSets(game, p, c))
    .map((c) => ({ c, n: count(p, c), of: size(c) }))
    .sort((a, b) => b.n / b.of - a.n / a.of)[0];
  return (
    <section className={`grid grid-cols-[7em_1fr] items-center gap-x-[0.8em] gap-y-[0.5em] rounded-[0.6em] bg-black/15 px-[0.8em] py-[0.5em] ${current ? "outline-2 outline-[gold]" : ""}`}>
      <h2 className="col-span-2 text-base font-bold">
        {name} {!mine && <small className="font-normal opacity-70">{p.hand.length} in hand</small>}
      </h2>
      <div className="text-sm">
        <div className="font-bold">{Math.min(full, 3)} of 3 sets</div>
        {nearest && full < 3 && (
          <div className="opacity-70">
            {colorName(nearest.c)} {nearest.n} of {nearest.of}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-[0.6em]">
        {colors.map((c) => (
          <div key={c} className={`flex *:not-first:-ml-[2.8em] ${fullSets(game, p, c) ? "rounded-[0.4em] outline-2 outline-white" : ""}`}>
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
      <div className="text-sm font-bold">${banked(p)}M banked</div>
      <div className="flex flex-wrap gap-[0.6em]">
        {p.bank.map((c, i) => (
          <Card key={i} card={c} />
        ))}
      </div>
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
  const [chosen, setChosen] = useState<Set<string>>(() => {
    if (prompt.kind === "pay") return new Set(defaultPolicy.pay(game, p, prompt.amount).map((x) => id(ref(p, x))));
    if (prompt.kind === "discard") return new Set(defaultPolicy.discard(game, p, prompt.n).map((c) => `hand${p.hand.indexOf(c)}`));
    return new Set();
  });
  const toggle = (k: string) => setChosen((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const hand = (onClick: (i: number) => void, selected: (i: number) => boolean) => (
    <Row>
      {p.hand.map((c, i) => (
        <Card key={i} card={c} selected={selected(i)} onClick={() => onClick(i)} />
      ))}
    </Row>
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
    const all = payable(p);
    const picks = all.filter((x) => chosen.has(id(ref(p, x))));
    const total = picks.reduce((s, x) => s + ("kind" in x ? x : x.card).value, 0);
    return (
      <div>
        <p>
          You owe {who(prompt.to)} ${prompt.amount}M. Picked ${total}M.{" "}
          <button disabled={total < prompt.amount && picks.length < all.length} onClick={() => send({ kind: "pay", seat: p.seat, paid: picks.map((x) => ref(p, x)) })}>
            Pay
          </button>
        </p>
        <Row>
          {all.map((x) => {
            const k = id(ref(p, x));
            return "kind" in x ? <Card key={k} card={x} selected={chosen.has(k)} onClick={() => toggle(k)} /> : <Card key={k} card={x.card} color={x.color} selected={chosen.has(k)} onClick={() => toggle(k)} />;
          })}
        </Row>
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
