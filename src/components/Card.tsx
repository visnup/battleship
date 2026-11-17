import type { Card as CardType, Color } from "../cards.ts";
import { colorsOf } from "../game.ts";

const PAINT: Record<Color, string> = {
  brown: "#8b5a2b",
  lightBlue: "#7cc8ec",
  pink: "#d6409f",
  orange: "#f08c2a",
  red: "#d7263d",
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
      ? "linear-gradient(90deg, #d7263d, #f2c94c, #2e8b57, #1f3a93)"
      : colors.length === 2
        ? `linear-gradient(90deg, ${PAINT[colors[0]]} 50%, ${PAINT[colors[1]]} 50%)`
        : colors.length
          ? PAINT[colors[0]]
          : card.kind === "money"
            ? "#c9b458"
            : "#e4572e";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={selected ? "selected" : undefined} onClick={onClick} title={label(card)}>
      <span className="band" style={{ background: band }} />
      <span className="name">{label(card)}</span>
      {card.kind !== "money" && <span className="value">${card.value}M</span>}
      <style jsx>{`
        button,
        div {
          all: unset;
          box-sizing: border-box;
          display: inline-flex;
          flex-direction: column;
          width: 4.5em;
          height: 6.3em;
          border-radius: 0.4em;
          background: white;
          color: black;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          font-size: 0.85rem;
          text-align: center;
          flex-shrink: 0;
          transition: transform 0.15s;
        }
        button {
          cursor: pointer;
        }
        .selected {
          transform: translateY(-0.6em);
          outline: 3px solid gold;
        }
        .band {
          height: 1.4em;
        }
        .name {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 0.2em;
          font-weight: 600;
          line-height: 1.1;
        }
        .value {
          font-size: 0.75em;
          opacity: 0.6;
          padding-bottom: 0.3em;
        }
      `}</style>
    </Tag>
  );
}
