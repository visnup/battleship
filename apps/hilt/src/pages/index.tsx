import { useRouter } from "next/router";
import type { Card as CardType } from "../cards.ts";
import { Card } from "../components/Card";
import { randomWord } from "kit/words.ts";

const FAN: CardType[] = [
  { kind: "force", value: 1 },
  { kind: "fury", value: 0 },
  { kind: "force", value: 10 },
  { kind: "crows", value: 0 },
  { kind: "legend", value: 10 },
];

export default function Home() {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <section className="panel w-full max-w-sm px-6 pt-10 pb-6 text-center">
        <div className="fan mb-12" aria-hidden>
          {FAN.map((card, i) => (
            <div key={i} style={{ "--o": i - 2 } as React.CSSProperties}>
              <Card card={card} />
            </div>
          ))}
        </div>
        <h1 className="text-3xl font-bold">Hilt</h1>
        <p className="mt-2 mb-6 text-sm opacity-70">Play with friends online, with bots in the empty seats.</p>
        <button className="primary w-full py-2 text-lg" onClick={() => router.push(`/${randomWord()}`)}>
          Start a table
        </button>
        <p className="mt-6 mb-0 text-xs opacity-50">A fan-made game, not affiliated with or endorsed by CMYK. Hilt was designed by Dominique Ehrhard.</p>
      </section>
    </main>
  );
}
