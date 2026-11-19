import { useEffect, useState } from "react";
import type { Choice, Setup } from "../replay.ts";
import { deals, type Reviewed } from "../review.ts";

const pct = (x: number) => `${Math.round(100 * x)}%`;
const points = (x: number) => Math.round(100 * x);

/** A choice as words: what you did (`did`), or an option (`other`). */
function words(kind: Choice["kind"], label: string) {
  if (kind === "color") return { did: `picked ${label}`, other: label };
  if (kind === "dump") return label === "true" ? { did: "discarded your hand", other: "discarding" } : { did: "kept your hand", other: "keeping it" };
  if (label === "pass") return { did: "passed", other: "passing" };
  const card = /^\d+$/.test(label) ? `the ${label}` : label.startsWith("Bait") ? label : label[0].toUpperCase() + label.slice(1);
  return { did: `played ${card}`, other: card };
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

  const scored = rows.map((r) => {
    const best = r.options.reduce((a, b) => (b.win > a.win ? b : a));
    const mine = r.options.find((o) => o.label === r.chose) ?? best;
    const hint = r.options.find((o) => o.label === r.hint) ?? best;
    return { ...r, best, mine, lost: best.win - mine.win, beat: mine.win - hint.win };
  });
  const costly = scored.filter((r) => r.lost >= 0.05).sort((a, b) => b.lost - a.lost);
  const found = scored.filter((r) => r.chose !== r.hint && r.beat >= 0.05).sort((a, b) => b.beat - a.beat);
  const peak = scored.reduce<(typeof scored)[number] | undefined>((a, b) => (!a || b.best.win > a.best.win ? b : a), undefined);
  const item = "cursor-pointer rounded-sm px-[0.3em] hover:bg-white/10";

  return (
    <section className="panel p-[0.8em] text-sm">
      <h2 className="label m-0">How you played</h2>
      {!done && (
        <p className="my-[0.4em] opacity-70">
          Playing out your decisions… {rows.length} of {total}
        </p>
      )}
      {scored.length > 0 && peak && (
        <p className="my-[0.4em]">
          Your chances: {pct(scored[0].best.win)} at the start, {pct(peak.best.win)} at their best (battle {peak.battle}), {pct(scored.at(-1)!.best.win)} at your last decision.
        </p>
      )}
      {costly.length > 0 && (
        <>
          <h3 className="mt-[0.8em] mb-[0.2em] font-semibold">What cost you most</h3>
          <ul>
            {costly.slice(0, 4).map((r) => (
              <li key={r.n} className={item} onClick={() => show(r.n)}>
                Battle {r.battle}: you {words(r.kind, r.chose).did} ({pct(r.mine.win)}); {words(r.kind, r.best.label).other} had {pct(r.best.win)}. <b>−{points(r.lost)}</b>
                {r.chose === r.hint && <span className="opacity-60"> The Hint said the same.</span>}
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
                Battle {r.battle}: you {words(r.kind, r.chose).did} over {words(r.kind, r.hint).other}. <b>+{points(r.beat)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {done && costly.length === 0 && <p className="my-[0.4em]">No decision cost you more than 5 points.</p>}
      <p className="mt-[0.8em] mb-0 text-xs opacity-60">
        Each option played out on {deals(setup)} deals of the cards you couldn&apos;t see, with each bot playing at its level{setup.bots.includes("learned") ? " (Hard by a lighter version of its model)" : ""} and you and
        any other people like the Medium bot from there. Points are chances of winning the game. Click a decision to see the board then.
      </p>
    </section>
  );
}
