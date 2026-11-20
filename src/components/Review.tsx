import { useEffect, useMemo, useRef, useState } from "react";
import type { Choice, Setup } from "../replay.ts";
import { DEALS, type Reviewed } from "../review.ts";

const pct = (x: number) => `${Math.round(100 * x)}%`;
const points = (x: number) => Math.round(100 * x);

type Option = { key: string; win: number };
type Scored = Reviewed & { best: Option; mine: Option; lost: number; beat: number; did: string; better: string };

/**
 * Your chance of winning after each of your plays, like a chess engine's evaluation chart: a red
 * drop where another play had more, a blue dot where you beat the Hard bot's pick, turns along
 * the bottom, and a fair share dashed. Clicking a play shows the board then.
 */
function Chances({ rows, fair, show }: { rows: Scored[]; fair: number; show: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // the board's show() is new each render, and redrawing for it would lose the pointer
  const latest = useRef(show);
  useEffect(() => {
    latest.current = show;
  });
  useEffect(() => {
    let gone = false;
    // Plot only loads for a game's review
    import("@observablehq/plot").then((Plot) => {
      const el = box.current;
      if (gone || !el) return;
      const data = rows.map((r, i) => ({ ...r, i, win: r.mine.win }));
      // each turn's first play, labeled with its number
      const firsts = new Map(data.filter((d, j) => !j || data[j - 1].turn !== d.turn).map((d) => [d.i, d.turn]));
      const plot = Plot.plot({
        width: el.clientWidth,
        height: 160,
        marginLeft: 36,
        marginTop: 28,
        style: { background: "transparent", color: "white" },
        x: { domain: [-0.5, data.length - 0.5], ticks: [...firsts.keys()], tickFormat: (i: number) => String(firsts.get(i)), label: "turn" },
        y: { domain: [0, 1], ticks: [0, 0.5, 1], tickFormat: "%", grid: true, label: null },
        marks: [
          Plot.ruleY([fair], { strokeDasharray: "3 3", strokeOpacity: 0.5 }),
          Plot.ruleX(
            data.filter((d) => d.lost >= 0.05),
            { x: "i", y1: (d) => d.best.win, y2: "win", stroke: "#ff8a8a", strokeWidth: 2 },
          ),
          Plot.lineY(data, { x: "i", y: "win", stroke: "#f2c94c", strokeWidth: 2 }),
          Plot.dot(data, {
            x: "i",
            y: "win",
            r: (d) => (d.lost >= 0.05 || d.beat >= 0.05 ? 4 : 2.5),
            fill: (d) => (d.lost >= 0.05 ? "#ff8a8a" : d.beat >= 0.05 ? "#7fb3ff" : "white"),
            stroke: "#123f2c",
            strokeWidth: 1.5,
          }),
          // in place of a tip, which would cover the line: a rule at the play under the pointer,
          // and what happened there in the top margin
          Plot.ruleX(data, Plot.pointerX({ x: "i", stroke: "white", strokeOpacity: 0.35 })),
          Plot.text(
            data,
            Plot.pointerX({
              x: "i",
              frameAnchor: "top",
              lineAnchor: "bottom",
              dy: -12,
              fontSize: 12,
              // above the play, but anchored to whichever side keeps it on the chart
              render(index, scales, values, dimensions, context, next) {
                const g = next!(index, scales, values, dimensions, context)!;
                const x = (values.x as number[] | undefined)?.[index[0]];
                if (x !== undefined) g.setAttribute("text-anchor", x < dimensions.width / 3 ? "start" : x > (2 * dimensions.width) / 3 ? "end" : "middle");
                return g;
              },
              text: (d) => `Turn ${d.turn}: ${d.did}, ${pct(d.win)}${d.lost >= 0.01 ? ` · ${d.better} had ${pct(d.best.win)}` : ""}`,
            }),
          ),
        ],
      });
      // clicking the play under the pointer, now pinned, shows the board then
      plot.addEventListener("click", () => {
        const d = (plot as unknown as { value?: Scored }).value;
        if (d) latest.current(d.n);
      });
      // Plot unpins on a click away from the pinned point, with no option to re-pin instead
      // (pointerdown in 0.6.19's pointer.js). After its own listener has unpinned, point and press
      // again where the click was. On the pinned marks Plot stays pinned, for these too.
      let pinned = false;
      plot.addEventListener("pointerdown", (event) => {
        const e = event as PointerEvent;
        if (e.pointerType !== "mouse" || !e.isTrusted) return;
        if (!(pinned = !pinned)) {
          const init = { clientX: e.clientX, clientY: e.clientY, pointerType: "mouse", bubbles: true };
          e.target!.dispatchEvent(new PointerEvent("pointermove", init));
          e.target!.dispatchEvent(new PointerEvent("pointerdown", init));
          pinned = true;
        }
      });
      plot.style.cursor = "pointer";
      el.replaceChildren(plot);
    });
    return () => {
      gone = true;
    };
  }, [rows, fair]);
  return <div ref={box} className="my-[0.6em]" aria-label="Your chance of winning after each of your plays" />;
}

/**
 * After a game, how each of your plays played out: your chances through the game, the plays that
 * cost you most, and where you beat the Hard bot's pick. Worked out in web workers, a play at a
 * time; clicking one shows the board as it was. `say` words a move of decision `n` by its key.
 */
export function Review({ setup, log, seat, say, show }: { setup: Setup; log: Choice[]; seat: number; say: (n: number, key: string) => string; show: (n: number) => void }) {
  const [rows, setRows] = useState<Reviewed[]>([]);
  const [finished, setFinished] = useState(0);
  const total = log.filter((c) => c.kind === "move" && c.seat === seat).length;
  const k = Math.max(1, Math.min(globalThis.navigator?.hardwareConcurrency || 4, total));
  const done = finished === k;
  useEffect(() => {
    // a worker per core, each taking every kth play
    const workers = Array.from({ length: k }, (_, i) => {
      const worker = new Worker(new URL("./review.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<Reviewed | null>) => (data ? setRows((r) => [...r, data].sort((a, b) => a.n - b.n)) : setFinished((f) => f + 1));
      worker.postMessage([setup, log, seat, [i, k]]);
      return worker;
    });
    return () => workers.forEach((w) => w.terminate());
    // a new setup and log arrive with every render, but only these change the review
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.seed, log.length, seat, k]);

  const scored = useMemo(
    () =>
      rows.map((r): Scored => {
        const best = r.options.reduce((a, b) => (b.win > a.win ? b : a));
        const mine = r.options.find((o) => o.key === r.chose) ?? best;
        const hard = r.options.find((o) => o.key === r.hard) ?? best;
        return { ...r, best, mine, lost: best.win - mine.win, beat: mine.win - hard.win, did: say(r.n, r.chose), better: say(r.n, best.key) };
      }),
    // say() is new each render, and words a play the same way every time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const costly = scored.filter((r) => r.lost >= 0.05).sort((a, b) => b.lost - a.lost);
  const found = scored.filter((r) => r.chose !== r.hard && r.beat >= 0.05).sort((a, b) => b.beat - a.beat);
  const peak = scored.reduce<Scored | undefined>((a, b) => (!a || b.mine.win > a.mine.win ? b : a), undefined);
  const agreed = scored.filter((r) => r.chose === r.hard).length;
  const item = "cursor-pointer rounded-sm px-[0.3em] hover:bg-white/10";

  return (
    <section className="panel p-[0.8em] text-sm text-white">
      <h2 className="label m-0">How you played</h2>
      {!done && (
        <p className="my-[0.4em] opacity-70">
          Playing out your plays… {rows.length} of {total}
        </p>
      )}
      {peak && (
        <p className="my-[0.4em]">
          Your chances: {pct(scored[0].mine.win)} after your first play, {pct(peak.mine.win)} at their best (turn {peak.turn}), {pct(scored.at(-1)!.mine.win)} after your last. You played the Hard bot&apos;s pick {agreed}{" "}
          of {scored.length} times.
        </p>
      )}
      {scored.length > 0 && <Chances rows={scored} fair={1 / setup.players} show={show} />}
      {costly.length > 0 && (
        <>
          <h3 className="mt-[0.8em] mb-[0.2em] font-semibold">What cost you most</h3>
          <ul>
            {costly.slice(0, 4).map((r) => (
              <li key={r.n} className={item} onClick={() => show(r.n)}>
                Turn {r.turn}: {r.did} ({pct(r.mine.win)}); {r.better} had {pct(r.best.win)}. <b>−{points(r.lost)}</b>
                {r.chose === r.hint && <span className="opacity-60"> (hinted)</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {found.length > 0 && (
        <>
          <h3 className="mt-[0.8em] mb-[0.2em] font-semibold">Better than the Hard bot</h3>
          <ul>
            {found.slice(0, 3).map((r) => (
              <li key={r.n} className={item} onClick={() => show(r.n)}>
                Turn {r.turn}: {r.did} over {say(r.n, r.hard)}. <b>+{points(r.beat)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {done && costly.length === 0 && <p className="my-[0.4em]">No play cost you more than 5 points.</p>}
      <p className="mt-[0.8em] mb-0 text-xs opacity-60">
        At each of your plays, the Hard bot&apos;s top 5 moves (by a lighter version of its model), yours and the Hint&apos;s were each played out on {DEALS} deals of the cards you couldn&apos;t see, everyone playing
        like the Medium bot for two rounds. Points are chances of winning the game. Paying, Just Say No and discards aren&apos;t reviewed. Click a play to see the board then.
      </p>
    </section>
  );
}
