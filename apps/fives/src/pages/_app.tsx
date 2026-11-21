import "../styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { AppProps } from "next/app";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import Head from "next/head";

// the local backend from another device, like a phone on the LAN
const url = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convex = new ConvexReactClient(typeof window === "undefined" ? url : url.replace("127.0.0.1", location.hostname));

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ConvexProvider client={convex}>
      <Head>
        <title>Fives</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <Component {...pageProps} />
      <Analytics />
    </ConvexProvider>
  );
}
