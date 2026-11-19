# Hilt

Hilt is a card game from CMYK's Magenta line, designed by Dominique Ehrhard, for 3 to 6 players.
It is a game of battles. Everyone is dealt 10 cards, and in each battle you go around the table
playing cards into a row in front of you, or passing, until everyone has passed. Whoever has
the highest total strength wins a chip. Three chips of a color, or one of each color, win the
game. Nobody draws between battles: cards you spend winning one are gone until the round ends,
when only one player has cards left.

This repo is a simulator of the game. It plays millions of games by the rules, so it can answer
the questions that come up at the table: how much the Favor card is worth, which cards matter,
and above all when to fight for a chip and when to let it go.

The answers come from the model, not from real tables. It follows the How to Play booklet, and
`CLAUDE.md` lists the readings the booklet leaves open. It hasn't been checked against real
games.

The simulator and this analysis were written with Claude Opus 5.5, working in Claude Code.

## A quick refresher

The deck is 96 cards: force cards worth 1 (15 of them), 2, 3, 4, 5, 6 and 10 (8 each), and fate
cards that change the battle:

- **Bait** (15): discard it to take a force card from your row back into your hand.
- **Fury** (6): your force cards count double, one Fury a player a battle.
- **Legend** (3): 10 strength that nothing changes.
- **Winter** (3): every force card in the battle is worth 1, once a battle.
- **Crows** (3): the battle ends at once, and whoever leads wins.
- **Doves** (3): the battle ends at once with no winner; the chip and the Favor stay where they
  are.

The Favor card goes to whoever won the last battle. Its holder picks which color of chip the next
battle is over, has 1 strength in their row before anyone plays, and acts last. Ties go to fewer
cards played, then the highest card, then clockwise from the Favor holder. Passing is for the
rest of the battle. When a battle leaves only one player with cards, they discard them, and
everyone is dealt 10 again, plus one card per chip they hold.

## How the default player plays

Every table here is played by or against `defaultPolicy` in `src/game.ts`, a list of rules tried
in order. Each was found by playing out every legal move at the default's decisions
(`scripts/decisions.ts`) and adopted when it beat the default head to head (`scripts/variants.ts`):

1. Once everyone else has passed, Bait back the biggest force card that still leaves you ahead,
   then pass to win.
2. Crows when ahead with a card of your own played; Doves when someone else leads with the chip
   that wins them the game.
3. With nothing played and others still in, play a Fury, or else your strongest card, if you're
   ahead, as the Favor holder is at first.
4. Don't open a battle while 2 or more others are still in: let them spend their cards. Not
   when the chip would win you the game, or anyone else with fewer than 3 others in.
5. Otherwise open with a 1 or a Fury, the cheapest cards.
6. With nobody else left in, play your strongest card if your strongest 4 would overtake: nobody
   can answer, and rule 1 takes back what wasn't needed.
7. Behind with others still in, Bait back a 1: it keeps you in the battle for nothing. Or play
   a 1.
8. Behind, take the lead with the cheapest card that does it, while the battle has cost you at
   most 3 cards, or without limit when the chip decides the game.
9. Behind with the chip that wins you the game, play your strongest card even if it doesn't take
   the lead.
10. Before giving up a battle, Bait back your biggest force card.

The first default, rules 2, 8 and 10 only, wins 12.4% at 3 players and 4.7% at 6 against a
field of later defaults. Each rule after it was the best answer to the default before, and
they don't settle: once everyone waits, opening pays again, and once everyone opens, waiting
does. So from the fifth round on, rules were also judged against a league, a default from every
round in each other seat (`variants.ts --field league`), and kept only if they won there too.
Bait back a 1 while ahead, for one, gains 4 to 7 points against today's default and loses a
point against the league.

### Against strong players

Each rule again, with playouts on 8 deals in every other seat, which beat the default
(`variants.ts --field playouts`, 6,000 games):

| without the rule | 3 players | 6 players |
| --- | --- | --- |
| today's default | 27.3% | 12.2% |
| deny every winning chip | 27.3% | 27.7% |
| open battles: don't wait | 30.6% | 19.1% |
| open with a 1 or Fury before waiting | 28.9% | 14.9% |
| only overtake with a single card | 28.2% | 12.9% |
| no 1 once something's played | 28.0% | 12.4% |
| press with the strongest card, not a Fury | 28.3% | 12.4% |
| open with a 1 or Fury with nobody else in | 26.9% | 12.3% |
| no Bait back after winning | 26.9% | 12.0% |
| pass only at a single card's reach of the lead | 26.6% | 12.0% |
| no Bait back of a 1 while others are in | 26.6% | 11.8% |
| Crows whenever ahead | 25.0% | 11.5% |
| pass when ahead with an empty row | 24.4% | 10.8% |
| the first default | 23.6% | 14.8% |

Two rules are bets on how the others play. Leaving a chip that wins someone the game for the
others to deny is worth 6 to 16 points among default players, which deny it once fewer than 3
are left. Among playouts, which expect the others to deny it and so don't, nobody does, and
denying it yourself is worth 15 points at 6 players. Waiting to open is the same bet: it pays
when the others fight, and against players who wait too, opening wins 3 to 7 points more. The
rest hold up or are within the noise (±1 point at 3 players, ±0.7 at 6).

Who should deny is a free-rider problem, and which answer wins depends on the table. One player
of each kind against a table of the other (40,000 games):

| one player | table | 4 players | 5 players | 6 players |
| --- | --- | --- | --- | --- |
| leaves it to others (the default) | denies every winning chip | 30.9% | 37.0% | 39.5% |
| denies every winning chip | leaves it to others | 22.5% | 15.9% | 12.4% |
| leaves it to others | opens without waiting | 40.0% | 44.1% | 42.9% |
| denies every winning chip | opens without waiting | 45.1% | 49.8% | 52.8% |

Among players who deny, leaving it to them wins twice a fair share at 6 players. Among players
who open every battle without waiting, denying yourself is better. At 3 players there's
never anyone else to leave it to.

Most of what the rules say is about cards as a budget. The 1s, Furies and Baits are cheap ways to
stay in a battle without spending anything that matters, and passing is final, so you play one
rather than pass. The 10s and Legends decide battles, so you spend them only when nobody can
answer, and take them back with Bait when you can.

## Going first

The Favor starts in seat 1, which acts last in the first battle. 100,000 default games
(`scripts/sim.ts`):

| players | seat 1 | seat 2 | seat 3 | seat 4 | seat 5 | seat 6 | battles | rounds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 34.5% | 41.5% | 24.1% | | | | 6.7 | 1.5 |
| 4 | 29.3% | 32.3% | 20.6% | 17.8% | | | 8.0 | 1.4 |
| 5 | 25.1% | 27.6% | 17.9% | 15.0% | 14.4% | | 9.1 | 1.3 |
| 6 | 22.3% | 24.6% | 15.6% | 12.8% | 12.3% | 12.3% | 10.1 | 1.2 |

Seat 2, which acts first in the first battle, is best, at 1.25 fair shares at 3 players and
1.5 at 6. The Favor's seat is next. The first default, which fought every battle, gave the
Favor seat 40.5% at 3 players and 29.3% at 6 and seat 2 the worst share but one: who the first
battle favors depends on how people play it. Most games end in the first round: a player with
three or four chips is one battle from winning before anyone runs out.

## What each card is worth

The points one more copy in an opening hand adds, in place of a random card, from the same deal
played both ways (`scripts/cards.ts`, 200,000 deals each):

| card | 3 players | 4 players | 5 players | 6 players |
| --- | --- | --- | --- | --- |
| Fury | 5.3 | 3.6 | 3.9 | 3.5 |
| Crows | 5.2 | 4.5 | 5.3 | 5.7 |
| Legend | 4.3 | 3.3 | 2.9 | 2.5 |
| 10 | 3.9 | 3.5 | 2.9 | 2.5 |
| 1 | 1.0 | 0.3 | 0.2 | 0.3 |
| 6 | 0.4 | 0.5 | 0.2 | 0.2 |
| 5 | −0.6 | −0.3 | −0.5 | −0.5 |
| 4 | −1.6 | −1.0 | −1.2 | −1.1 |
| Bait | −2.1 | −2.1 | −1.8 | −1.4 |
| 3 | −2.7 | −1.9 | −1.8 | −1.7 |
| Winter | −3.8 | −2.5 | −2.4 | −2.3 |
| 2 | −4.4 | −3.3 | −3.1 | −2.7 |
| Doves | −7.1 | −6.2 | −5.9 | −5.2 |

These are against a random card, so a card worth nothing is about average. What a card is worth
depends on how it's played. Against the first default, which fought every battle and played
Crows whenever it led, a 10 or a Legend was worth 8 to 12 points and Crows −6.5 to −10. Played
as the default plays now, Fury and Crows are worth the most, a 1 beats a 6, and a 2 is near the
bottom: too big to stall with and too small to win.

## A learned player

The rules above top out well short of playouts, so, as in monopoly-deal, a player learned from
them. `scripts/dataset.ts` plays default games and, at every decision of one player, plays every
legal move out to the end on 32 shared deals: about 250,000 decisions at each player count, in 10
minutes. `scripts/learn.py` fits gradient-boosted trees (LightGBM, 1,000 trees) to predict each
move's value from 40 numbers about the board and 19 about the move, and `src/learned.ts` plays
the move they rank first. On held-out games, this first model's pick gains 3.1 to 3.6 points of
win chance a decision over the default's:

| learned player | 3 players | 4 players | 5 players | 6 players |
| --- | --- | --- | --- | --- |
| against the default | 74.7% | 61.4% | 54.3% | 50.3% |
| against the league of defaults | 73.0% | 58.1% | 49.3% | 43.3% |
| against playouts on 8 deals | 53.6% | | | 27.9% |
| the default, against learned players | 8.8% | 6.7% | 7.9% | 8.8% |

It plays as well as playouts on 128 deals at a tiny fraction of the cost, and it isn't just
exploiting the default: it holds up against every earlier default and against playouts.

Then, as in monopoly-deal, rounds of training on the learned player's own games, labeled the same
way, with default players inside the playouts (`dataset.ts --play`), 20,000 games each:

| model | against the default, 3 / 4 / 5 / 6 players | against round 0 | against rounds 0–1 |
| --- | --- | --- | --- |
| round 0: default games | 74.7 / 61.4 / 54.3 / 50.3 | 33.3 / 24.7 / 20.3 / 16.9 | |
| rounds 0–1: and the learned player's | 77.0 / 61.9 / 54.8 / 50.6 | 37.5 / 27.6 / 24.6 / 22.2 | 33.2 / 24.9 / 20.2 / 17.0 |
| rounds 0–2 | 77.5 / 62.0 / 55.6 / 51.6 | | 34.4 / 25.4 / 20.3 / 16.9 |

Round 1 gains 3 to 5 points against round 0's players, from seeing the boards a learned player
reaches. Round 2 ties it: the labels still ask which move is best if default players play on, and
the loop converges on the best answer to them.

So round 3 asks which move is best if learned players play on: rounds 0–1's learned player plays
the games, and a 200-tree version of it plays inside the playouts (`dataset.ts --rollout`), on 16
deals instead of 32. That costs 25 times as much a decision, so it's 3,000 games a player count,
about 55,000 decisions, in 33 minutes. Against 20,000 games each:

| model | against the default | against rounds 0–1 | against round 3 |
| --- | --- | --- | --- |
| rounds 0–1 | 77.0 / 61.9 / 54.8 / 50.6 | 33.2 / 24.9 / 20.2 / 17.0 | 20.6 / 20.2 / 18.4 / 16.9 |
| round 3 | 58.6 / 48.1 / 41.8 / 35.3 | 53.6 / 42.3 / 33.8 / 28.5 | 33.2 / 24.6 / 20.0 / 16.7 |
| rounds 0, 1 and 3 together | 75.6 / 60.8 / 53.3 / 47.6 | 34.5 / 25.6 / 19.4 / 16.6 | 21.4 / 20.0 / 18.1 / 15.4 |

At 3 to 6 players. Round 3's player beats a table of rounds 0–1's by 12 to 20 points, and wins
less against the default: what the labels assume about the others decides whom the player
beats, as with the rules. Mixed in with the default-labeled rounds, round 3's labels wash out.

Round 4 does it again with round 3's player in the games and the playouts (`dataset/model-r3s`):

| model | against the default | against rounds 0–1 | against round 3 |
| --- | --- | --- | --- |
| round 4 | 49.8 / 51.8 / 43.8 / 38.8 | 44.5 / 30.1 / 19.9 / 14.6 | 43.5 / 41.2 / 39.8 / 36.4 |
| rounds 3–4 | 56.3 / 53.9 / 48.2 / 44.5 | 53.9 / 40.9 / 31.7 / 25.4 | 44.6 / 41.3 / 39.6 / 36.7 |

Rounds 3–4 together beat round 3's players by 11 to 20 points, keep round 3's edge over rounds
0–1's, and do better against the default at 4 to 6 players. They hold up elsewhere too:

| rounds 3–4 | 3 players | 4 players | 5 players | 6 players |
| --- | --- | --- | --- | --- |
| against the league of defaults | 62.6% | 53.0% | 44.6% | 38.3% |
| against playouts on 8 deals | 59.6% | | | 34.3% |
| rounds 0–1, against them | 11.3% | 11.2% | 7.2% | 5.2% |
| the default, against them | 2.8% | 4.6% | 4.5% | 3.8% |

Round 5, the same again from rounds 3–4, still gains, by less: rounds 3–5 beat a table of
rounds 3–4's players 39.3%, 29.5%, 23.7% and 20.3%, 3.6 to 6 points over a fair share, with the
same 53.4% to 25.1% against rounds 0–1's and 49.7% to 42.6% against the default. Round 6 gains
again, by less: rounds 3–6 beat a table of rounds 3–5's players 37.1%, 26.7%, 22.1% and 18.7%,
and a table of rounds 3–4's 44.1%, 30.9%, 25.7% and 22.2%, more than rounds 3–5 did. That's
`src/model.json` now. More rounds would probably still gain a little.

## Which chip to fight over

The Favor holder picks the chip for the next battle. The default picks the one that leaves it
fewest chips from winning, then the one that helps the closest opponent least (`pickColor`).
Against the default (`variants.ts`, 40,000 games):

| chip | 3 players | 4 players | 5 players | 6 players |
| --- | --- | --- | --- | --- |
| the default's | 33.3% | 25.2% | 20.0% | 16.9% |
| by playouts, 32 deals | 33.7% | 25.6% | 20.2% | 17.0% |
| helping the closest opponent least, first | 32.8% | 24.2% | 18.7% | 15.6% |
| our own progress only | 30.4% | 23.1% | 17.7% | 14.9% |
| at random | 23.4% | 17.0% | 12.9% | 10.3% |

The pick is worth 7 to 10 points, and the default's rule gets nearly all of it: playing each chip
out gains under half a point. Your own progress comes first, but ignoring everyone else's costs 2
to 3 points.

## Strategies

One player of each against the default in every other seat (`scripts/strategies.ts`, 100,000
games; playouts 4,000):

| strategy | 3 players | 4 players | 5 players | 6 players |
| --- | --- | --- | --- | --- |
| default | 33.3% | 25.2% | 20.0% | 16.7% |
| learned, rounds 0–1 | 77.0% | 61.9% | 54.8% | 50.6% |
| learned, rounds 3–5 | 49.7% | 51.2% | 46.8% | 42.6% |
| playouts, 128 deals | 73.5% | 61.2% | 56.2% | 54.8% |
| playouts, 32 deals | 63.9% | 51.8% | 44.2% | 40.5% |
| playouts, 8 deals | 40.0% | 27.9% | 25.2% | 22.4% |
| spender: chase every battle | 5.7% | 1.6% | 1.2% | 1.0% |
| no Bait | 5.5% | 1.5% | 1.2% | 1.0% |
| random | 2.5% | 1.6% | 1.3% | 1.0% |
| passive: never play | 0.0% | 0.0% | 0.0% | 0.0% |

Playouts play out every legal move to the end of the game on deals of the cards they can't see,
with the default playing on, and make the one that wins most. Against the first default, 32
deals won 84% at 3 players and 76% at 6; each round of rules took some of that away. More deals
still help a lot, so there's plenty more to how Hilt should be played than the default's rules.
Spending to win every battle is ruinous, and so is never taking a card back with Bait. The
learned players are in "A learned player": rounds 0–1 learned to beat default players, rounds
3–5 to beat learned ones, and at a table of each other rounds 3–5 win. Rounds 3–6, the current
model, weren't rerun against the default.
