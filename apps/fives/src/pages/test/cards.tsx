import { DECK } from "../../cards.ts";
import { Card, Chips } from "../../components/Card";

/** Every card, large and small, face down, and a seat's pieces: for `Cards.spec.ts`'s screenshot. */
export default function Cards() {
  return (
    <main className="flex flex-col gap-4 p-4">
      {[false, true].map((small) => (
        <div key={String(small)} className="flex flex-wrap gap-2">
          {DECK.map((c) => (
            <Card key={c.id} card={c} small={small} />
          ))}
          <Card down small={small} />
          <Card card={DECK[20]} down small={small} />
        </div>
      ))}
      <Chips n={7} />
    </main>
  );
}
