import { useMutation } from "convex/react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { COLORS } from "../cards.ts";
import { banked, COLOR_NAMES, count, defaultPolicy, fullColors, fullSets, type Game, moves, type Move, payable, type Player, rent, size } from "../game.ts";
import { type Choice, choose, type Ref, ref, replay, setup } from "../replay.ts";
import { Card, colorName, label, money, Slot } from "./Card";

type Props = { game: Doc<"games"> & { log: Choice[] }; me: Id<"players"> };

const id = (r: Ref) => `${r.pile}${r.i}`;

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-[0.4em] pt-[0.6em]">{children}</div>;
}

const deck = "box-border flex h-[6.3em] w-[4.5em] shrink-0 flex-col items-center justify-center rounded-[0.4em] px-[0.3em] text-center text-[0.85rem] leading-[1.2]";
const drawn = "border-[0.3em] border-white bg-[#b8292f] font-extrabold text-white shadow-[2px_2px_0_-1px_white,2px_2px_0_0_rgba(0,0,0,0.3),4px_4px_0_-1px_white,4px_4px_0_0_rgba(0,0,0,0.3)]";
const empty = "border-2 border-dashed border-white/40";
/** Floats over the table, just above the bottom bar. */
const panel = "absolute right-0 bottom-full left-0 mb-[1.2em] rounded-[0.6em] bg-[#123f2c] p-[0.6em] shadow-[0_-4px_12px_rgba(0,0,0,0.4)]";

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
  const replaceGone = useMutation(api.games.replaceGone);
  const waiting = !result && prompt && prompt.seat !== seat && "player" in game.seats[prompt.seat];
  // while someone else is up, check every so often whether they've left
  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => replaceGone({ game: game._id }), 10e3);
    return () => clearInterval(interval);
  }, [waiting, replaceGone, game._id]);
  const g = state.game;
  const entries = turns(g.log ?? [], who);
  const others = Array.from({ length: g.players.length }, (_, i) => (seat < 0 ? i : seat + 1 + i) % g.players.length).filter((n) => n !== seat);
  return (
    <div className="mx-auto flex max-w-[90em] flex-col gap-[0.8em] p-[0.8em]">
      <section className="flex items-start justify-center gap-[1em] rounded-[0.6em] bg-[#123f2c] px-[0.8em] py-[0.6em] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
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
                : money(
                    text
                      .replace(/P(\d)/g, (_, n) => who(Number(n)))
                      .replace(/\bYou (\w+)s\b/g, "You $1")
                      .replace(/\b[a-z]+[A-Z]\w*/g, colorName)
                      .replace(/^./, (c) => c.toUpperCase()),
                  )}
            </li>
          ))}
        </ul>
      </section>
      <div className="mb-[9em] grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(20em,1fr))] gap-[0.8em]">
        {others.map((n) => (
          <Seat key={n} game={g} p={g.players[n]} name={who(n)} current={!result && g.current === n} mine={false} />
        ))}
        {seat >= 0 && <Seat game={g} p={g.players[seat]} name={who(seat)} current={!result && g.current === seat} mine />}
      </div>
      <section className="sticky bottom-0 z-10 rounded-[0.6em] bg-[#123f2c] text-white shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
        <div className="px-[0.8em] pb-[0.6em]">
          {result ? (
            <p>{result.winner === null ? "Nobody won." : `${who(result.winner)} won!`}</p>
          ) : prompt && prompt.seat === seat ? (
            <Ask key={game.log.length} game={g} p={g.players[seat]} prompt={prompt} who={who} send={send} />
          ) : (
            <div className="flex items-end gap-[0.8em]">
              <div className="flex-1">
                {seat >= 0 && (
                  <Row>
                    {g.players[seat].hand.map((c, i) => (
                      <Card key={i} card={c} />
                    ))}
                  </Row>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center justify-center self-stretch pt-[0.6em] text-sm">Waiting for {prompt ? who(prompt.seat) : "…"}</div>
            </div>
          )}
          {error && <p className="text-[#ff8a8a]">{error}</p>}
        </div>
      </section>
    </div>
  );
}

function Seat({ game, p, name, current, mine }: { game: Game; p: Player; name: string; current: boolean; mine: boolean }) {
  const colors = COLOR_NAMES.filter((c) => p.props.some((x) => x.color === c));
  const full = fullColors(game, p).length;
  return (
    <section className={`flex flex-col gap-[0.5em] rounded-[0.6em] bg-black/15 px-[0.8em] py-[0.5em] ${current ? "outline-2 outline-[gold]" : ""}`}>
      <h2 className="flex items-baseline justify-between text-base font-bold">
        {name} {!mine && <small className="font-normal opacity-70">{p.hand.length} in hand</small>}
      </h2>
      <div className="text-sm font-bold">{Math.min(full, 3)} of 3 sets</div>
      <div className="mt-auto flex flex-wrap gap-[0.6em]">
        {colors.map((c) => (
          <div key={c} className={`flex flex-col self-end *:not-first:-mt-[3.95rem] ${fullSets(game, p, c) ? "rounded-[0.4em] outline-2 outline-white" : ""}`}>
            {Array.from({ length: Math.max(0, size(c) - count(p, c)) }, (_, i) => (
              <Slot key={`s${i}`} color={c} rent={COLORS[c].rent[size(c) - 1 - i]} />
            ))}
            {p.props
              .filter((x) => x.color === c)
              .map((x, i) => (
                <Card key={i} card={x.card} rent={COLORS[c].rent[i % size(c)]} />
              ))}
            {p.built
              .filter((x) => x.color === c)
              .map((x, i) => (
                <Card key={`b${i}`} card={x.card} />
              ))}
          </div>
        ))}
      </div>
      <div className="text-sm font-bold">{money(`$${banked(p)}M`)} banked</div>
      <div className="flex min-h-[5.36rem] *:not-first:-ml-[2.25rem]">
        {p.bank.map((c, i) => (
          <Card key={i} card={c} banked />
        ))}
      </div>
    </section>
  );
}

const target = (m: Move) => ("target" in m ? m.target : undefined);

function describe(game: Game, p: Player, m: Move, who: (n: number) => string): string {
  const to = target(m) !== undefined ? who(target(m)!) : "";
  const theirs = to === "You" ? "your" : `${to}'s`;
  if (m.type === "bank") return `Bank it, $${m.card.value}M`;
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
      <div className="relative">
        <div className="flex items-end gap-[0.8em]">
          <div className="flex-1">
            {hand(
              (i) => setPicked(i === picked ? undefined : i),
              (i) => i === picked,
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.6em] text-sm">
            <span>
              {prompt.left} play{prompt.left === 1 ? "" : "s"} left
            </span>
            <button onClick={() => send({ kind: "move", seat: p.seat, move: null })}>End turn</button>
          </div>
        </div>
        {picked !== undefined && (
          <div className={`${panel} grid grid-cols-2 items-end gap-[0.6em] sm:grid-cols-4`}>
            {list.length ? (
              [...Map.groupBy(list, (m) => (target(m) === undefined ? describe(game, p, m, who) : describe(game, p, m, () => "\0").replace(/ (to|from) \0|\0's /g, "")))].map(([text, ms]) => {
                const play = (m: Move) => () => {
                  const c = choose(game, p, { ...m, card: p.hand[picked] } as Move);
                  setPicked(undefined);
                  send({ kind: "move", seat: p.seat, move: c });
                };
                return target(ms[0]) === undefined ? (
                  ms.map((m, i) => (
                    <button key={`${text}${i}`} className="mb-[0.4em] justify-self-center" onClick={play(m)}>
                      {money(text)}
                    </button>
                  ))
                ) : (
                  <div key={text} className="flex flex-wrap items-center justify-center gap-[0.4em] rounded-[0.5em] bg-black/15 p-[0.4em]">
                    <span className="w-full px-[0.3em]">{money(text)}</span>
                    {ms.map((m, i) => (
                      <button key={i} onClick={play(m)}>
                        {who(target(m)!)}
                      </button>
                    ))}
                  </div>
                );
              })
            ) : (
              <p>Nothing to do with it now.</p>
            )}
          </div>
        )}
      </div>
    );
  }
  if (prompt.kind === "pay") {
    const all = payable(p);
    const picks = all.filter((x) => chosen.has(id(ref(p, x))));
    const total = picks.reduce((s, x) => s + ("kind" in x ? x : x.card).value, 0);
    return (
      <div className="relative">
        <div className={`${panel} flex flex-wrap items-center justify-center gap-[0.6em]`}>
          <span>
            You owe {who(prompt.to)} {money(`$${prompt.amount}M`)}. Picked {money(`$${total}M`)}.
          </span>
          <button disabled={total < prompt.amount && picks.length < all.length} onClick={() => send({ kind: "pay", seat: p.seat, paid: picks.map((x) => ref(p, x)) })}>
            Pay
          </button>
        </div>
        <Row>
          {all.map((x) => {
            const k = id(ref(p, x));
            return "kind" in x ? <Card key={k} card={x} banked selected={chosen.has(k)} onClick={() => toggle(k)} /> : <Card key={k} card={x.card} color={x.color} selected={chosen.has(k)} onClick={() => toggle(k)} />;
          })}
        </Row>
      </div>
    );
  }
  if (prompt.kind === "sayNo")
    return (
      <div className="relative">
        <div className={`${panel} flex flex-wrap items-center justify-center gap-[0.6em]`}>
          <span>
            {who(prompt.from)}: {money(describe(game, game.players[prompt.from], prompt.move, who))}. Just Say No?
          </span>
          <button onClick={() => send({ kind: "sayNo", seat: p.seat, no: true })}>Say no</button>
          <button onClick={() => send({ kind: "sayNo", seat: p.seat, no: false })}>Let it through</button>
        </div>
        {hand(
          () => {},
          () => false,
        )}
      </div>
    );
  const cards = [...chosen].filter((k) => k.startsWith("hand")).map((k) => Number(k.slice(4)));
  return (
    <div className="relative">
      <div className={`${panel} flex flex-wrap items-center justify-center gap-[0.6em]`}>
        <span>
          Discard {prompt.n} card{prompt.n === 1 ? "" : "s"}.
        </span>
        <button disabled={cards.length !== prompt.n} onClick={() => send({ kind: "discard", seat: p.seat, cards })}>
          Done
        </button>
      </div>
      {hand(
        (i) => toggle(`hand${i}`),
        (i) => chosen.has(`hand${i}`),
      )}
    </div>
  );
}
