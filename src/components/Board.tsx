import { useMutation } from "convex/react";
import Head from "next/head";
import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { BIRTHDAY, type Card as CardType, COLORS, DEBT } from "../cards.ts";
import { banked, COLOR_NAMES, count, defaultPolicy, fullColors, fullSets, type Game, isAction, moves, type Move, name, payable, type Placed, type Player, rent, size, worth } from "../game.ts";
import { street } from "../streets.ts";
import { type Choice, choose, encode, key, type Ref, ref, replay, setup } from "../replay.ts";
import { Card, colorName, label, money, PAINT, Slot } from "./Card";

type Props = { game: Doc<"games"> & { log: Choice[]; names: (string | null)[] }; me?: Id<"players"> };

const id = (r: Ref) => `${r.pile}${r.i}`;

function Row({ children }: { children: ReactNode }) {
  return <Scroller className="gap-[0.4em] pt-[0.8em]">{children}</Scroller>;
}

const deck = "card flex flex-col items-center justify-center px-[0.3em] text-center leading-[1.2]";
const drawn = "border-[0.3em] border-white bg-[#b8292f] font-extrabold text-white shadow-[2px_2px_0_-1px_white,2px_2px_0_0_rgba(0,0,0,0.3),4px_4px_0_-1px_white,4px_4px_0_0_rgba(0,0,0,0.3)]";
const empty = "border-2 border-dashed border-white/40";
/** Floats over the table, just above the bottom bar. */
const floating = "panel absolute -right-[0.8em] bottom-full -left-[0.8em] mb-[1.2em] p-[0.8em]";

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

/** The log by turn, each with a heading, and the mover's own lines without their name. */
function turns(log: string[], who: (n: number) => string) {
  const groups: { heading?: string; line: number; lines: { text: string; line: number }[] }[] = [];
  let mover = -1;
  log.forEach((text, line) => {
    const t = text.match(/^turn (\d+): P(\d) (.*)/);
    if (t) {
      mover = Number(t[2]);
      groups.push({ heading: `Turn ${t[1]}: ${who(mover)}`, line, lines: [{ text: t[3], line }] });
    } else {
      if (!groups.length) groups.push({ line, lines: [] });
      groups.at(-1)!.lines.push({ text: text.startsWith(`P${mover} `) ? text.slice(3) : text, line });
    }
  });
  return groups;
}

/** The game through its first `n` decisions, stopped there even when a bot is next, since replay would play bots on. */
const until = (game: Props["game"], n: number) => {
  const s = setup(game);
  return replay({ ...s, bots: s.bots.map(() => false) }, game.log.slice(0, n));
};

/** Two soft rising notes. Browsers keep audio off until the page has been clicked, which joining a table does. */
function chime() {
  try {
    const audio = new AudioContext();
    [660, 880].forEach((hz, i) => {
      const at = audio.currentTime + i * 0.12;
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.frequency.value = hz;
      volume.gain.setValueAtTime(0.08, at);
      volume.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.3);
    });
    setTimeout(() => audio.close(), 1000);
  } catch {}
}

/** The cards in `after`'s banks, sets, buildings and discard pile that weren't there in `before`. */
function arrivals(before: Game, after: Game) {
  const out = new Set<CardType>();
  const piles = (g: Game) => [...g.players.flatMap((p) => [p.bank, p.props.map((x) => x.card), p.built.map((x) => x.card)]), g.pile];
  const was = piles(before);
  piles(after).forEach((pile, i) => {
    const left = new Map<string, number>();
    for (const c of was[i]) left.set(street(c) ?? name(c), (left.get(street(c) ?? name(c)) ?? 0) + 1);
    for (const c of pile) {
      const k = street(c) ?? name(c);
      if (left.get(k)) left.set(k, left.get(k)! - 1);
      else out.add(c);
    }
  });
  return out;
}

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
  const log = useRef<HTMLDivElement>(null);
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
  // Others' decisions shown one at a time, so each play can be seen. A long gap, like opening the page, jumps to now.
  const [shown, setShown] = useState(game.log.length);
  const stepping = shown < game.log.length;
  useEffect(() => {
    if (!stepping) return;
    const wait = game.log.length - shown > 40 ? 0 : game.log[shown].seat === seat ? 0 : 700;
    const t = setTimeout(() => setShown((n) => (game.log.length - n > 40 ? game.log.length : n + 1)), wait);
    return () => clearTimeout(t);
  }, [stepping, shown, game.log, seat]);
  const who = (n: number) => (n === seat ? "You" : "bot" in game.seats[n] ? `Bot ${n + 1}` : (game.names[n] ?? `Player ${n + 1}`));
  const send = (choice: Choice) => {
    setError(undefined);
    decide({ game: game._id, player: me!, choice }).catch((e) => setError(String(e.message ?? e)));
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
  // when it comes to you, say so in the tab's title and chime, since you might be in another tab
  const up = !stepping && !result && prompt?.seat === seat;
  const wasUp = useRef(up);
  useEffect(() => {
    if (up && !wasUp.current) chime();
    wasUp.current = up;
  }, [up]);
  // A past board, replayed up to the decision that wrote the log line clicked
  const [past, setPast] = useState<{ decisions: number; line: number }>();
  const view = useMemo(() => (past ? until(game, past.decisions) : stepping ? until(game, shown) : state), [past, stepping, shown, game, state]);
  // what landed in the last step, or once caught up, everything since your last decision
  const glow = useMemo(() => {
    if (past) return past.decisions > 0 ? arrivals(until(game, past.decisions - 1).game, view.game) : new Set<CardType>();
    const from = stepping ? shown - 1 : seat >= 0 ? game.log.findLastIndex((c) => c.seat === seat) + 1 : shown;
    return from >= 0 && from < shown && game.log[from].seat !== seat ? arrivals(until(game, from).game, view.game) : new Set<CardType>();
  }, [past, stepping, shown, seat, game, view]);
  const g = view.game;
  const entries = turns((past ? state : view).game.log ?? [], who);
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
      <Head>
        <title>{up ? "Your move · Monopoly Deal" : "Monopoly Deal"}</title>
      </Head>
      <section className="panel pinned z-10 flex items-start justify-center gap-[1em] p-[0.8em]">
        <div className={g.draw.length ? `${deck} ${drawn}` : `${deck} ${empty}`}>
          Draw Pile <span className="text-[#d0d0d0]">{g.draw.length}</span>
        </div>
        {g.pile.length ? <Card key={g.pile.length} card={g.pile[g.pile.length - 1]} glow={glow.has(g.pile[g.pile.length - 1])} /> : <span className={`${deck} ${empty}`}>Discard</span>}
        <div className="h-[5.4rem] overflow-y-auto text-sm text-white/80" ref={log}>
          {entries.map(({ heading, line: first, lines }, i) => (
            <section key={i}>
              {heading && (
                <h3
                  onClick={() => visit(first)}
                  className="sticky top-0 m-0 flex cursor-pointer items-center gap-[0.5em] px-[0.3em] pt-[0.3em] text-sm font-semibold before:flex-1 before:border-t before:border-white/40 before:content-[''] after:flex-1 after:border-t after:border-white/40 after:content-['']"
                  style={{ background: "var(--bar)" }}
                >
                  {heading}
                </h3>
              )}
              <ul>
                {lines.map(({ text, line }) => (
                  <li key={line} onClick={() => visit(line)} className={`cursor-pointer rounded-sm px-[0.3em] hover:bg-white/10 ${past?.line === line ? "bg-white/20" : ""}`}>
                    {money(
                      text
                        .replace(/P(\d)/g, (_, n) => who(Number(n)))
                        .replace(/\bYou (\w+)s\b/g, "You $1")
                        .replace(/\b(\w+) as \1\b/g, "$1")
                        .replace(/\b(wild|rent)\(/g, (_, w) => `${w[0].toUpperCase()}${w.slice(1)} (`)
                        .replace(/\b[a-z]+[A-Z]\w*/g, colorName)
                        .replace(new RegExp(`\\b(${COLOR_NAMES.join("|")})\\b`, "g"), colorName)
                        .replace(/^./, (c) => c.toUpperCase()),
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      <div className="mb-[9em] grid grid-cols-[repeat(auto-fill,minmax(20em,1fr))] gap-[0.8em]">
        {(seat >= 0 ? [...others, seat] : others).map((n) => (
          <Seat key={n} game={g} p={g.players[n]} name={`${who(n)}${view.result?.winner === n ? " 🏆" : ""}`} current={!view.result && g.current === n} mine={n === seat} pick={past ? undefined : pick} glow={glow} />
        ))}
      </div>
      <section className="panel sticky bottom-0 z-10 text-white">
        <div className="px-[0.8em] pb-[0.8em]">
          {past ? (
            <p className="m-0 flex items-center justify-between pt-[0.8em]">
              Viewing the board after an earlier play.{" "}
              <button className="primary" onClick={() => setPast(undefined)}>
                Back to now
              </button>
            </p>
          ) : view.result ? (
            <p className="m-0 pt-[0.8em] font-bold">{view.result.winner === null ? "Nobody won." : `${who(view.result.winner)} won!`}</p>
          ) : !stepping && prompt && prompt.seat === seat ? (
            <Ask key={game.log.length} game={g} p={g.players[seat]} prompt={prompt} who={who} send={send} steal={steal} setSteal={setSteal} />
          ) : (
            <div className="flex items-end gap-[0.8em]">
              <div className="min-w-0 flex-1">
                {seat >= 0 && (
                  <Row>
                    {g.players[seat].hand.map((c, i) => (
                      <Card key={i} card={c} />
                    ))}
                  </Row>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center justify-center self-stretch pt-[0.8em]">
                <span className="label">Waiting for {view.prompt ? who(view.prompt.seat) : "…"}</span>
              </div>
            </div>
          )}
          {error && <p className="text-[#ff8a8a]">{error}</p>}
        </div>
      </section>
    </div>
  );
}

/** A row of cards or sets that scrolls sideways, fading at either end while there's more that way. */
function Scroller({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const check = () => {
    const el = ref.current;
    if (!el) return;
    // less the right padding, which scrolling doesn't reach
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 9;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  };
  const fade = (on: boolean) => (on ? "transparent" : "black");
  useLayoutEffect(check);
  useEffect(() => {
    const observer = new ResizeObserver(check);
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  // padded so a full set's outline, or a picked or glowing card's, isn't clipped
  return (
    <div
      ref={ref}
      onScroll={check}
      className={`-m-[8px] flex overflow-x-auto p-[8px] ${className}`}
      style={{ maskImage: `linear-gradient(to right, ${fade(more.left)}, black 3em, black calc(100% - 3em), ${fade(more.right)})` }}
    >
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
      <span className={`absolute top-[0.25em] right-[0.3em] size-[0.9em] rounded-full border-2 border-gold shadow-[0_0_2px_black] ${pick.on ? "bg-gold" : "bg-white"}`} />
    </div>
  );
}

function Seat({ game, p, name, current, mine, pick, glow }: { game: Game; p: Player; name: string; current: boolean; mine: boolean; pick?: (q: Player, x: Placed) => Pick | undefined; glow: Set<CardType> }) {
  const colors = COLOR_NAMES.filter((c) => p.props.some((x) => x.color === c));
  const near = fullColors(game, p).length >= 2;
  // every set, full or started, in the table's order
  const pills = colors.flatMap((c) => {
    const full = fullSets(game, p, c);
    const rest = count(p, c) - full * size(c);
    return [...Array.from({ length: full }, () => ({ c, n: size(c), full: true })), ...(rest ? [{ c, n: Math.min(rest, size(c)), full: false }] : [])];
  });
  return (
    <section className={`seat flex flex-col gap-[0.5em] ${current ? "current" : ""}`}>
      <h2 className="m-0 flex items-baseline justify-between text-base font-bold">
        {name} {!mine && <small className="label">{p.hand.length} in hand</small>}
      </h2>
      <div className="flex flex-wrap items-center gap-x-[0.6em] gap-y-[0.3em]">
        {pills.map(({ c, n, full }, k) => (
          <span
            key={k}
            title={full ? `${colorName(c)}: full set` : `${colorName(c)}: ${n} of ${size(c)}`}
            className={`flex overflow-hidden rounded-full ${full ? `full ${near ? "near" : ""}` : "outline outline-white/50"}`}
          >
            {Array.from({ length: size(c) }, (_, i) => (
              <span key={i} className="h-[0.7em] w-[0.6em] bg-white/20 not-first:border-l not-first:border-white/50" style={i < n ? { background: PAINT[c] } : undefined} />
            ))}
          </span>
        ))}
      </div>
      <Scroller className="mt-auto gap-[0.6em]">
        {colors.map((c) => (
          <div key={c} className={`flex flex-col self-end *:not-first:-mt-[3.95rem] ${fullSets(game, p, c) ? "rounded-[0.4em] outline-2 outline-white" : ""}`}>
            {Array.from({ length: Math.max(0, size(c) - count(p, c)) }, (_, i) => (
              <Slot key={`s${i}`} color={c} rent={COLORS[c].rent[size(c) - 1 - i]} />
            ))}
            {p.built
              .filter((x) => x.color === c)
              .map((x, i) => <Card key={`b${i}`} card={x.card} glow={glow.has(x.card)} />)
              .reverse()}
            {p.props
              .filter((x) => x.color === c)
              .map((x, i) => (
                <Pickable key={i} pick={pick?.(p, x)}>
                  <Card card={x.card} rent={COLORS[c].rent[i % size(c)]} glow={glow.has(x.card)} />
                </Pickable>
              ))
              .reverse()}
          </div>
        ))}
      </Scroller>
      <div className="label">{money(`$${banked(p)}M`)} banked</div>
      <Scroller className="min-h-[calc(5.355rem_+_16px)] *:not-first:-ml-[2.25rem]">
        {p.bank.map((c, i) => (
          <Card key={i} card={c} banked glow={glow.has(c)} />
        ))}
      </Scroller>
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
      return `Birthday: $${BIRTHDAY}M from everyone`;
    case "debtCollector":
      return `Debt Collector: $${DEBT}M from ${to}`;
    case "slyDeal":
      return `Take ${theirs} ${named(m.take!)}`;
    case "forcedDeal":
      return `Swap ${who(p.seat) === "You" ? "your" : "their"} ${named(m.give!)} for ${theirs} ${named(m.take!)}`;
    case "dealBreaker":
      return `Take ${theirs} ${colorName(m.color!)} set`;
    default:
      return label(m.card);
  }
}

/** A question floating over the table with its answers, and the cards it's about in the bar below. */
function Asking({ question, answers, children }: { question: ReactNode; answers: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <div className={`${floating} flex flex-wrap items-center justify-center gap-[0.6em]`}>
        <span>{question}</span>
        {answers}
      </div>
      {children}
    </div>
  );
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
      <button className="primary" disabled={!move} onClick={() => move && play(move)}>
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
  const showSteal = useEffectEvent(() => setSteal(steals.length ? { moves: steals, ...(hint && stealing(hint) && { take: takes(hint), give: gives(p.seat, hint) || undefined }) } : undefined));
  useEffect(() => {
    showSteal();
    return () => setSteal(undefined);
  }, [picked, hint, setSteal]);
  const hinted = (m: Move | null) => (hint !== undefined && key(encode(game, p, m)) === key(encode(game, p, hint)) ? "outline-3 outline-gold" : "");
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
          <div className="min-w-0 flex-1">
            {hand(
              (i) => {
                setHint(undefined);
                setPicked(i === picked ? undefined : i);
              },
              (i) => i === picked,
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.8em]">
            <span className="label">
              {prompt.left} play{prompt.left === 1 ? "" : "s"} left
            </span>
            <button className={hinted(null)} onClick={() => send({ kind: "move", seat: p.seat, move: null })}>
              End turn
            </button>
            <button
              className="quiet"
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
          <div className={`${floating} grid grid-cols-2 items-end gap-[0.6em] sm:grid-cols-4`}>
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
                    <div key={text} className="flex flex-wrap items-center justify-center gap-[0.4em] rounded-lg bg-white/10 p-[0.4em]">
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
    const total = picks.reduce((s, x) => s + worth(x), 0);
    return (
      <Asking
        question={
          <>
            You owe {who(prompt.to)} {money(`$${prompt.amount}M`)}. Picked {money(`$${total}M`)}.
          </>
        }
        answers={
          <button className="primary" disabled={total < prompt.amount && picks.length < all.length} onClick={() => send({ kind: "pay", seat: p.seat, paid: picks.map((x) => ref(p, x)) })}>
            Pay
          </button>
        }
      >
        <Row>
          {all.map((x) => {
            const k = id(ref(p, x));
            return "kind" in x ? <Card key={k} card={x} banked selected={chosen.has(k)} onClick={() => toggle(k)} /> : <Card key={k} card={x.card} color={x.color} selected={chosen.has(k)} onClick={() => toggle(k)} />;
          })}
        </Row>
      </Asking>
    );
  }
  if (prompt.kind === "sayNo")
    return (
      <Asking
        question={
          <>
            {who(prompt.from)}: {money(describe(game, game.players[prompt.from], prompt.move, who))}. Just Say No?
          </>
        }
        answers={
          <>
            <button onClick={() => send({ kind: "sayNo", seat: p.seat, no: true })}>Say no</button>
            <button onClick={() => send({ kind: "sayNo", seat: p.seat, no: false })}>Let it through</button>
          </>
        }
      >
        {hand(
          () => {},
          () => false,
        )}
      </Asking>
    );
  const cards = [...chosen].filter((k) => k.startsWith("hand")).map((k) => Number(k.slice(4)));
  return (
    <Asking
      question={`Discard ${prompt.n} card${prompt.n === 1 ? "" : "s"}.`}
      answers={
        <button className="primary" disabled={cards.length !== prompt.n} onClick={() => send({ kind: "discard", seat: p.seat, cards })}>
          Done
        </button>
      }
    >
      {hand(
        (i) => toggle(`hand${i}`),
        (i) => chosen.has(`hand${i}`),
      )}
    </Asking>
  );
}
