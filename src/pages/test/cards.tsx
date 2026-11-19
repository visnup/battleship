import Head from "next/head";
import type { Card as CardType } from "../../cards.ts";
import { Hand } from "../../components/Board";
import { Backs, Card } from "../../components/Card";

// Every kind of card, in a hand and on the table, to check the cards' look at a glance; `Cards.spec.ts` screenshots it.

const ALL: CardType[] = [
  ...[1, 2, 3, 4, 5, 6, 10].map((value) => ({ kind: "force" as const, value })),
  ...(["legend", "fury", "bait", "winter", "crows", "doves"] as const).map((kind) => ({ kind, value: kind === "legend" ? 10 : 0 })),
];

export default function Cards() {
  return (
    <main className="mx-auto flex max-w-[60em] flex-col gap-[2em] p-[2em]">
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <section>
        <h2 className="label">A hand</h2>
        <Hand cards={ALL} />
      </section>
      <section>
        <h2 className="label">A hand with cards that can&apos;t be played</h2>
        <Hand cards={ALL} dim={(c) => c.kind === "bait" || c.kind === "fury"} />
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
      <section className="flex flex-col gap-[0.8em]">
        <h2 className="label">On the table</h2>
        <div className="flex items-center gap-[0.8em] pt-[1.2em]">
          <div className="flex *:not-first:-ml-[1.9em]">
            {ALL.map((c, i) => (
              <Card key={i} card={c} small />
            ))}
          </div>
          <Backs n={12} />
        </div>
      </section>
    </main>
  );
}
