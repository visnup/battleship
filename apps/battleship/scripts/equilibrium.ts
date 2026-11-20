import { parquet, query } from "../src/results.ts";

/**
 * The hider's and shooter's best mixes when each knows the other might know their habits: the
 * zero-sum game where the hider picks a placer, the shooter picks a shooter, and the payoff is the
 * average shots to sink the fleet. Solved by fictitious play, which converges for zero-sum games.
 */
export async function equilibrium(rounds = 200_000) {
  const rows = await query<{ shooter: string; placer: string; shots: number }>(`
    select shooter, placer, avg(shots) shots from ${parquet("games")} where shooter != 'random' group by all order by all`);
  const shooters = [...new Set(rows.map((r) => r.shooter))], placers = [...new Set(rows.map((r) => r.placer))];
  const m = shooters.map((s) => placers.map((p) => rows.find((r) => r.shooter === s && r.placer === p)!.shots));
  const hide = placers.map(() => 0), shoot = shooters.map(() => 0);
  const vsHide = shooters.map(() => 0), vsShoot = placers.map(() => 0); // payoff totals against the other's history
  for (let t = 0; t < rounds; t++) {
    const p = vsShoot.indexOf(Math.max(...vsShoot)), s = vsHide.indexOf(Math.min(...vsHide));
    hide[p]++, shoot[s]++;
    shooters.forEach((_, i) => (vsHide[i] += m[i][p]));
    placers.forEach((_, j) => (vsShoot[j] += m[s][j]));
  }
  return {
    value: [Math.min(...vsHide) / rounds, Math.max(...vsShoot) / rounds],
    hide: Object.fromEntries(placers.map((p, j) => [p, hide[j] / rounds])),
    shoot: Object.fromEntries(shooters.map((s, i) => [s, shoot[i] / rounds])),
  };
}

if (import.meta.main) console.log(await equilibrium());
