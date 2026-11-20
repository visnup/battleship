import type { Card as CardType, Color } from "../cards.ts";

/** The cards' inks, from the booklet. */
export const PAINT: Record<Color, string> = { blue: "#2f5db1", green: "#3db389", silver: "#808080", magenta: "#de35a2" };

/** The corner index: the number, and a dot under it, as printed. */
const corner = "absolute top-[0.25em] left-[0.2em] flex flex-col items-center font-numbers text-[0.85em] leading-none font-bold tracking-tighter";

/**
 * A card face up, in its color with its number in white; or `down`, the light back with its
 * magenta 5. `dim` is for a card that can't be played now.
 */
export function Card({
  card,
  down,
  selected,
  hinted,
  dim,
  small,
  onClick,
  title,
}: {
  card?: CardType;
  down?: boolean;
  selected?: boolean;
  hinted?: boolean;
  dim?: boolean;
  small?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const Tag = onClick ? "button" : "div";
  const back = down || !card;
  const value = back ? 5 : card.value;
  return (
    <Tag
      className={`card ${small ? "small" : ""} relative m-0 inline-flex items-center justify-center p-0 font-numbers transition-transform duration-150 ${back ? "bg-back text-magenta ring-1 ring-black/10" : "text-white"} ${selected ? "-translate-y-[0.6em] outline-3 outline-ink" : hinted ? "outline-3 outline-ink/40" : ""} ${dim ? "opacity-35" : ""}`}
      style={back ? undefined : { background: PAINT[card.color] }}
      onClick={onClick}
      title={title}
      aria-label={back ? (card ? `${card.color} ${card.value} face down` : "magenta 5") : `${card.color} ${card.value}`}
    >
      <span className={corner}>
        {value}
        <span className="mt-[0.15em] size-[0.18em] rounded-full bg-current" />
      </span>
      <span className="text-[2.6em] leading-none font-bold tracking-tight">{value}</span>
      {back && card && (
        <span className="absolute right-[0.35em] bottom-[0.25em] text-[0.65em] font-bold opacity-80" style={{ color: PAINT[card.color] }}>
          {card.value}
        </span>
      )}
    </Tag>
  );
}

/** `n` cards face down, overlapped in a row. */
export function Backs({ n }: { n: number }) {
  return (
    <span className="flex shrink-0 *:not-first:-ml-[2.9em]" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="card small grid place-items-center bg-back font-numbers font-bold text-magenta ring-1 ring-black/15">
          <span className="text-[1.6em]">5</span>
        </span>
      ))}
    </span>
  );
}

/** A point chip, with a count. */
export function Chips({ n }: { n: number }) {
  return (
    <span title={`${n} point chip${n === 1 ? "" : "s"}`} className="inline-flex items-center gap-[0.3em] font-bold">
      <span className="inline-block size-[1.1em] rounded-full border-2 border-dashed border-white/70 bg-magenta" />
      {n}
    </span>
  );
}
