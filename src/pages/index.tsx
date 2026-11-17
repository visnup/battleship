import { useRouter } from "next/router";
import { randomWord } from "../words.ts";

export default function Home() {
  const router = useRouter();
  return (
    <main>
      <h1>Monopoly Deal</h1>
      <p>Play with friends online, with bots in the empty seats.</p>
      <button onClick={() => router.push(`/${randomWord()}`)}>Start a table</button>
      <style jsx>{`
        main {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 100dvh;
        }
      `}</style>
    </main>
  );
}
