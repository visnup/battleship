import { useMutation } from "convex/react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { COLORS } from "../cards.ts";
import { banked, COLOR_NAMES, count, defaultPolicy, fullColors, fullSets, type Game, isAction, moves, type Move, payable, type Placed, type Player, rent, size } from "../game.ts";
import { type Choice, choose, encode, key, type Ref, ref, replay, setup } from "../replay.ts";
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
const panel = "absolute -right-[0.8em] bottom-full -left-[0.8em] mb-[1.2em] rounded-[0.6em] bg-[#123f2c] p-[0.6em] shadow-[0_-4px_12px_rgba(0,0,0,0.4)]";

/**
 * A Sly Deal, Forced Deal or Deal Breaker being filled in on the table: the moves it could be,
 * and the cards picked for what to take and what to give, by `slot`.
 */
type Steal = { moves: Move[]; take?: string; give?: string };
type Pick = { on: boolean; click: () => void };

const breaks = (m: Move) => isAction(m.card, "dealBreaker");
/** A table card as the blank it fills: a Deal Breaker takes the whole set, so any card of it will do. */
const slot = (seat: number, x: Placed, set: boolean) => `${seat}:${set ? x.color : JSON.stringify(x)}`;
const takes = (m: Move) => (m.type === "action" ? `${m.target}:${breaks(m) ? m.color : JSON.stringify(m.take)}` : "");
const gives = (seat: number, m: Move) => (m.type === "action" && m.give ? slot(seat, m.give, false) : "");

/** The log with a heading for each turn, and the mover's own lines without their name. */
function turns(log: string[], who: (n: number) => string) {
  const entries: { turn: boolean; text: string; line: number }[] = [];
  let mover = -1;
  log.forEach((text, line) => {
    const t = text.match(/^turn (\d+): P(\d) (.*)/);
    if (t) {
      mover = Number(t[2]);
      entries.push({ turn: true, text: `Turn ${t[1]}: ${who(mover)}`, line }, { turn: false, text: t[3], line });
    } else entries.push({ turn: false, text: text.startsWith(`P${mover} `) ? text.slice(3) : text, line });
  });
  return entries;
}

/** The game through its first `n` decisions, stopped there even when a bot is next, since replay would play bots on. */
const until = (game: Props["game"], n: number) => {
  const s = setup(game);
  return replay({ ...s, bots: s.bots.map(() => false) }, game.log.slice(0, n));
};

/** How many of a game's decisions it takes for its log to reach `line`. */
function decisionsTo(game: Props["game"], line: number) {
  let [lo, hi] = [0, game.log.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((until(game, mid).game.log?.length ?? 0) > line) hi = mid;
    else lo = mid + 1;
  }
  return lo;
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
  // A past board, replayed up to the decision that wrote the log line clicked
  const [past, setPast] = useState<{ decisions: number; line: number }>();
  const view = useMemo(() => (past ? until(game, past.decisions) : state), [past, game, state]);
  const g = view.game;
  const entries = turns(state.game.log ?? [], who);
  const visit = (line: number) => {
    const decisions = decisionsTo(game, line);
    setPast(decisions >= game.log.length ? undefined : { decisions, line });
  };
  const [steal, setSteal] = useState<Steal>();
  const pick =
    steal &&
    ((q: Player, x: Placed): Pick | undefined => {
      const k = slot(q.seat, x, breaks(steal.moves[0]));
      if (q.seat !== seat && steal.moves.some((m) => takes(m) === k)) return { on: steal.take === k, click: () => setSteal({ ...steal, take: steal.take === k ? undefined : k }) };
      if (q.seat === seat && steal.moves.some((m) => gives(seat, m) === k)) return { on: steal.give === k, click: () => setSteal({ ...steal, give: steal.give === k ? undefined : k }) };
    });
  const others = Array.from({ length: g.players.length }, (_, i) => (seat < 0 ? i : seat + 1 + i) % g.players.length).filter((n) => n !== seat);
  return (
    <div className="mx-auto flex max-w-[90em] flex-col gap-[0.8em] p-[0.8em]">
      <section className="flex items-start justify-center gap-[1em] rounded-[0.6em] bg-[#123f2c] px-[0.8em] py-[0.6em] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
        <div className={g.draw.length ? `${deck} ${drawn}` : `${deck} ${empty}`}>
          Draw Pile <span className="text-[#d0d0d0]">{g.draw.length}</span>
        </div>
        {g.pile.length ? <Card card={g.pile[g.pile.length - 1]} /> : <span className={`${deck} ${empty}`}>Discard</span>}
        <ul className="m-0 h-[5.4rem] list-none overflow-y-auto p-0 text-[small] opacity-80" ref={log}>
          {entries.map(({ turn, text, line }, i) => (
            <li
              key={i}
              onClick={() => visit(line)}
              className={`cursor-pointer hover:bg-white/10 ${past?.line === line && !turn ? "bg-white/20" : ""} ${
                turn
                  ? "mt-[0.3em] flex items-center gap-[0.5em] font-semibold first:mt-0 before:flex-1 before:border-t before:border-white/40 before:content-[''] after:flex-1 after:border-t after:border-white/40 after:content-['']"
                  : ""
              }`}
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
      <div className="mb-[9em] grid grid-cols-[repeat(auto-fill,minmax(20em,1fr))] gap-[0.8em]">
        {others.map((n) => (
          <Seat key={n} game={g} p={g.players[n]} name={`${who(n)}${view.result?.winner === n ? " 🏆" : ""}`} current={!view.result && g.current === n} mine={false} pick={past ? undefined : pick} />
        ))}
        {seat >= 0 && <Seat game={g} p={g.players[seat]} name={`${who(seat)}${view.result?.winner === seat ? " 🏆" : ""}`} current={!view.result && g.current === seat} mine pick={past ? undefined : pick} />}
      </div>
      <section className="sticky bottom-0 z-10 rounded-[0.6em] bg-[#123f2c] text-white shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
        <div className="px-[0.8em] pb-[0.6em]">
          {past ? (
            <p className="m-0 flex items-center justify-between pt-[0.6em]">
              Viewing the board after an earlier play. <button onClick={() => setPast(undefined)}>Back to now</button>
            </p>
          ) : result ? (
            <p className="m-0 pt-[0.6em]">{result.winner === null ? "Nobody won." : `${who(result.winner)} won!`}</p>
          ) : prompt && prompt.seat === seat ? (
            <Ask key={game.log.length} game={g} p={g.players[seat]} prompt={prompt} who={who} send={send} steal={steal} setSteal={setSteal} />
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

/** A row of sets that scrolls sideways, fading at the right while there's more that way. */
function Scroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const check = () => {
    const el = ref.current;
    // less the right padding, which scrolling doesn't reach
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useLayoutEffect(check);
  useEffect(() => {
    const observer = new ResizeObserver(check);
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  // padded so a full set's outline isn't clipped
  return (
    <div ref={ref} onScroll={check} className={`-m-[3px] mt-auto flex gap-[0.6em] overflow-x-auto p-[3px] ${more ? "[mask-image:linear-gradient(to_right,black_calc(100%_-_3em),transparent)]" : ""}`}>
      {children}
    </div>
  );
}

/** A card on the table that can fill a blank, with a radio button on its band. */
function Pickable({ pick, children }: { pick?: Pick; children: ReactNode }) {
  if (!pick) return children;
  return (
    <div role="radio" aria-checked={pick.on} tabIndex={0} className="relative cursor-pointer" onClick={pick.click} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && pick.click()}>
      {children}
      <span className={`absolute top-[0.25em] right-[0.3em] size-[0.9em] rounded-full border-2 border-[gold] shadow-[0_0_2px_black] ${pick.on ? "bg-[gold]" : "bg-white"}`} />
    </div>
  );
}

function Seat({ game, p, name, current, mine, pick }: { game: Game; p: Player; name: string; current: boolean; mine: boolean; pick?: (q: Player, x: Placed) => Pick | undefined }) {
  const colors = COLOR_NAMES.filter((c) => p.props.some((x) => x.color === c));
  const full = fullColors(game, p).length;
  return (
    <section className={`flex flex-col gap-[0.5em] rounded-[0.6em] bg-black/15 px-[0.8em] py-[0.5em] ${current ? "outline-2 outline-[gold]" : ""}`}>
      <h2 className="flex items-baseline justify-between text-base font-bold">
        {name} {!mine && <small className="font-normal opacity-70">{p.hand.length} in hand</small>}
      </h2>
      <div className="text-sm font-bold">{Math.min(full, 3)} of 3 sets</div>
      <Scroller>
        {colors.map((c) => (
          <div key={c} className={`flex flex-col self-end *:not-first:-mt-[3.95rem] ${fullSets(game, p, c) ? "rounded-[0.4em] outline-2 outline-white" : ""}`}>
            {Array.from({ length: Math.max(0, size(c) - count(p, c)) }, (_, i) => (
              <Slot key={`s${i}`} color={c} rent={COLORS[c].rent[size(c) - 1 - i]} />
            ))}
            {p.built
              .filter((x) => x.color === c)
              .map((x, i) => <Card key={`b${i}`} card={x.card} />)
              .reverse()}
            {p.props
              .filter((x) => x.color === c)
              .map((x, i) => (
                <Pickable key={i} pick={pick?.(p, x)}>
                  <Card card={x.card} rent={COLORS[c].rent[i % size(c)]} />
                </Pickable>
              ))
              .reverse()}
          </div>
        ))}
      </Scroller>
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

/** A move as a button, under a heading it shares with others when there's a choice of whom or what. */
function option(game: Game, p: Player, m: Move, who: (n: number) => string): { group?: string; label: string } {
  const t = target(m);
  if (t === undefined) return { label: describe(game, p, m, who) };
  return { group: describe(game, p, m, () => "\0").replace(/ (to|from) \0/, ""), label: who(t) };
}

const named = (x: Placed) => `${label(x.card)}${x.card.kind === "wild" ? ` (${colorName(x.color)})` : ""}`;
const stealing = (m: Move) => m.type === "action" && ["slyDeal", "forcedDeal", "dealBreaker"].some((a) => isAction(m.card, a));

/** "Take ___ for your ___", its blanks filled from the table, and the button that plays it. */
function Blanks({ p, steal, who, play }: { p: Player; steal: Steal; who: (n: number) => string; play: (m: Move) => void }) {
  const took = steal.moves.find((m) => takes(m) === steal.take);
  const gave = steal.moves.find((m) => gives(p.seat, m) === steal.give);
  const forced = isAction(steal.moves[0].card, "forcedDeal");
  const move = steal.moves.find((m) => takes(m) === steal.take && (!forced || gives(p.seat, m) === steal.give));
  const blank = (text?: string) => <span className="inline-block min-w-[7em] border-b-2 border-white/60 px-[0.3em] text-center font-bold">{text ?? " "}</span>;
  return (
    <div className="flex flex-wrap items-center justify-center gap-[0.6em]">
      <span>
        Take {blank(took?.type === "action" ? (breaks(took) ? `${who(took.target!)}'s ${colorName(took.color!)} set` : `${who(took.target!)}'s ${named(took.take!)}`) : undefined)}
        {forced && <> for your {blank(gave?.type === "action" ? named(gave.give!) : undefined)}</>}
      </span>
      <button disabled={!move} onClick={() => move && play(move)}>
        {forced ? "Swap" : "Take it"}
      </button>
    </div>
  );
}

function Ask({
  game,
  p,
  prompt,
  who,
  send,
  steal,
  setSteal,
}: {
  game: Game;
  p: Player;
  prompt: NonNullable<ReturnType<typeof replay>["prompt"]>;
  who: (n: number) => string;
  send: (c: Choice) => void;
  steal?: Steal;
  setSteal: (s?: Steal) => void;
}) {
  const [picked, setPicked] = useState<number>();
  // What the default player would do here: a move, null to end the turn, or undefined before asking
  const [hint, setHint] = useState<Move | null>();
  const card = picked === undefined || prompt.kind !== "move" ? undefined : p.hand[picked];
  // moves() lists one of each identical card, so match the picked card by what it is
  const list = card ? moves(game, p, (prompt as { left: number }).left).filter((m) => JSON.stringify(m.card) === JSON.stringify(card)) : [];
  const steals = list.filter(stealing);
  useEffect(() => {
    setSteal(steals.length ? { moves: steals, ...(hint && stealing(hint) && { take: takes(hint), give: gives(p.seat, hint) || undefined }) } : undefined);
    return () => setSteal(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, hint]);
  const hinted = (m: Move | null) => (hint !== undefined && key(encode(game, p, m)) === key(encode(game, p, hint)) ? "outline-3 outline-[gold]" : "");
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
    const play = (m: Move) => {
      const c = choose(game, p, { ...m, card: p.hand[picked!] } as Move);
      setPicked(undefined);
      send({ kind: "move", seat: p.seat, move: c });
    };
    return (
      <div className="relative">
        <div className="flex items-end gap-[0.8em]">
          <div className="flex-1">
            {hand(
              (i) => {
                setHint(undefined);
                setPicked(i === picked ? undefined : i);
              },
              (i) => i === picked,
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.6em] text-sm">
            <span>
              {prompt.left} play{prompt.left === 1 ? "" : "s"} left
            </span>
            <button className={hinted(null)} onClick={() => send({ kind: "move", seat: p.seat, move: null })}>
              End turn
            </button>
            <button
              onClick={() => {
                const m = defaultPolicy.move(game, p, prompt.left);
                setHint(m);
                setPicked(m ? p.hand.indexOf(m.card) : undefined);
              }}
            >
              Hint
            </button>
          </div>
        </div>
        {picked !== undefined && (
          <div className={`${panel} grid grid-cols-2 items-end gap-[0.6em] sm:grid-cols-4`}>
            {list.length ? (
              <>
                {[
                  ...Map.groupBy(
                    list.filter((m) => !stealing(m)).map((m) => ({ m, ...option(game, p, m, who) })),
                    (o) => o.group ?? o.label,
                  ),
                ].map(([text, os]) =>
                  os[0].group === undefined ? (
                    os.map((o, i) => (
                      <button key={`${text}${i}`} className={`mb-[0.4em] justify-self-center ${hinted(o.m)}`} onClick={() => play(o.m)}>
                        {money(text)}
                      </button>
                    ))
                  ) : (
                    <div key={text} className="flex flex-wrap items-center justify-center gap-[0.4em] rounded-[0.5em] bg-black/15 p-[0.4em]">
                      <span className="w-full px-[0.3em]">{money(text)}</span>
                      {os.map((o, i) => (
                        <button key={i} className={hinted(o.m)} onClick={() => play(o.m)}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  ),
                )}
                {steal && (
                  <div className="col-span-full sm:col-span-3">
                    <Blanks p={p} steal={steal} who={who} play={play} />
                  </div>
                )}
              </>
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
