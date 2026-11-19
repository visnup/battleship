import { useMutation } from "convex/react";
import Head from "next/head";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { type Card as CardType, COLORS } from "../cards.ts";
import { defaultPolicy, type Game, type Move, type Player } from "../game.ts";
import { type Battle, type Choice, choose, type Prompt, replay, setup } from "../replay.ts";
import { Backs, Card, Chip, label } from "./Card";

type Props = { game: Doc<"games"> & { log: Choice[]; names: (string | null)[] }; me?: Id<"players"> };

/** Floats over the table, just above the bottom bar. */
const floating = "panel absolute -right-[0.8em] bottom-full -left-[0.8em] mb-[1.2em] p-[0.8em]";

/** The game through its first `n` decisions, stopped there even when a bot is next. */
const until = (game: Props["game"], n: number) => {
  const s = setup(game);
  return replay({ ...s, bots: s.bots.map(() => false) }, game.log.slice(0, n));
};

/** How many of a game's decisions it takes for its log to reach `line`. */
function decisionsTo(game: Props["game"], line: number) {
  let [lo, hi] = [0, game.log.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (until(game, mid).lines.length > line) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const cardName = (s: string) => (/^\d+$/.test(s) ? s : s[0].toUpperCase() + s.slice(1));

/** The engine's log by round and battle, each with a heading, in words, with nobody's dealt hand. */
function entries(lines: string[], who: (n: number) => string) {
  const groups: { heading: string; line: number; lines: { text: string; line: number }[] }[] = [];
  const verb = (n: number, v: string) => `${who(n)} ${who(n) === "You" ? v.replace(/(ss)es$|s$/, "$1") : v}`;
  for (const [i, line] of lines.entries()) {
    let m;
    if ((m = line.match(/^round (\d+):/))) groups.push({ heading: `Round ${m[1]}`, line: i, lines: [{ text: "Everyone's dealt 10 cards, plus one a chip.", line: i }] });
    else if ((m = line.match(/^battle (\d+) over (\w+), favor (\d)/))) groups.push({ heading: `Battle ${m[1]}: the ${m[2]} chip`, line: i, lines: [{ text: `${verb(+m[3], "holds")} the Favor.`, line: i }] });
    else {
      const text = (m = line.match(/^ {2}(\d) plays bait for (\w+): (\d+)/))
        ? `${verb(+m[1], "Baits")} back a ${m[2]}: ${m[3]} strength.`
        : (m = line.match(/^ {2}(\d) plays (\w+): (\d+)/))
          ? `${verb(+m[1], "plays")} ${cardName(m[2])}: ${m[3]} strength.`
          : (m = line.match(/^ {2}(\d) passes(?:, discarding (.*))?/))
            ? `${verb(+m[1], "passes")}${m[2] ? `, discarding ${m[2].split(" ").map(cardName).join(", ")}` : ""}.`
            : (m = line.match(/^ {2}doves: no one wins the (\w+) chip/))
              ? `Doves: nobody wins the ${m[1]} chip.`
              : (m = line.match(/^ {2}(\d) wins the (\w+) chip with (\d+)/))
                ? `${verb(+m[1], "wins")} the ${m[2]} chip with ${m[3]}.`
                : line.trim();
      if (!groups.length) groups.push({ heading: "", line: i, lines: [] });
      groups.at(-1)!.lines.push({ text, line: i });
    }
  }
  return groups;
}

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

export function Board({ game, me }: Props) {
  const decide = useMutation(api.games.decide);
  const [error, setError] = useState<string>();
  const state = useMemo(() => until(game, game.log.length), [game]);
  const seat = game.seats.findIndex((s) => "player" in s && s.player === me);
  // Others' decisions shown one at a time, so each play can be seen. A long gap, like opening the page, jumps to now.
  const [shown, setShown] = useState(game.log.length);
  const [step] = useState(() => SPEEDS[stepSpeed()]);
  const stepping = shown < game.log.length;
  useEffect(() => {
    if (!stepping) return;
    const jump = !step || game.log.length - shown > 40;
    const t = setTimeout(() => setShown((n) => (jump ? game.log.length : n + 1)), jump || game.log[shown].seat === seat ? 0 : step);
    return () => clearTimeout(t);
  }, [stepping, step, shown, game.log, seat]);
  // A past board, replayed up to the decision that wrote the log line clicked
  const [past, setPast] = useState<{ decisions: number; line: number }>();
  const view = useMemo(() => (past ? until(game, past.decisions) : stepping ? until(game, shown) : state), [past, stepping, shown, game, state]);
  const visit = (line: number) => {
    const decisions = decisionsTo(game, line);
    setPast(decisions >= game.log.length ? undefined : { decisions, line });
  };
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
  const log = useRef<HTMLDivElement>(null);
  const height = useRef(0);
  // the whole log while looking back, so later lines can be clicked too
  const logged = (past ? state : view).lines;
  const lines = logged.length;
  // follow new lines only when already at the bottom, so scrolling back through it stays put
  useLayoutEffect(() => {
    const el = log.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= height.current - 4) el.scrollTo({ top: el.scrollHeight });
    height.current = el.scrollHeight;
  }, [lines]);
  const g = view.game;
  const others = Array.from({ length: g.players.length }, (_, i) => (seat < 0 ? i : seat + 1 + i) % g.players.length).filter((n) => n !== seat);
  return (
    <div className="mx-auto flex max-w-[90em] flex-col gap-[0.8em] p-[0.8em]">
      <Head>
        <title>{up ? "Your move · Hilt" : "Hilt"}</title>
      </Head>
      <section className="panel sticky top-[0.8em] z-10 flex items-start gap-[1em] p-[0.8em]">
        <div className="flex w-[9em] shrink-0 flex-col items-center gap-[0.3em] text-center">
          {g.fighting && g.color ? (
            <>
              <span className="label">Battle {g.battles}</span>
              <Chip color={g.color} />
              <span className="text-sm">the {g.color} chip</span>
              {g.winter && <span className="text-sm">❄️ Winter: force cards are 1</span>}
            </>
          ) : (
            <>
              <span className="label">Round {g.rounds}</span>
              <span className="text-sm">{view.result ? "Game over" : `${who(g.favor)} ${g.favor === seat ? "pick" : "picks"} the next chip`}</span>
            </>
          )}
        </div>
        <div className="h-[5.4rem] flex-1 overflow-y-auto text-sm text-white/80" ref={log}>
          {entries(logged, who).map(({ heading, line: first, lines }, i) => (
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
                    {text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      <div className="mb-[10em] grid grid-cols-[repeat(auto-fill,minmax(18em,1fr))] gap-[0.8em]">
        {(seat >= 0 ? [...others, seat] : others).map((n) => (
          <Seat
            key={n}
            game={g}
            p={g.players[n]}
            name={`${who(n)}${view.result?.winner === n ? " 🏆" : ""}`}
            level={"bot" in game.seats[n] ? game.seats[n].bot : undefined}
            current={!view.result && view.prompt?.seat === n}
            last={view.last}
            played={discarded(view.lines).get(n) ?? []}
          />
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
            <Ask key={game.log.length} game={g} p={g.players[seat]} prompt={prompt} send={send} />
          ) : (
            <div className="flex items-end gap-[0.8em]">
              <div className="min-w-0 flex-1">{seat >= 0 && <Hand cards={g.players[seat].hand} />}</div>
              <div className="flex shrink-0 flex-col items-center justify-center self-stretch pt-[0.8em]">
                <span className="label">Waiting for {view.prompt ? who(view.prompt.seat) : "…"}</span>
                {stepping && (
                  <button className="quiet mt-[0.4em] px-3 py-1 text-sm" onClick={() => setShown(game.log.length)}>
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
          {error && <p className="text-[#ff8a8a]">{error}</p>}
        </div>
      </section>
    </div>
  );
}

/** A row of cards that scrolls sideways. */
const ORDER: CardType["kind"][] = ["force", "legend", "fury", "bait", "winter", "crows", "doves"];
const rank = (c: CardType) => ORDER.indexOf(c.kind) * 100 + c.value;

/** A hand, sorted and overlapped so every card shows its corner without scrolling. `onClick` and the rest take places in the hand as dealt, not as shown. */
export function Hand({ cards, onClick, selected, hinted, dim }: { cards: CardType[]; onClick?: (i: number) => void; selected?: number; hinted?: number; dim?: (c: CardType) => boolean }) {
  const order = cards.map((_, i) => i).sort((a, b) => rank(cards[a]) - rank(cards[b]));
  // the cards that can't be played now, held apart to the right
  const groups = [order.filter((i) => !dim?.(cards[i])), order.filter((i) => dim?.(cards[i]))].filter((g) => g.length);
  return (
    <div className="flex justify-center gap-[1em] pt-[1.2em]">
      {groups.map((group, g) => (
        <div key={g} className="flex *:not-first:-ml-[2.5em] *:hover:z-10">
          {group.map((i) => (
            <div key={i} className={`relative ${selected === i ? "z-10" : ""}`}>
              <Card card={cards[i]} selected={selected === i} hinted={hinted === i} dim={dim?.(cards[i])} onClick={onClick && (() => onClick(i))} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** How long each of others' plays shows before the next, in ms, or 0 for all at once. */
export const SPEEDS = { off: 0, fast: 400, slow: 900 };
export type Speed = keyof typeof SPEEDS;

/** This browser's speed, as last chosen in the lobby. */
export function stepSpeed(): Speed {
  try {
    const s = localStorage.getItem("step");
    return s && s in SPEEDS ? (s as Speed) : "fast";
  } catch {
    return "fast";
  }
}

export function setStepSpeed(s: Speed) {
  try {
    localStorage.setItem("step", s);
  } catch {}
}

/** A bot's kind of player, as the lobby and its seat name it. */
export type Level = "first default" | "default" | "learned";
export const LEVELS: Record<Level, { name: string; title: string }> = {
  "first default": { name: "Easy", title: "Fights every battle, like a new player" },
  default: { name: "Medium", title: "Plays by rules tuned against playouts" },
  learned: { name: "Hard", title: "Plays by the learned model" },
};

/** A player's place at the table: chips, the Favor, cards in hand, and their row in this battle, or the last one's between battles. */
/**
 * The Winters and Baits each seat played in the battle on the board, the current one or the last
 * to end. They're discarded as they're played, so only the log knows.
 */
function discarded(lines: string[]) {
  const start = lines.findLastIndex((l) => l.startsWith("battle "));
  const out = new Map<number, { card: CardType; took?: CardType }[]>();
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^ {2}(\d) plays (winter|bait)(?: for (\d+))?/);
    if (m) out.set(+m[1], [...(out.get(+m[1]) ?? []), { card: { kind: m[2] as "winter" | "bait", value: 0 }, ...(m[3] && { took: { kind: "force", value: +m[3] } }) }]);
  }
  return out;
}

function Seat({ game, p, name, level, current, last, played }: { game: Game; p: Player; name: string; level?: Level; current: boolean; last?: Battle; played: { card: CardType; took?: CardType }[] }) {
  const fighting = game.fighting;
  const row = fighting ? p.row : (last?.rows[p.seat] ?? []);
  const strength = fighting ? game.strength(p) : last?.strengths[p.seat];
  const leads = fighting ? game.leader() === p.seat : last?.winner === p.seat;
  return (
    <section className={`seat flex flex-col gap-[0.4em] py-[0.6em] ${current ? "current" : ""}`}>
      <h2 className="m-0 flex flex-wrap items-center gap-x-[0.5em] gap-y-[0.2em] text-base font-bold">
        <span>
          {name}
          {level && (
            <small className="ml-[0.5em] text-sm font-normal opacity-60" title={LEVELS[level].title}>
              {LEVELS[level].name}
            </small>
          )}
        </span>
        {game.favor === p.seat && (
          <span className="rounded-full bg-accent px-[0.6em] py-[0.1em] text-xs font-bold" title="The Favor: picks the chip, has 1 strength before playing anything, and acts last">
            Favor
          </span>
        )}
        <span className="ml-auto flex items-center gap-[0.3em]">
          {COLORS.map((c, i) => (
            <Chip key={c} color={c} n={p.chips[i]} faded={!p.chips[i]} />
          ))}
        </span>
      </h2>
      <div className="flex min-h-[calc(6.3*0.65rem)] items-center gap-[0.8em]">
        {strength !== undefined && (fighting || last) && (
          <span className={`flex min-w-[4.5em] flex-col items-center gap-[0.2em] whitespace-nowrap ${fighting ? "" : "opacity-50"}`}>
            <span className={`text-xl leading-none font-extrabold ${leads ? "text-accent" : ""}`}>{strength}</span>
            <span className="label">{fighting ? (p.passed ? "passed" : leads ? "leads" : "strength") : leads ? "won" : ""}</span>
          </span>
        )}
        <div className={`flex *:not-first:-ml-[1.9em] ${fighting ? "" : "opacity-50"}`}>
          {row.map((c, i) => (
            <Card key={i} card={c} small />
          ))}
        </div>
        {played.length > 0 && (
          <div
            className={`flex *:not-first:-ml-[1.9em] ${fighting ? "" : "opacity-50"}`}
            title="Played and discarded: not in the row, and not counted as cards played. A Bait shows the card it took back above it, grayed, since it's back in hand."
          >
            {played.map(({ card, took }, i) => (
              <div key={i} className="relative">
                {took && (
                  <div className="absolute -top-[1.1em] left-[0.5em]">
                    <Card card={took} small dim />
                  </div>
                )}
                <div className="relative">
                  <Card card={card} small />
                </div>
              </div>
            ))}
          </div>
        )}
        <span className="ml-auto flex items-center gap-[0.6em]">
          <Backs n={p.hand.length} />
          <span className="flex min-w-[4.5em] flex-col items-center gap-[0.2em]">
            <span className="text-xl leading-none font-extrabold">{p.hand.length}</span>
            <span className="label whitespace-nowrap">in hand</span>
          </span>
        </span>
      </div>
    </section>
  );
}

/** A question floating over the table with its answers, and the hand in the bar below. */
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

function Ask({ game, p, prompt, send }: { game: Game; p: Player; prompt: Prompt; send: (c: Choice) => void }) {
  const [picked, setPicked] = useState<number>();
  const [hint, setHint] = useState<{ move?: Move; color?: string; dump?: boolean }>();
  const hinted = (on: boolean) => (on ? "outline-3 outline-accent" : "");
  if (prompt.kind === "color")
    return (
      <Asking
        question="Pick the chip for the next battle:"
        answers={
          <>
            {COLORS.map((c) => (
              <button key={c} className={`quiet flex items-center gap-[0.4em] ${hinted(hint?.color === c)}`} onClick={() => send({ kind: "color", seat: p.seat, color: c })}>
                <Chip color={c} /> {c}
              </button>
            ))}
            <button className="quiet" onClick={() => setHint({ color: defaultPolicy.color(game, p) })}>
              Hint
            </button>
          </>
        }
      >
        <Hand cards={p.hand} />
      </Asking>
    );
  if (prompt.kind === "dump")
    return (
      <Asking
        question="You've no force cards left. Show your hand and discard it?"
        answers={
          <>
            <button className={hinted(hint?.dump === true)} onClick={() => send({ kind: "dump", seat: p.seat, dump: true })}>
              Discard it
            </button>
            <button className={hinted(hint?.dump === false)} onClick={() => send({ kind: "dump", seat: p.seat, dump: false })}>
              Keep it
            </button>
            <button className="quiet" onClick={() => setHint({ dump: defaultPolicy.dump(game, p) })}>
              Hint
            </button>
          </>
        }
      >
        <Hand cards={p.hand} />
      </Asking>
    );
  const card = picked === undefined ? undefined : p.hand[picked];
  const play = (m: Move) => {
    setPicked(undefined);
    send({ kind: "move", seat: p.seat, ...choose(p, m) });
  };
  // Bait can take back any force card in the row, so one option for each value there
  const takes = card?.kind === "bait" ? [...new Map(p.row.filter((c) => c.kind === "force").map((c) => [c.value, c])).values()].sort((a, b) => b.value - a.value) : [];
  const hintIndex = hint?.move ? p.hand.indexOf(hint.move.card) : undefined;
  return (
    <div className="relative">
      <div className="flex items-end gap-[0.8em]">
        <div className="min-w-0 flex-1">
          <Hand
            cards={p.hand}
            selected={picked}
            hinted={hintIndex}
            dim={(c) => !game.playable(p, c)}
            onClick={(i) => {
              setHint(undefined);
              setPicked(i === picked ? undefined : i);
            }}
          />
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center gap-[0.4em] self-stretch pt-[0.8em]">
          <button className={hint && hint.move === null ? "outline-3 outline-accent" : ""} onClick={() => send({ kind: "move", seat: p.seat, card: null })} title="Passing is for the rest of the battle">
            Pass
          </button>
          <button
            className="quiet"
            onClick={() => {
              const m = defaultPolicy.move(game, p);
              setHint({ move: m });
              setPicked(m ? p.hand.indexOf(m.card) : undefined);
            }}
          >
            Hint
          </button>
        </div>
      </div>
      {card && (
        <div className={`${floating} flex flex-wrap items-center justify-center gap-[0.6em]`}>
          {!game.playable(p, card) ? (
            <span>{card.kind === "bait" ? "Bait needs a force card in your row to take back." : `You can't play ${label(card)} again this battle.`}</span>
          ) : card.kind === "bait" ? (
            takes.map((t) => (
              <button key={t.value} className={hinted(hint?.move?.card.kind === "bait" && hint.move.take?.value === t.value)} onClick={() => play({ card, take: t })}>
                Take back the {t.value}
              </button>
            ))
          ) : (
            <button className="primary" onClick={() => play({ card })}>
              Play {label(card)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
