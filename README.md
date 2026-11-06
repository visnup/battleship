# Battleship

Battleship is the guessing game Milton Bradley turned into plastic pegs. Each player hides five
ships on a 10×10 grid, then you take turns calling out cells ("B7!") until one fleet is gone. It
looks like pure luck, but it isn't quite: some cells are likelier to hold a ship, some ways of
hunting waste fewer shots, and some ways of hiding are easy to read.

This repo counts every legal arrangement of the fleet exactly and plays millions of games between
simulated shooters and hiders. That answers the questions that come up at the table: where ships
usually are, how to hunt them, where to hide yours, and what to do when your opponent always hides
along the edges. There's also a [cheat sheet](https://battleship.visnup.com) to play with.

The answers come from the model, not from real tables. The hiders are habits we made up, not
habits measured from real players.

The simulator and this analysis were written with Claude Opus 5.5, working in Claude Code
throughout.

## A quick refresher

Hasbro's rules: a 10×10 grid with rows A–J and columns 1–10, and five ships laid in straight
lines, horizontal or vertical. Ships may touch but not overlap.

| ship | length |
| --- | --- |
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

That's 17 cells of ship in 100. Each shot is answered hit or miss, and the shot that finishes a
ship is answered with its name ("You sank my battleship!").

## How to read the numbers

**Shots** is the measure throughout: how many shots it takes to sink the whole fleet. Fewer is
better for the shooter, more for the hider. Since every ship cell must be hit, it's always 17
plus the misses.

**Most tables come from one big dataset:** 50,000 games for every pair of shooter and hider,
with every shooter facing the same fleets. Averages from it are good to about ±0.1 shots. The
smaller experiments say how big a difference has to be before it means something.

The raw data is in `results/` as Parquet, a row per arrangement count, sampled fleet, game or
shot. `make` regenerates it and redraws `charts/` (a few minutes), and each section names
the script behind it. The tables below are from 2026-11-05.

## Where ships are

*From `node scripts/count.ts`.*

There are exactly **30,093,975,536** ways to lay out the fleet. That's too many to visit one by
one, so the count lays the first three ships every way it can, then counts the last two's
non-overlapping pairs from how many of their placements cover each cell. A test checks the
method against brute force on a 5×5 board.

If every arrangement is equally likely, this is the chance each cell holds a ship:

![Exact chance each cell holds a ship](charts/heat.svg)

**The middle is almost three times as likely as a corner:** 21% against 8%. More placements
cross a central cell than an edge one, and a ship can reach a corner only two ways. The bigger
the ship, the stronger the pull. The carrier is on a center cell 7.5% of the time and a corner
2.1%; the destroyer barely cares (2.4% against 1.3%).

![Exact chance each cell holds each ship](charts/ships.svg)

**Most programs don't place ships at random.** The usual way to place a random fleet is to drop
each ship somewhere and, if it overlaps one already down, try that ship again. That isn't
uniform. The big ships go first, onto an empty board where the middle isn't crowded yet, so it
puts up to 1.1 points too much in the middle and about as much too little on the rim. Sampling
noise here is about 0.1 points. Redrawing the whole fleet on any overlap is uniform and costs
little, since 39% of tries fit.

![Naive placement's bias against the exact chances](charts/naive.svg)

## Shooting

*From `node scripts/games.ts`, against uniformly random fleets.*

Four shooters (`src/shooters.ts`):

- **random** fires anywhere it hasn't.
- **hunt** fires at random until it hits, then works through the hit's neighbors.
- **parity** is hunt, but hunts only on one color of a checkerboard, since every ship covers
  both colors.
- **density** counts, for every unshot cell, how many placements of the ships still afloat
  could cover it without crossing a miss or a sunk ship, and fires at the most. While there are
  hits no sunk ship accounts for, placements through them count 100× per hit. This is the
  method Jeremy Berry and DataGenetics popularized.

![Distribution of shots to sink the fleet](charts/shots.svg)

| shooter | average | median | 10th–90th percentile | fewest | most |
| --- | --- | --- | --- | --- | --- |
| random | 95.4 | 97 | 89–100 | 56 | 100 |
| hunt | 66.2 | 66 | 49–84 | 26 | 100 |
| parity | 61.1 | 62 | 49–72 | 23 | 81 |
| density | 44.8 | 44 | 33–58 | 17 | 73 |

**Random fire nearly always clears the board:** the last ship cell is, on average, the 95th of
100. **Hunting halves that,** and parity saves another 5 shots by cutting off the long games.
Hunting only half the board can't run long, so parity's 90th percentile is 72 against hunt's 84.
**Density saves 16 more.**

Each shot's chance of hitting, among games still going, as a 5-shot moving average:

![Hit rate by shot](charts/hit-rate.svg)

Random sits at the 17% base rate until the end, when the only cells left are ship. The others
spike after the first hits, then slowly decay as the easy ships go. Density's first shot, on a
center cell, hits 21.5% of the time, and its hit rate peaks at 52% on shot 6.

Where each shooter fires in its first 20 shots: density works outward from the four center cells
(each is its first shot a quarter of the time) along a checkerboard, and parity's checkerboard
shows. Hunt and random spread evenly.

![Where each shooter fires first](charts/first-shots.svg)

Density sinks the carrier first (shot 18 on average), since that's where the heat is, and the
destroyer last (shot 35). Random sinks the destroyer first only because it has the fewest cells
to find.

![When each ship sinks](charts/sinks.svg)

### Seeking information instead of hits

*From `node scripts/posterior.ts`, 2,000 uniform fleets, about three minutes.*

Density only approximates the odds: its 100× per hit is a rule of thumb, not a probability.
`posterior` computes them exactly. It keeps 1,000 fleets drawn uniformly from every arrangement
still consistent with the shots, the sinks, and the order the ships sank in. Then it can fire
for hits or for information:

- **exact** fires where the most of those fleets have a ship.
- **info** fires where the answer (miss, hit, or which ship sank) is least predictable. It takes a
  sure hit only when nothing else is uncertain.

| shooter | shots | first hit |
| --- | --- | --- |
| density | 45.0 | 4.2 |
| exact | 44.8 | 4.3 |
| info | 45.3 | 4.1 |

**Neither exact odds nor information beats the rule of thumb.** All three are within ±0.55
shots of each other. Seeking information can't help much in this game:

- Every ship cell has to be shot anyway, so knowledge pays only when it prevents a later miss.
- While searching, no cell is more than about 21% likely to hold a ship. Below 50%, the least
  predictable cell is simply the likeliest one, so both fire at the same cells.
- They only part ways after a hit. There info prefers a 50/50 cell to a near-sure hit, which
  mostly reorders shots that have to be taken anyway.

## Hiding

*From `node scripts/placements.ts` and `node scripts/games.ts`.*

Five ways to hide a fleet (`src/fleets.ts`):

- **uniform**: every arrangement equally likely.
- **edges**: every ship along the outer ring.
- **spread**: no two ships touching, not even diagonally.
- **clustered**: each ship touching one already placed.
- **cold**: the coldest of 100 uniform fleets on the exact heat map above, so the fleet sits
  where a density shooter looks last.

![Where each placer puts ships](charts/placers.svg)

And two more kinds of shooter. **tuned** knows your habit: it's density, but weighs each
placement of each ship by how often the hider uses it, so "tuned edges" expects a fleet on the
rim. **adaptive** doesn't know your habit and works it out as it goes (see the next section).

Every shooter against every hider, colored by how many shots more (blue) or fewer (red) than
density against uniform:

![Every shooter against every hider](charts/matrix.svg)

**Against a density shooter that doesn't know your habit, hug the edges:** 51.4 shots, 6.6 more
than a uniform fleet. Cold gets 4.7 more. Both hide where density looks last. Its first hit takes
15.8 shots against an edge fleet and 10.1 against a cold one, against 4.2 for uniform.

**If they know, edges is the worst choice there is:** 23.8 shots, not far above the 17 cells of
ship. Cold falls to 39.3. A habit that beats the standard shooter is exactly what a shooter
learns to exploit.

**Against hunt, spread out; against density, it doesn't matter.** Hunt chews through a cluster
(37.1 shots), since every neighbor of a hit is likely another ship, and wastes shots around
spread fleets (73.9). Density assumes neither, so both are within half a shot of uniform against
it.

**A uniform fleet can't be exploited much.** Its worst case is 44.6 shots, against the shooter
tuned for it, only 0.2 fewer than plain density. That's what being uniform buys: no habit to
learn.

### Working out the opponent's habit

`adaptive` keeps 20,000 sampled fleets of each habit and, after every shot, drops the ones the
shot rules out. The share of each habit's fleets still standing is how likely that habit is. It
fires as density tuned to a blend of the habits, each weighted by that likelihood. Once fewer
than 20 fleets of every habit fit, those shares are noise, so it stops updating them.

| hider | density | tuned to the true habit | adaptive |
| --- | --- | --- | --- |
| uniform | 44.8 | 44.6 | 45.8 |
| edges | 51.4 | 23.8 | 24.8 |
| spread | 45.2 | 44.2 | 45.6 |
| clustered | 44.9 | 42.7 | 44.7 |
| cold | 49.5 | 39.3 | 41.8 |

**Adaptive gets nearly all of a tuned shooter's gain without being told the habit:** 24.8 shots
against an edge fleet where tuned edges takes 23.8, and 41.8 against cold where tuned cold takes
39.3. **Not knowing costs about a shot** against fleets with no habit to find: 45.8 against a
uniform fleet, where density takes 44.8.

*From `node scripts/probing.ts`, 2,000 fleets per hider.* A version that deliberately probes,
firing where the habits disagree most until one is 95% likely, does worse against every hider.
It costs 7.4 shots against edges, 3.7 against spread, 2.8 against uniform and 2.0 against
clustered, and nothing measurable against cold. **The habit gives itself away without probing:**
a few misses in the middle betray an edge fleet, and probe shots are mostly misses.

### The best mix

*From `node scripts/equilibrium.ts`.*

If both players know each other's options, it's a zero-sum game. The hider picks a habit to
maximize shots, the shooter picks a shooter to minimize them, and each mixes so the other can't
exploit it. Solving it by fictitious play over the matrix above (without random) gives:

![Best mixes for hider and shooter](charts/equilibrium.svg)

**Hide uniformly most of the time:** 66% uniform, 24% clustered and 10% cold. The shooter mixes
density tuned for uniform (51%), adaptive (42%) and tuned clustered (7%). That holds the shooter
to **45.1 shots**, only 0.3 more than a uniform fleet manages against plain density.

Without adaptive, the best mix was quite different: cluster 58% of the time and go cold 38%,
for 46.2 shots. Habits pay only against a shooter that can't learn them mid-game. And adaptive's
worst case, 45.8, is barely more than the 45.1 the best mix promises.

## Going first

*From `node scripts/games.ts`.*

Both players shoot in turn, so whoever sinks the other's fleet in fewer shots wins, and the
player who shoots first wins ties. Two density shooters against uniform fleets tie 3.1% of the
time, so **going first wins 51.5%**. It's 51.1% for hunt, 51.7% for parity and 54.8% for random,
whose games bunch up near 100 shots and tie most.

## More findings

**Touching ships used to send density off the rails.** When ships touch, a sink can be explained
by more than one line of hits. Density used to commit to one line, and when it picked the wrong
one, the ship left afloat no longer fit anywhere, so it fired cell by cell. One game against a
cluster took 95 shots: the destroyer sank at B6, and density claimed B6–B7 when B7 was the
battleship's. 16 of 250,000 games took more than 75 shots. Now it reconsiders its claims after
every shot, keeping ones that leave every ship afloat somewhere to be and every other hit
explained. Its longest game is 73 shots, and its averages didn't move.

## Cheat sheet

[battleship.visnup.com](https://battleship.visnup.com) (`cheat/`) is a page to play a real game
with. Tap the cell you fired at and say miss, hit, or which ship sank; answers no fleet could give
are greyed out. It shades the board by the algorithm you pick and lists every algorithm's next
shot, with adaptive's odds on each habit beside the shooter tuned for it. `pnpm cheat` serves it
with Vite, and `pnpm build` builds it into `cheat/dist/`.

## Next

`TODO.md` has what's left: lookahead, rule variants, and shooters that learn across a series of
games.
