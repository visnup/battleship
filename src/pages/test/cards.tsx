import Head from "next/head";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { Card as CardType } from "../../cards.ts";
import { Hand, Played } from "../../components/Board";
import { Backs, Card } from "../../components/Card";

// Every kind of card, in a hand and on the table, to check the cards' look at a glance; `Cards.spec.ts` screenshots it.

const ALL: CardType[] = [
  ...[1, 2, 3, 4, 5, 6, 10].map((value) => ({ kind: "force" as const, value })),
  ...(["legend", "fury", "bait", "winter", "crows", "doves"] as const).map((kind) => ({ kind, value: kind === "legend" ? 10 : 0 })),
];

/** Where a text element's baseline is: a zero-size inline-block put in it sits on the baseline. */
function baseline(el: Element) {
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0";
  el.append(probe);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return y;
}

/** How tall `el`'s own text is above its baseline, as drawn. */
function ascent(el: Element) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = getComputedStyle(el).font;
  return ctx.measureText(el.textContent ?? "").actualBoundingBoxAscent;
}

const GUIDES = [
  { name: "corner middle", guide: "corner", up: (el: Element) => ascent(el) / 2 },
  { name: "corner baseline", guide: "corner", up: () => 0 },
  { name: "number baseline", guide: "center", up: () => 0 },
  { name: "name baseline", guide: "title", up: () => 0 },
];

/** Magenta lines across `children` where the cards' text should line up: the corner index's middle and baseline, and the baselines of the big number and the name. */
function Guides({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ name: string; y: number }[]>([]);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current!;
    // under CSS zoom, rects are in the page's pixels, and `top` and fonts in the zoomed box's
    const rect = el.getBoundingClientRect();
    const scale = rect.height / el.offsetHeight;
    setScale(scale);
    setLines(
      GUIDES.flatMap((g) => {
        const text = el.querySelector(`[data-guide=${g.guide}]`);
        return text ? [{ name: g.name, y: (baseline(text) - rect.top) / scale - g.up(text) }] : [];
      }),
    );
  }, []);
  return (
    <div ref={box} className="relative">
      {children}
      {lines.map(({ name, y }, i) => (
        <div key={name} className="pointer-events-none absolute inset-x-0 z-20 border-t border-accent" style={{ top: y, borderTopWidth: 1 / scale }}>
          {/* alternate sides, since some pairs of lines are only a pixel or two apart */}
          <span className={`absolute bottom-0 text-accent ${i % 2 ? "right-0" : "left-0"}`} style={{ fontSize: `${0.6 / scale}rem` }}>
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Cards() {
  return (
    <main className="mx-auto flex max-w-[60em] flex-col gap-[2em] p-[2em]">
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <section>
        <h2 className="label">A hand</h2>
        <Guides>
          <Hand cards={ALL} />
        </Guides>
      </section>
      <section>
        <h2 className="label">The corners, three times as big</h2>
        <div className="h-[13em] overflow-x-auto overflow-y-hidden">
          <div style={{ zoom: 3 }} className="-mt-[1.2em] w-max">
            <Guides>
              <Hand cards={ALL} />
            </Guides>
          </div>
        </div>
      </section>
      <section>
        <h2 className="label">A hand with cards that can&apos;t be played</h2>
        <Guides>
          <Hand cards={ALL} dim={(c) => c.kind === "bait" || c.kind === "fury"} />
        </Guides>
      </section>
      <section className="flex flex-col gap-[0.8em]">
        <h2 className="label">On the table</h2>
        <div className="flex items-center gap-[0.8em] pt-[1.2em]">
          <div className="flex *:not-first:-ml-[calc(var(--small)*1.9/0.65)]">
            {ALL.map((c, i) => (
              <Card key={i} card={c} small />
            ))}
          </div>
          <Played played={[{ card: { kind: "winter", value: 0 } }, { card: { kind: "bait", value: 0 }, took: { kind: "force", value: 6 } }, { card: { kind: "bait", value: 0 }, took: { kind: "force", value: 10 } }]} />
          <Backs n={12} />
        </div>
      </section>
      <section className="flex flex-col gap-[0.8em]">
        <h2 className="label">Each card</h2>
        <div className="flex flex-wrap gap-[0.4em]">
          {ALL.map((c, i) => (
            <Card key={i} card={c} />
          ))}
        </div>
        <div className="flex flex-wrap gap-[0.4em]">
          {ALL.map((c, i) => (
            <Card key={i} card={c} small />
          ))}
        </div>
      </section>
    </main>
  );
}
