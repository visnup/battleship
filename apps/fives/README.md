# Fives

Fives is a trick-taking card game from CMYK's Magenta line, designed by Taiki Shinzawa, for 3 or 4
players. You follow the led color if you can, silver is trump, and the winner of each trick keeps
the card they won it with. The twist is the target: at the end of the hand you want those cards to
add up to 25, or as close as you can get without going over. And every card's back is a magenta
5, so any card can be played face down as one.

This repo is a simulator of the game. It plays millions of games by the rules, so it can answer
the questions that come up at the table: when to take a trick and when to duck it, what to do with
high cards, and when to flip a card to its magenta 5.

The answers come from the model, not from real tables. It follows the How to Play booklet, and
`CLAUDE.md` lists the readings the booklet leaves open. It hasn't been checked against real games.

The simulator and this analysis were written with Claude Opus 5.5, working in Claude Code.

## A quick refresher

The deck is 52 cards: 1 to 13 in blue, green and silver, and 0 to 4 and 6 to 13 in magenta. At 3
players the 10s to 13s come out, and everyone gets 12 cards; at 4, everyone gets 13.

- Whoever holds the magenta 0 leads the first trick of each hand, with any card. The winner of a
  trick leads the next.
- Follow the led color if you can. The highest silver wins, or else the highest of the led color.
- Any card can be played face down as a magenta 5, one a trick: when you lead, when magenta is led
  (even if you hold magenta), when you can't follow, and when your last card of the led color is
  the one you flip.
- Your total is the cards you won tricks with, a face-down one counting 5. Closest to 25 without
  going over takes 3 chips at 4 players (2 at 3), second 2 (1), third 1, and exactly 25 one more.
  Tied players all take the lower place. A bust gives one of their chips to the closest player.
- Everyone starts with 5 chips. After 4 hands, the most chips wins.

## Reading the numbers

Almost every number here is a win rate: the share of games one player wins, out of thousands played
from different deals. Most tables seat one player of some kind at a table of default players and
rotate it through every seat, so seat order evens out. A shared win counts as a share.

The charts are drawn from this README's own tables. After `pnpm install`, `node scripts/charts.ts`
redraws `charts/`.

- **A fair share** is 1 in however many are at the table: 33.3% at 3 players and 25% at 4.
- **Points** are percentage points of win rate.
- **Points a decision** (for the learned player) are the win chance one play adds over another at a
  single decision, from playing each out.
- **The noise**, from playing a finite number of games: about ±1.5 points at 4,000 games and ±0.5
  at 40,000.

## The players

- **The default** (`defaultPolicy` in `src/game.ts`) is a few hand-written rules: once busted, dump
  your biggest card; take a trick you're sure to win if it makes exactly 25 or doesn't bust; else
  play under the trick, dumping your biggest card that loses; and if every play wins, the biggest
  that doesn't bust. "Sure" means nobody still to play can hold a card that beats it, counting
  what's been seen. It's weak, which is the point of what follows.
- **Playouts** try every legal play: copy the game, deal the cards you can't see again at random
  (respecting colors someone has shown they're out of), play on with the default everywhere, and
  make the play that wins most. Playing only to the end of the hand and scoring it by the chance
  of winning from the chips (`chance`, a softmax fit to default games) is both cheaper and
  stronger than playing all four hands out.
- **The learned player** (`src/learned.ts`) scores each play with gradient-boosted trees fit to
  playout values, so it plays about as well as playouts at a tiny fraction of the cost. Each round
  of training labels the games of the last round's learned player, with learned players inside
  the playouts.

One player against the default in every other seat (800 games for playouts, 4,000 for the rest):

![Each player's wins against the default, in fair shares](charts/players.svg)

| player | 3 players (fair 33.3%) | 4 players (fair 25.0%) |
| --- | --- | --- |
| hand playouts, 32 deals | 96.6% | 92.1% |
| hand playouts, 16 deals | 94.9% | 86.1% |
| full-game playouts, 32 deals | 95.3% | 82.4% |
| learned, round 0 | 87.0% | 79.6% |
| random | 29.4% | 18.8% |
| face up only (never a magenta 5) | 24.2% | 16.2% |
| greedy: take the lead whenever it doesn't bust | 7.8% | 3.0% |

The default against itself busts in 58% of hands at 4 players and 42% at 3, and hits 25 exactly in
under 5%. Never playing a card face down costs the default 9 points at either count: the
magenta 5 is how you get rid of a high card without adding it to your total.

## Rounds

Each round labels 4,000 games a player count (8,000 from round 4, 32 deals in round 6, and 12,000 from round 7, with card-counting features fit only to rounds 7 on; round 8's playouts score a hand's end by a `chance` refit to learned players' games) played by the round before's learned player, each
play valued by hand playouts on 16 deals among learned players (round 0: default games and
default players, 32 deals). Each model at a table of the one before it (20,000 games, 10,000 from round 5; round 0's against the default, 4,000):

![Each round's learned player at a table of the round before, and against the default](charts/rounds.svg)

| round | 3 players | 4 players |
| --- | --- | --- |
| 1 | 47.5% | 38.6% |
| 2 | 42.2% | 39.9% |
| 3 | 37.1% | 27.5% |
| 4 | 35.3% | 26.5% |
| 5 | 34.8% | 25.2% |
| 6 | 34.7% | 24.9% |
| 7 | 33.5% | 26.0% |
| 8 | 33.5% | 25.8% |
| 8, refit with 1,500 trees of 127 leaves | 35.1% | 25.5% |

And against the default:

| round, against the default | 3 players | 4 players |
| --- | --- | --- |
| 0 | 87.0% | 79.6% |
| 1 | 79.6% | 78.0% |
| 2 | 82.8% | 84.7% |
| 3 | 84.6% | 85.3% |
| 4 | 87.1% | 86.2% |
| 5 | 88.2% | 86.7% |
| 6 | 88.9% | 86.8% |
| 7 | 89.4% | 86.4% |
| 8 | 89.5% | 87.4% |
