import type { Card as CardType, Color } from "../cards.ts";
import { colorsOf } from "../game.ts";

const PAINT: Record<Color, string> = {
  brown: "#8b5a2b",
  lightBlue: "#7cc8ec",
  pink: "#d6409f",
  orange: "#f5821f",
  red: "#c8102e",
  yellow: "#f2c94c",
  green: "#2e8b57",
  darkBlue: "#1f3a93",
  railroad: "#333",
  utility: "#a8c5a0",
};

/** `darkBlue` as "Dark Blue". */
export const colorName = (s: string) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export const label = (c: CardType) => (c.kind === "money" ? `$${c.value}M` : c.kind === "property" ? colorName(c.color) : c.kind === "wild" ? "Wild" : c.kind === "rent" ? "Rent" : colorName(c.action));

export function Card({ card, color, selected, onClick }: { card: CardType; color?: Color; selected?: boolean; onClick?: () => void }) {
  const colors = color && card.kind === "wild" ? [color] : colorsOf(card);
  const band =
    colors.length > 2
      ? `linear-gradient(90deg, ${PAINT.red}, ${PAINT.yellow}, ${PAINT.green}, ${PAINT.darkBlue})`
      : colors.length === 2
        ? `linear-gradient(90deg, ${PAINT[colors[0]]} 50%, ${PAINT[colors[1]]} 50%)`
        : colors.length
          ? PAINT[colors[0]]
          : card.kind === "money"
            ? "#c9b458"
            : "#7a4ea0";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`m-0 box-border inline-flex h-[6.3em] w-[4.5em] shrink-0 flex-col overflow-hidden rounded-[0.4em] bg-white p-0 text-center text-[0.85rem] text-black shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-150 ${selected ? "-translate-y-[0.6em] outline-3 outline-[gold]" : ""}`}
      onClick={onClick}
      title={label(card)}
    >
      <span className="h-[1.4em]" style={{ background: band }} />
      <span className="flex flex-1 items-center justify-center px-[0.2em] leading-[1.1] font-extrabold">{label(card)}</span>
      {card.kind !== "money" && <span className="pb-[0.3em] text-[0.75em] opacity-60">${card.value}M</span>}
    </Tag>
  );
}
