import { useRouter } from "next/router";
import { DECK } from "../cards.ts";
import { Card } from "../components/Card";
import { randomWord } from "kit/words.ts";

const FAN = [
  DECK.find((c) => c.color === "blue" && c.value === 8),
  DECK.find((c) => c.color === "green" && c.value === 3),
  undefined,
  DECK.find((c) => c.color === "silver" && c.value === 9),
  DECK.find((c) => c.color === "magenta" && c.value === 13),
];

export default function Home() {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <section className="panel w-full max-w-sm px-6 pt-10 pb-6 text-center">
        <div className="fan mb-12" aria-hidden>
          {FAN.map((card, i) => (
            <div key={i} style={{ "--o": i - 2 } as React.CSSProperties}>
              <Card card={card} down={!card} />
            </div>
          ))}
        </div>
        <h1 className="text-3xl font-bold text-magenta">Fives</h1>
        <p className="mt-2 mb-6 text-sm opacity-70">Get your tricks to add up to 25. Play with friends online, with bots in the empty seats.</p>
        <button className="primary w-full py-2 text-lg" onClick={() => router.push(`/${randomWord()}`)}>
          Start a table
        </button>
        <p className="mt-6 mb-0 text-xs opacity-50">A fan-made game, not affiliated with or endorsed by CMYK. Fives was designed by Taiki Shinzawa.</p>
      </section>
    </main>
  );
}
