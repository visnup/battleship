import { type Action, BIRTHDAY, type Card as CardType, type Color, COLORS, DEBT, HOTEL_RENT, HOUSE_RENT } from "../cards.ts";
import { Fragment, type ReactNode } from "react";
import { colorsOf } from "../game.ts";
import { street } from "../streets.ts";

export const PAINT: Record<Color, string> = {
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

/** Every `$5M` in `text` as 5 and a struck-through M, like the cards print it. */
export const money = (text: string): ReactNode =>
  text.split(/\$([\d/]+)M/).map((s, i) =>
    i % 2 ? (
      <Fragment key={i}>
        {s}
        <span className="line-through decoration-[0.1em]">M</span>
      </Fragment>
    ) : (
      s
    ),
  );

/** `darkBlue` as "Dark Blue". */
export const colorName = (s: string) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const TITLES: Partial<Record<Action, string>> = { justSayNo: "Just Say No!", birthday: "It's My Birthday", doubleRent: "Double The Rent" };

export const label = (c: CardType) =>
  c.kind === "money" ? `$${c.value}M` : c.kind === "property" ? (street(c) ?? colorName(c.color)) : c.kind === "wild" ? "Property Wild Card" : c.kind === "rent" ? "Rent" : (TITLES[c.action] ?? colorName(c.action));

const rents = (c: Color) => `${colorName(c)} rent: ${COLORS[c].rent.map((r, i) => `${i + 1} card${i ? "s" : ""} $${r}M`).join(", ")} (full set)`;

const ACTIONS: Record<Action, string> = {
  dealBreaker: "Take a full set from another player, with its house and hotel.",
  justSayNo: "Cancel an action played against you. Another Just Say No cancels this one. On your own turn, it uses a play.",
  slyDeal: "Take one property from another player, not from a full set.",
  forcedDeal: "Swap one of your properties for one of another player's, not from a full set.",
  debtCollector: `One player pays you $${DEBT}M.`,
  birthday: `Everyone pays you $${BIRTHDAY}M.`,
  doubleRent: "Play with a Rent card to double the rent. It uses a play of its own.",
  house: `Put on a full set, not railroads or utilities, for $${HOUSE_RENT}M more rent.`,
  hotel: `Put on a full set that has a house, for $${HOTEL_RENT}M more rent.`,
  passGo: "Draw two cards.",
};

/** What `c` does, for its title. */
function explain(c: CardType): string {
  const worth = `Worth $${c.value}M in the bank.`;
  if (c.kind === "money") return `${label(c)}: bank it to pay with.`;
  if (c.kind === "property") return `${street(c) ? `${street(c)}: ` : ""}${colorName(c.color)}, worth $${c.value}M when paid.\n${rents(c.color)}`;
  if (c.kind === "wild")
    return c.colors === "any"
      ? "Wild: counts as any color, and can be moved on your turn. Can't pay with it, or make a set of only these."
      : `Wild: counts as ${c.colors.map(colorName).join(" or ")}, and can be moved on your turn. Worth $${c.value}M when paid.\n${c.colors.map(rents).join("\n")}`;
  if (c.kind === "rent") return c.colors === "any" ? `Rent: one player pays you rent on any one of your colors. ${worth}` : `Rent: everyone pays you rent on your ${c.colors.map(colorName).join(" or ")}. ${worth}`;
  return `${label(c)}: ${ACTIONS[c.action]} ${worth}`;
}

/** An empty place in a set, where its next card will stack, with the rent the set would charge then. */
export function Slot({ color, rent }: { color: Color; rent: number }) {
  return (
    <div className="card border-2 border-dashed text-center opacity-60" style={{ borderColor: PAINT[color] }}>
      <span className="block text-[0.85em] leading-[1.85em] font-extrabold text-white">{money(`$${rent}M`)}</span>
    </div>
  );
}

/** A card; `banked` grays its name and darkens its value, which is all it's worth in a bank, and `rent` goes on its band, or a property's whole rent table. */
export function Card({ card, color, selected, banked, rent, glow, onClick }: { card: CardType; color?: Color; selected?: boolean; banked?: boolean; rent?: number; glow?: boolean; onClick?: () => void }) {
  const cash = banked && card.kind !== "money";
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
  const name = label(card);
  return (
    <Tag
      className={`card relative m-0 inline-flex flex-col overflow-hidden bg-card p-0 text-center text-black shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-150 ${glow ? "glow" : ""} ${selected ? "-translate-y-[0.6em] outline-3 outline-gold" : ""}`}
      onClick={onClick}
      title={explain(card)}
    >
      <span className="h-[1.4em] text-[0.85em] leading-[1.65em] font-extrabold text-white [text-shadow:0_0_2px_black,0_0_2px_black]" style={{ background: band }}>
        {rent !== undefined ? money(`$${rent}M`) : card.kind === "property" && money(`$${COLORS[card.color].rent.join("/")}M`)}
      </span>
      <span
        lang="en"
        className={`flex flex-1 items-center justify-center px-[0.2em] leading-[1.1] font-extrabold hyphens-auto ${cash ? "text-gray-400" : ""}`}
        style={{ fontSize: `${Math.min(1, 8 / Math.max(...name.split(" ").map((w) => w.length)))}em` }}
      >
        {money(name)}
      </span>
      <span className={`pb-[0.3em] text-[0.75em] ${banked ? "pl-[0.4em] text-left font-extrabold" : "opacity-60"}`}>{card.kind === "money" && !banked ? " " : money(`$${card.value}M`)}</span>
    </Tag>
  );
}
