/** Prints the head of a markdown table: `cells`, then a column per player count, with its fair share if `fair`. */
export function header(cells: string[], counts: number[], fair = false) {
  const head = [...cells, ...counts.map((k) => `${k} players${fair ? ` (fair ${(100 / k).toFixed(1)}%)` : ""}`)];
  console.log(`|${head.map((c) => (c ? ` ${c} ` : " ")).join("|")}|\n|${" --- |".repeat(head.length)}`);
}
