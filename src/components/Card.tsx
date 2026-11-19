import { type PointerEvent, useRef } from "react";
import type { Card as CardType, Color } from "../cards.ts";

/** The chips' colors, from the booklet. */
export const PAINT: Record<Color, string> = { pink: "#de35a2", orange: "#eb801d", white: "#f4f1ea" };

const FATE: Record<Exclude<CardType["kind"], "force">, { title: string; glyph: string; text: string }> = {
  bait: { title: "Bait", glyph: "🪝", text: "Discard it to take a force card from your row back into your hand." },
  fury: { title: "Fury", glyph: "🔥", text: "Your force cards count double this battle. One Fury a player a battle." },
  legend: { title: "Legend", glyph: "👑", text: "10 strength that nothing changes, not even Winter or Fury." },
  winter: { title: "Winter", glyph: "❄️", text: "Every force card in this battle is worth 1. Once a battle." },
  crows: { title: "Crows", glyph: "🐦", text: "The battle ends at once, and whoever leads wins it." },
  doves: { title: "Doves", glyph: "🕊️", text: "The battle ends at once with no winner: the chip and the Favor stay where they are." },
};

export const label = (c: CardType) => (c.kind === "force" ? String(c.value) : FATE[c.kind].title);

/** A tooltip for the element it's in, shown at once on mouse hover, above it or else below. */
function useTip() {
  const tip = useRef<HTMLSpanElement>(null);
  const show = (e: PointerEvent<HTMLElement>) => {
    const t = tip.current;
    if (!t || e.pointerType !== "mouse") return;
    t.showPopover();
    const r = e.currentTarget.getBoundingClientRect();
    const top = r.top - t.offsetHeight - 8;
    t.style.top = `${top < 8 ? r.bottom + 8 : top}px`;
    t.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - t.offsetWidth / 2), innerWidth - t.offsetWidth - 8)}px`;
  };
  return { tip, show, hide: () => tip.current?.hidePopover() };
}

/** A card, black as printed: a force card's value, or a fate card's name and what it does in a tooltip. `dim` is for a card that can't be played now. */
export function Card({ card, selected, hinted, dim, small, onClick }: { card: CardType; selected?: boolean; hinted?: boolean; dim?: boolean; small?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  const { tip, show, hide } = useTip();
  const fate = card.kind === "force" ? undefined : FATE[card.kind];
  return (
    <Tag
      className={`card ${small ? "small" : ""} relative m-0 inline-flex flex-col items-center justify-center bg-ink p-0 text-center text-white ring-1 ring-[#4d4d4d] transition-transform duration-150 ${selected ? "-translate-y-[0.6em] outline-3 outline-accent" : hinted ? "outline-3 outline-accent/60" : ""} ${dim ? "ring-[#2a2a2a] [&>:not(.tip)]:opacity-40" : ""}`}
      onClick={onClick}
      onPointerEnter={show}
      onPointerLeave={hide}
      aria-label={label(card)}
    >
      {fate ? (
        <>
          <span className="text-[1.6em] leading-none">{fate.glyph}</span>
          <span className="mt-[0.3em] text-[0.8em] font-extrabold tracking-wide uppercase">{fate.title}</span>
          {card.kind === "legend" ? (
            <span className="absolute top-[0.2em] left-[0.35em] flex flex-col items-start">
              <span className="font-numbers text-[0.9em] font-bold">10</span>
              <span className="text-[0.8em] leading-none">{fate.glyph}</span>
            </span>
          ) : (
            <span className="absolute top-[0.2em] left-[0.3em] text-[0.8em]">{fate.glyph}</span>
          )}
        </>
      ) : (
        <>
          <span className="font-numbers text-[3.2em] leading-none font-bold">{card.value}</span>
          <span className="absolute top-[0.2em] left-[0.35em] font-numbers text-[0.9em] font-bold">{card.value}</span>
        </>
      )}
      <span ref={tip} popover="manual" className="tip">
        <span className="block font-extrabold">{fate ? fate.title : `Force ${card.value}`}</span>
        <span className="mt-[0.3em] block">{fate ? fate.text : `${card.value} strength, 1 in Winter, double with a Fury.`}</span>
      </span>
    </Tag>
  );
}

/** `n` cards face down, overlapped in a row. */
export function Backs({ n }: { n: number }) {
  return (
    <span className="flex shrink-0 *:not-first:-ml-[2.5rem]" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="card small border border-[#f3b0dc] bg-accent bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgb(0_0_0/0.25)_3px_5px)]" />
      ))}
    </span>
  );
}

/** A chip, or `n` of them stacked with the count on top. */
export function Chip({ color, n, faded }: { color: Color; n?: number; faded?: boolean }) {
  return (
    <span
      title={n === undefined ? `${color} chip` : `${n} ${color} chip${n === 1 ? "" : "s"}`}
      className={`inline-grid size-[1.6em] place-items-center rounded-full border-2 border-dashed border-black/30 text-[0.8em] font-extrabold text-black ${faded ? "opacity-25" : ""}`}
      style={{ background: PAINT[color] }}
    >
      {n || ""}
    </span>
  );
}
