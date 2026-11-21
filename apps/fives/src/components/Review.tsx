import { useEffect, useMemo, useRef, useState } from "react";
import type { Choice, Setup } from "../replay.ts";
import { deals, type Reviewed } from "../review.ts";

const pct = (x: number) => `${Math.round(100 * x)}%`;
const points = (x: number) => Math.round(100 * x);

/** A play as words: what you did (`did`), or an option (`other`). */
function words(label: string) {
  return { did: `played the ${label}`, other: `the ${label}` };
}

/** Where a decision came: its hand and trick. */
const when = (r: Reviewed) => `Hand ${r.hand}, trick ${r.trick}`;

type Scored = Reviewed & { best: { label: string; win: number }; mine: { win: number }; lost: number; beat: number };

/**
 * Your chance of winning after each of your decisions, like a chess engine's evaluation chart: a
 * red drop where another option had more, a blue dot where you beat the Hint, hands along the
 * bottom, and a fair share dashed. Clicking a decision shows the board then.
 */
function Chances({ rows, order, fair, show }: { rows: Scored[]; order: number[]; fair: number; show: (n: number) => void }) {
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
      const data = rows.map((r) => ({ ...r, i: order.indexOf(r.n), win: r.mine.win }));
      // each hand's first decision, labeled with its number
      const firsts = new Map(data.filter((d, j) => !j || data[j - 1].hand !== d.hand).map((d) => [d.i, d.hand]));
      // SVG attributes can't take var(), so the theme's colors as they are now
      const css = getComputedStyle(el);
      const [ink, paper] = [css.getPropertyValue("--ink").trim(), css.getPropertyValue("--bar").trim()];
      const color = (d: Scored) => (d.lost >= 0.05 ? "#d64545" : d.beat >= 0.05 ? "#2f5db1" : ink);
      const plot = Plot.plot({
        width: el.clientWidth,
        height: 160,
        marginLeft: 36,
        marginTop: 28,
        style: { background: "transparent", color: ink },
        x: { domain: [-0.5, order.length - 0.5], ticks: [...firsts.keys()], tickFormat: (i: number) => String(firsts.get(i)), label: "hand" },
        y: { domain: [0, 1], ticks: [0, 0.5, 1], tickFormat: "%", grid: true, label: null },
        marks: [
          Plot.ruleY([fair], { strokeDasharray: "3 3", strokeOpacity: 0.5 }),
          Plot.ruleX(
            data.filter((d) => d.lost >= 0.05),
            { x: "i", y1: (d) => d.best.win, y2: "win", stroke: "#d64545", strokeWidth: 2 },
          ),
          Plot.lineY(data, { x: "i", y: "win", stroke: "#de35a2", strokeWidth: 2 }),
          Plot.dot(data, { x: "i", y: "win", r: (d) => (d.lost >= 0.05 || d.beat >= 0.05 ? 4 : 2.5), fill: color, stroke: paper, strokeWidth: 1.5 }),
          // where your chances started, peaked and ended
          Plot.text([...new Set([data[0], data.reduce((a, b) => (b.win > a.win ? b : a)), data.at(-1)!])], {
            x: "i",
            y: "win",
            text: (d) => pct(d.win),
            dy: -10,
            fontSize: 11,
            fontWeight: "bold",
            fill: ink,
            stroke: paper,
            strokeWidth: 3,
          }),
          // in place of a tip, which would cover the line: a rule at the decision under the
          // pointer, and what happened there in the top margin
          Plot.ruleX(data, Plot.pointerX({ x: "i", stroke: ink, strokeOpacity: 0.3 })),
          Plot.text(
            data,
            Plot.pointerX({
              x: "i",
              frameAnchor: "top",
              lineAnchor: "bottom",
              dy: -12,
              fontSize: 12,
              // above the decision, but anchored to whichever side keeps it on the chart
              render(index, scales, values, dimensions, context, next) {
                const g = next!(index, scales, values, dimensions, context)!;
                const x = (values.x as number[] | undefined)?.[index[0]];
                if (x !== undefined) g.setAttribute("text-anchor", x < dimensions.width / 3 ? "start" : x > (2 * dimensions.width) / 3 ? "end" : "middle");
                return g;
              },
              text: (d) => `${when(d)}: you ${words(d.chose).did}, ${pct(d.win)}${d.lost >= 0.01 ? ` · ${words(d.best.label).other} had ${pct(d.best.win)}` : ""}`,
            }),
          ),
        ],
      });
      // clicking the decision under the pointer, now pinned, shows the board then
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
  }, [rows, order, fair]);
  return <div ref={box} className="my-[0.6em]" aria-label="Your chance of winning after each of your decisions" />;
}

/**
 * After a game, how each of your decisions played out: your chances through the game, the
 * decisions that cost you most, and where you beat the Hint. Worked out in web workers, a
 * decision at a time; clicking one shows the board as it was.
 */
export function Review({ setup, log, seat, show }: { setup: Setup; log: Choice[]; seat: number; show: (n: number) => void }) {
  const [rows, setRows] = useState<Reviewed[]>([]);
  const [finished, setFinished] = useState(0);
  const total = log.filter((c) => c.seat === seat).length;
  const k = Math.max(1, Math.min(globalThis.navigator?.hardwareConcurrency || 4, total));
  const done = finished === k;
  useEffect(() => {
    // a worker per core, each taking every kth decision
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
      rows.map((r) => {
        const best = r.options.reduce((a, b) => (b.win > a.win ? b : a));
        const mine = r.options.find((o) => o.label === r.chose) ?? best;
        const hint = r.options.find((o) => o.label === r.hint) ?? best;
        return { ...r, best, mine, lost: best.win - mine.win, beat: mine.win - hint.win };
      }),
    [rows],
  );
  const order = useMemo(() => log.flatMap((c, n) => (c.seat === seat ? [n] : [])), [log, seat]);
  const costly = scored.filter((r) => r.lost >= 0.05).sort((a, b) => b.lost - a.lost);
  const found = scored.filter((r) => r.chose !== r.hint && r.beat >= 0.05).sort((a, b) => b.beat - a.beat);
  const peak = scored.reduce<(typeof scored)[number] | undefined>((a, b) => (!a || b.mine.win > a.mine.win ? b : a), undefined);
  const item = "cursor-pointer rounded-sm px-[0.3em] hover:bg-ink/5";

  return (
    <section className="panel p-[0.8em] text-sm">
      <h2 className="label m-0">How you played</h2>
      {!done && <p className="my-[0.4em] opacity-70">Playing out your decisions… {rows.length} so far</p>}
      {scored.length > 0 && peak && (
        <p className="my-[0.4em]">
          Your chances: {pct(scored[0].mine.win)} after your first decision, {pct(peak.mine.win)} at their best ({when(peak).toLowerCase()}), {pct(scored.at(-1)!.mine.win)} after your last.
        </p>
      )}
      {scored.length > 0 && <Chances rows={scored} order={order} fair={1 / setup.players} show={show} />}
      {costly.length > 0 && (
        <>
          <h3 className="mt-[0.8em] mb-[0.2em] font-semibold">What cost you most</h3>
          <ul>
            {costly.slice(0, 4).map((r) => (
              <li key={r.n} className={item} onClick={() => show(r.n)}>
                {when(r)}: you {words(r.chose).did} ({pct(r.mine.win)}); {words(r.best.label).other} had {pct(r.best.win)}. <b>−{points(r.lost)}</b>
                {r.chose === r.hint && <span className="opacity-60"> (hinted)</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {found.length > 0 && (
        <>
          <h3 className="mt-[0.8em] mb-[0.2em] font-semibold">Better than the Hint</h3>
          <ul>
            {found.slice(0, 3).map((r) => (
              <li key={r.n} className={item} onClick={() => show(r.n)}>
                {when(r)}: you {words(r.chose).did} over {words(r.hint).other}. <b>+{points(r.beat)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {done && costly.length === 0 && <p className="my-[0.4em]">No decision cost you more than 5 points.</p>}
      <p className="mt-[0.8em] mb-0 text-xs opacity-60">
        Each option played out on {deals(setup)} deals of the cards you couldn&apos;t see, with each bot playing at its level{setup.bots.includes("learned") ? " (Hard by a lighter version of its model)" : ""} and you and
        any other people like the Medium bot from there. Only plays with a choice count. Points are chances of winning the game. Click a decision to see the table then.
      </p>
    </section>
  );
}
