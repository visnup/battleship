import { type Action, BIRTHDAY, type Card as CardType, type Color, COLORS, DEBT, HOTEL_RENT, HOUSE_RENT } from "../cards.ts";
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
  if (c.kind === "property") return `${colorName(c.color)}, worth $${c.value}M when paid.\n${rents(c.color)}`;
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
    <div className="box-border h-[6.3em] w-[4.5em] shrink-0 rounded-[0.4em] border-2 border-dashed text-center text-[0.85rem] opacity-60" style={{ borderColor: PAINT[color] }}>
      <span className="block text-[0.85em] leading-[1.85em] font-extrabold text-white">${rent}M</span>
    </div>
  );
}

/** A card; `banked` grays its name and darkens its value, which is all it's worth in a bank, and `rent` goes on its band, or a property's whole rent table. */
export function Card({ card, color, selected, banked, rent, onClick }: { card: CardType; color?: Color; selected?: boolean; banked?: boolean; rent?: number; onClick?: () => void }) {
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
  return (
    <Tag
      className={`relative m-0 box-border inline-flex h-[6.3em] w-[4.5em] shrink-0 flex-col overflow-hidden rounded-[0.4em] bg-white p-0 text-center text-[0.85rem] text-black shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-150 ${selected ? "-translate-y-[0.6em] outline-3 outline-[gold]" : ""}`}
      onClick={onClick}
      title={explain(card)}
    >
      <span className="h-[1.4em] text-[0.85em] leading-[1.65em] font-extrabold text-white [text-shadow:0_0_2px_black,0_0_2px_black]" style={{ background: band }}>
        {rent !== undefined ? `$${rent}M` : card.kind === "property" && `$${COLORS[card.color].rent.join("/")}M`}
      </span>
      <span className={`flex flex-1 items-center justify-center px-[0.2em] leading-[1.1] font-extrabold ${cash ? "text-gray-400" : ""}`}>{label(card)}</span>
      <span className={`pb-[0.3em] text-[0.75em] ${cash ? "font-extrabold" : "opacity-60"}`}>{card.kind === "money" ? " " : `$${card.value}M`}</span>
    </Tag>
  );
}
