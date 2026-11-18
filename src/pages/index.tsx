import { useRouter } from "next/router";
import type { Card as CardType } from "../cards.ts";
import { Card } from "../components/Card";
import { randomWord } from "../words.ts";

const FAN: CardType[] = [
  { kind: "property", color: "darkBlue", value: 4 },
  { kind: "action", action: "slyDeal", value: 3 },
  { kind: "action", action: "dealBreaker", value: 5 },
  { kind: "action", action: "justSayNo", value: 4 },
  { kind: "money", value: 5 },
];

export default function Home() {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <section className="panel w-full max-w-sm px-6 pt-10 pb-6 text-center">
        <div className="mb-10 flex justify-center" aria-hidden>
          {FAN.map((card, i) => (
            <div key={i} className="-mx-3 origin-bottom" style={{ transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 6}px)` }}>
              <Card card={card} />
            </div>
          ))}
        </div>
        <h1 className="text-3xl font-bold">Monopoly Deal</h1>
        <p className="mt-2 mb-6 text-sm opacity-70">Play with friends online, with bots in the empty seats.</p>
        <button className="primary w-full py-2 text-lg" onClick={() => router.push(`/${randomWord()}`)}>
          Start a table
        </button>
        <p className="mt-6 mb-0 text-xs opacity-50">A fan-made game, not affiliated with or endorsed by Hasbro. Monopoly Deal is a trademark of Hasbro.</p>
      </section>
    </main>
  );
}
