import Head from "next/head";
import { useRouter } from "next/router";
import { Game } from "../components/Game";

export default function TablePage() {
  const { query, isReady } = useRouter();
  return (
    <main>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      {isReady && <Game table={String(query.table)} />}
    </main>
  );
}
