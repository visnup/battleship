import { useRouter } from "next/router";
import { randomWord } from "../words.ts";

export default function Home() {
  const router = useRouter();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <h1 className="text-3xl font-bold">Monopoly Deal</h1>
      <p>Play with friends online, with bots in the empty seats.</p>
      <button onClick={() => router.push(`/${randomWord()}`)}>Start a table</button>
    </main>
  );
}
