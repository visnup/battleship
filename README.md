# Monopoly Deal

Monopoly Deal is Hasbro's card game of Monopoly: 106 cards, no board, no dice, and games that
last fifteen minutes. You bank money, lay down properties and charge rent like the board game,
but most of the cards are actions that take from other players: Sly Deal steals a property, Deal
Breaker steals a whole set, and Just Say No stops either. The first player with three full sets
wins.

This repo is a simulator of the game. It plays millions of games by the rules, so it can answer
the questions that come up at the table: whether going first matters, which cards are worth
keeping, which sets to chase, whether to build houses, and when to lay your properties down.

The answers come from the model, not from real tables. It follows the rule sheet of the 2023 US
edition (G0351), and the rules the sheet leaves open are measured both ways (see "Rules
questions"). Most tables were played under the 2014 sheet (B0965), which differs in three
readings that together move the first player's share by 0.3 points at most. It hasn't been checked against logged real games yet.

The simulator and this analysis were written with Claude Opus 5.5 at medium effort, working in Claude
Code throughout.

## A quick refresher

Everyone is dealt 5 cards. Each turn you draw 2 (5 if your hand is empty) and play up to 3:

- **Money and action cards into your bank.** Every action card can be banked as money instead.
- **Properties onto the table**, into sets by color. A set is 2 to 4 cards; dark blue, brown and
  utility take 2, railroads 4, the rest 3. Wilds count as one of two colors, or the two
  multicolored ones as any, and can be moved between sets on your own turn.
- **Actions.** Rent charges for one of your colors: a two-color Rent card charges everyone, the
  any-color one charges one player, and Double the Rent doubles it. Debt Collector takes $5M from
  one player and It's My Birthday $2M from everyone. Sly Deal takes a property, Forced Deal swaps
  one, and Deal Breaker takes a full set. Pass Go draws 2. A House or Hotel adds rent to a full
  set.

You pay what you owe from your bank and your properties, your choice, and get no change. If you
can't pay it all, you pay everything you have. Just Say No cancels any action against you, and
can itself be cancelled by another. You end your turn with at most 7 cards in hand. Three full
sets of different colors win. The sheet doesn't say what happens when the draw pile runs out;
here the cards played are shuffled into a new one (see "Rules questions").

## How to read the numbers

**Share of wins** is the measure throughout. A full set doesn't count unless it's your third, and
money in the bank isn't worth anything at the end, so every other measure is a step toward a
win at best.

**A fair share** is 100% ÷ players: 50% at 2 players, 20% at 5.

**Points** are percentage points of a share of wins, never money or cards: winning 21.7% of games
instead of 20.0% is +1.7 points.

**One hand-written player** plays every seat, or every seat but one: `defaultPolicy` in
`src/game.ts`. It tries a list of rules in order and makes the first move one allows: complete a
set, Deal Breaker, Sly Deal, charge rent, Debt Collector, Birthday, Forced Deal, bank, and only
then lay down properties. Every table depends on how well it plays, and "Playing well" shows how
that list was found and how far it is from the best play we know.

**Noise.** Most tables are 100,000 games per cell, so a share of wins is good to about ±0.3
points, two standard errors. Games are played from seeded deals, so a comparison plays both sides
on the same deals.

**Stalled** games are ones with no winner after 200 turns. They count as a win for no one.
"Stalled games" says where they come from.

Node 24 runs everything with no dependencies, and each section names the script behind it:

```bash
node scripts/sim.ts --n 100000 --players 4
```

The charts are drawn from this README's own tables, so they stay in step with them. After
`pnpm install`, `node scripts/charts.ts` redraws `charts/`.

## Going first

*From `node scripts/sim.ts`*, with the default player in every seat:

![Each seat's wins over a fair share, by player count](charts/seats.svg)

| players | first | second | third | fourth | fifth | turns per game | draw pile reshuffled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | 57.1% | 42.9% | | | | 16.2 | 0.0% |
| 3 | 38.1% | 32.4% | 29.5% | | | 21.1 | 0.3% |
| 4 | 28.8% | 25.6% | 23.6% | 22.0% | | 25.2 | 11.2% |
| 5 | 23.5% | 21.4% | 19.5% | 17.8% | 17.9% | 28.6 | 38.9% |

**Going first is worth 14.2 points at 2 players.** That's 33% more wins than the second player.
At 5 players the edge is 3.5 points over a fair share, and later seats win less, down to 17.8%
and 17.9% for the last two. The first player starts drawing and playing a turn ahead, and in a 16-turn
2-player game, that turn matters more.

**A game lasts about 8 rounds at 2 players and 5 to 6 at 5.** A round is a turn for each player.

**The draw pile runs out in more than a third of 5-player games.** It holds 106 − 5 × 5 = 81
cards after the deal. It almost never runs out at 2 or 3 players.

## Which strategy wins

*From `node scripts/strategies.ts`*, which seats one player of each strategy in
`src/strategies.ts` against the default player in every other seat, rotating seats. Playouts are
slow, so they play 10,000 games per cell, which is good to about ±1 point.

![Each strategy's wins in fair shares, by player count](charts/strategies.svg)

| strategy | 2 players (fair 50.0%) | 3 players (fair 33.3%) | 4 players (fair 25.0%) | 5 players (fair 20.0%) |
| --- | --- | --- | --- | --- |
| default | 49.7% | 33.1% | 24.7% | 20.0% |
| builder | 38.7% | 21.1% | 14.3% | 11.5% |
| banker | 49.6% | 33.2% | 24.9% | 19.9% (1 stalled) |
| pacifist | 10.3% | 1.9% (3 stalled) | 0.3% (10 stalled) | 0.0% (41 stalled) |
| random | 5.6% | 1.8% | 0.6% | 0.3% |
| playouts | 61.2% | 49.9% | 46.4% | 41.8% |
| quick playouts | 54.1% | 40.8% | 36.0% | 33.7% |

**Builder** plays the way the default player first did. It lays down properties as soon as it
draws them, builds houses and hotels, and only then charges rent. It wins 11 points less than the
default at 2 players, and more than a third fewer games at 5. "Playing well" breaks that gap down.

**Banker** banks $10M before anything else. That's now about the same as the default, which
already banks its money before laying properties down.

**Pacifist** never takes from anyone and banks every action card. It almost never wins: this is a
game of taking.

**Random** plays a legal move at random. It's the floor.

**Playouts** has no rules of its own. It tries each option by imagining how it turns out, the way
a chess player thinks a few moves ahead, except by trial instead of reasoning. Before every play
it lists everything it could do: each card it could bank, lay down or play, at each target, or
ending its turn, and keeps the 5 a model trained on earlier playouts likes best ("A learned
player" below). For each it plays the game forward many times on a copy of the table,
with the default player making every choice from there, and it picks the option that came out
ahead most often.

It can't see the other hands or the draw pile, so each time it imagines them by shuffling the
cards it can't see and dealing them out again. It doesn't peek: it only knows what a player at
the table would. Different shuffles turn out differently, so it tries each option on 8 shuffles
at a time, drops any option that's clearly behind, and keeps going with the rest, up to 160
shuffles. This is a Monte Carlo search; the name comes from the casino, since it learns by
rolling the dice.

It doesn't play each imagined game to the end. It stops two rounds ahead, when everyone has had
two more turns, and judges the table instead: a formula fitted to thousands of games that turns
full sets, progress toward more, money and the cards in hand into each player's chance to win
(`scripts/chance.ts`). That's faster, and it plays better. Playing every imagined game to the end,
it won 50.3%, 39.5%, 36.4% and 33.7%, probably because the further ahead it looks, the more each
result depends on the draw and on the default player's weaker choices than on the option tried. It wins 11 to 22 points more than the default, so there is still a lot
to find.

**Quick playouts** is the same with less imagining and no model: every option, 16 shuffles each,
one round ahead. It's about 6 times faster (the row took 4 minutes on 20 cores, against 26) and
still wins 4 to 14 points more than the default: a strong opponent that's cheap enough to play
against.

**Skill counts for more at big tables.** Against the default, playouts win 1.22 fair shares at
2 players and 2.09 at 5. At 2 players the weaker player still wins nearly 4 games in 10; at 5,
the four default players together win only 58%.

## Playing well

*From `node scripts/variants.ts`.* `scripts/decisions.ts` plays out every legal move at each of
the default player's decisions and lists the kinds of decision where playouts, rechecked on fresh
deals, clearly beat it. Each pattern became a variant, played head to head like the strategies
above: one player plays the variant, the default plays every other seat, and the table gives the
variant's share of wins.
`scripts/order.ts` also searched the order of the rules, moving one at a time. Rows marked
"(previous)" are what the default used to do, so each costs the default about as much as the
change from it gained.

![Each variant's wins over a fair share, at 2 and 5 players](charts/variants.svg)

| variant | 2 players (fair 50.0%) | 5 players (fair 20.0%) |
| --- | --- | --- |
| the builder | 38.7% | 11.5% |
| lay down properties before charging (previous) | 41.2% | 12.8% |
| lay down properties before banking (previous) | 43.2% | 14.3% |
| build houses and hotels, never bank them (previous) | 46.9% | 18.3% |
| build, else bank them | 49.7% | 20.0% |
| Pass Go only as the last play | 45.3% | 16.9% |
| bank Pass Go | 39.4% | 14.0% |
| Deal Breaker before Pass Go | 49.7% | 20.3% |
| Sly Deal before Pass Go | 49.7% | 20.2% |
| Debt Collector on the richest (previous) | 49.7% | 18.2% |
| any-color Rent on the richest (previous) | 49.7% | 16.9% |
| bank all money before laying down properties (previous) | 47.9% | 19.4% |
| Debt Collector on the most money banked | 49.7% | 18.1% |
| any-color Rent on the most money banked | 49.7% | 16.8% |
| lay down wilds before charging | 48.9% | 18.9% |
| any-color Rent and Debt Collector on the leader (previous) | 49.7% | 17.4% |
| any-color Rent and Debt Collector on the most paid in property | 49.7% | 19.9% |
| any-color Rent on the least banked | 49.7% | 19.5% |
| charge rent worth $2M or more at 2 players (previous) | 48.4% | 20.0% |
| play Forced Deal in the first round (previous) | 49.7% | 19.6% |
| hold Double the Rent (previous) | 49.7% | 20.1% |
| bank Rent cards for colors we have none of | 48.5% | 14.1% |
| Deal Breaker on the leader first | 49.7% | 20.4% |
| end the turn holding what it won't play (previous) | 49.2% | 19.7% |
| Birthday in the first round too (previous) | 49.8% | 19.2% |
| hold the card that completes a set unless it wins | 34.0% | 17.3% |
| Just Say No only against Deal Breaker | 48.2% | 19.3% |
| keep one Just Say No for a Deal Breaker | 48.8% | 19.5% |
| keep two Just Say Nos for a Deal Breaker | 48.2% | 19.3% |
| lay down properties once $5M is banked | 49.4% | 18.8% |
| lay down properties once $15M is banked | 49.4% | 20.1% |

**Charge before you lay properties down, and bank before that too.** This is the biggest lesson,
worth 9 points at 2 players and 7 at 5. A property laid down can be taken by Sly Deal, Forced Deal
or as payment. One held in hand can't, and it can go down later in a single turn. The default
still lays a property down right away when it completes a set.

**Don't build.** Banking a house ($3M) or hotel ($4M) as money beats putting it on a set. Never
banking them costs 2.8 points at 2 players. Building when you can and banking otherwise is no
better than never building. A house adds $3M to one rent card's charge, but the play spent placing
it could have charged rent itself. A set with a house is also the first thing a Deal Breaker
takes.

**Charge one player who has to pay in property.** The any-color Rent and Debt Collector hit one
player. Aim them at someone whose bank can't cover the charge but whose table can, since the
properties they pay with come to you. Among those, pick whoever pays the most, then the leader,
the player with the most full sets. Aiming both at the leader instead costs 2.6 points at 5
players, and aiming them at whoever has the most to pay with costs more. At 2 players there's
only one target. At 5 players, playouts at each any-color Rent found this rule gaining 8 points
each time it chose differently from aiming at the leader, more than any other rule tried: the
least banked, the richest, the next or previous seat, the most or fewest cards in hand, and others.

**Don't save Pass Go.** Playing it first, while plays are left to use what it draws, beats holding
it for the last play by 4 points at 2 players. Banking it costs 10.

**Bank about $10M, then lay properties down before banking more.** This beats banking everything
first by 1.8 points at 2 players and 0.6 at 5. $5M is too little, and $15M is about the same as
$10M.

**Charge even $1M at 2 players.** The default used to skip a rent that collected less than $2M.
At 2 players, charging it anyway is worth 1.3 points; at 3 and 4 it costs a little, so the rule
stays there.

**Bank a Forced Deal in the first round at 3+ players, and Double the Rent when there's no rent
to double.** Early on there's little worth swapping, and the money protects the properties you
lay down later. Each gains 0.3 to 0.5 points where it applies (400,000 games). Banking Rent
cards for colors you have none of loses badly: 6 points at 5 players, where those cards charge
everyone.

**Empty your hand when you can, and hold Birthday in the first round.** Both came from where a
model trained on the dataset (`src/learned.ts`) overrules the default. When the plays
left can empty the hand, banking what the default wouldn't play draws 5 cards next turn instead
of 2: +0.3 to +0.8 points at 2–5 players. In the first round nobody has much to pay a Birthday
with, and holding it gains 0.3 to 0.9 points at 3–5 players (100,000 games each).

**Two pieces of table advice lose.** Players online say to hold the property that completes a
set, so a Deal Breaker can't take the set, and to keep a Just Say No for a Deal Breaker instead
of spending it on rent. Holding the card costs 15 points at 2 players and 3 at 5: a set in hand
charges no rent and counts toward no win. Keeping a Just Say No, even only while holding two,
costs 0.9 to 1.5 points at 2 players and 0.5 to 0.7 at 5. What you lose by paying now is worth more than the Deal Breaker it might stop later.

Tried and rejected, besides the alternatives in the table (at 2 and 5 players, against 49.7% and
20.0% for the default):

- Choosing which property to lay down first: by the most progress toward a set, the least, wilds
  first, the cheapest or the dearest (by the $M printed in its corner), the highest rent or the
  smallest set. All were within noise of taking the first one in hand, the one held longest, or
  worse (wilds first: 19.4% at 5 players). The most progress first with wilds last gains 0.4 points at 2 players, but 0.2 at 3
  and −0.2 at 5 (400,000 games each).
- Laying down a property of a color a Rent card in hand charges, then charging: 49.5% and 19.3%.
- Laying down properties before Debt Collector and Birthday: 45.8% and 15.1%.

**What's left of the placement gap has no pattern.** At 5 players, `decisions.ts` finds playouts
laying a property down before charging rent, Debt Collector or Birthday in some spots, and the
default's choice of rent first or ending the turn winning in others. No rule that splits them
beat the default.

### Against strong opponents

Every table so far plays against default players. *`node scripts/strong.ts`* plays the same
findings against quick playouts in every other seat instead, 8,000 games each (±1.1 points at 2
players, ±0.7 at 5):

![What each finding costs against default players and against strong ones, at 2 and 5 players](charts/strong.svg)

| player | 2 players (fair 50.0%) | 5 players (fair 20.0%) |
| --- | --- | --- |
| default | 44.2% | 13.9% |
| builder | 33.1% | 8.3% |
| build houses and hotels, never bank them (previous) | 41.2% | 12.2% |
| bank all money before laying down properties (previous) | 43.1% | 13.4% |
| lay down properties before banking (previous) | 37.0% | 9.3% |
| keep one Just Say No for a Deal Breaker | 44.3% | 13.6% |
| hold the card that completes a set unless it wins | 29.0% | 11.6% |

**The lessons hold.** Against strong players, building still costs 3.0 points at 2 players and
1.7 at 5, laying properties down before banking costs 7.2 and 4.6, and holding the card that
completes a set costs 15 at 2 players. Keeping a Just Say No for a Deal Breaker is still no
better. Banking all your money first is even at 5 players, as it nearly was before. Gaps shrink
at 5 players, where every player is losing more of their games to the strong ones.

**Going first is worth about the same among strong players.** With quick playouts in every seat,
the first player wins 55.8% at 2 players, against the default's 57.1%, and 24.0% at 5, against
23.5%. The last two seats win 18.5% and 17.0%.

### How good could the choices be?

Playouts still beat the default by 11 to 22 points. What's left at 5 players, found with
playouts that play each deal to the end:

- **Forced Deal.** At 5 players, the best Forced Deal by playouts, rechecked on fresh deals, beats
  the default's by 4.6 points each time they differ, or 1.6 points a game. Most of that is taking
  a different card, often from a different player. But no rule for it beat the default: taking
  from the leader, the dearest card (the most $M in its corner), wilds first, what the victim is
  closest to finishing, giving the cheapest card or what helps the victim least, giving wilds
  too, swapping on a tie, on any swap or only on a clear gain, or playing it before rent. Each
  was scored by playouts at the same decisions. None beat the default beyond the noise, and
  some, like taking the dearest, did worse. Playouts that stop after two rounds find more: at 5 players they play a Forced Deal
  where the default plays something else worth about 7 points a game. But playing it whenever it
  can, before rent, or giving wilds too, each lost up to 1.0 points head to head at 2 and 5
  players (`variants.ts`). Which swap matters, not how often. Picking the swap that most raises
  `chance`, the board score playouts end on, loses too: 47.9% and 19.3% at 2 and 5 players, or
  48.9% and 19.3% only when it raises it. So does picking Sly Deal by it (49.2%, 19.1%). Deal
  Breaker by it ties the default (49.7%, 20.3%).
- **The any-color Rent.** Aiming it at whoever has to pay in property closed most of its gap. The
  best move by playouts now gains at most 2.5 points where they differ, and that's an overstated
  estimate.
- **What to pay with.** `scripts/pay.ts` replays each game to every payment the default makes and
  plays out each way to pay. At 5 players it pays with a loose property instead of money in a
  quarter of payments. Head to head that loses 10 to 26 points: paying with one loose property
  whenever it covers the charge wins 35.9% at 2 players and 9.9% at 5. Playouts want property only in some
  spots, and no rule tried picks them out (`chance` overvaluing the bank isn't why: halving its
  weight changed nothing). Paying from loose properties first, only when the
  bank can't cover the charge, is even.
- **When to Just Say No.** `scripts/sayno.ts` does the same at each chance to say it. Playouts
  would let a Debt Collector through and leave a No against their own action standing, but head
  to head the first is even and never countering a No loses 0.5 to 0.6 points.

### A learned player

Playouts are strong but slow. *`scripts/learn.ts`* turns the dataset (every move of 10,000
default games at each player count, scored by two-round playouts) into 94 numbers per move, and
fits a model that predicts each move's playout score. The learned player then makes the move it
scores highest. It never looks ahead, so a game with one learned player takes about 4 ms of CPU
with the trees and 60 ms with the network.

| player | 2 players (fair 50.0%) | 3 players (fair 33.3%) | 4 players (fair 25.0%) | 5 players (fair 20.0%) |
| --- | --- | --- | --- | --- |
| gradient-boosted trees | 56.0% | 42.0% | 33.8% | 29.1% |
| neural network | 55.5% | 42.6% | 35.2% | 30.7% |
| quick playouts | 54.1% | 40.8% | 36.0% | 33.7% |

100,000 games each against the default in every other seat. The trees (`learn.py`, 1,000 trees,
21 minutes on 20 cores) and the network (`learn_mlx.py`, two layers of 512, 6.5 minutes on the
GPU) are each the first players without lookahead to beat the default, by 6 to 11 points. Both
beat quick playouts at 2 and 3 players. On games they never saw, their picks score 0.5 to 0.6
points of win chance a decision above the default's, and they pick something else 35% to 42% of
the time (the trees) and about 60% (the network).

**Where they overrule the default became two rules.** The model ended its turn by banking a card
the default would hold, when that emptied its hand, and it held Birthday in the first round. Both
are now in the default player.

**As a filter it makes playouts stronger.** Playing out only the trees' top 5 moves, with twice
the shuffles (160), wins 1.3 to 3.1 points more than playing out every move on 80 (59.1%,
48.6%, 43.7% and 38.7%), at 1.2× the time (10,000 games each). That's now `playouts`, with the
trees in `src/model.json`. Using the model as the player inside the imagined games instead
costs 20× the time and wins less. A network trained to judge the table in place of `chance` is even
on the top 5 with 160 shuffles.

**Training on its own games makes it stronger.** Each round, the learned player plays new games,
its top 6 moves at each decision (and the default's, and one at random) are played out, and new
trees are fit to that round and the one before. Round 0 is the trees above.

| round | 2 players (fair 50.0%) | 3 players (fair 33.3%) | 4 players (fair 25.0%) | 5 players (fair 20.0%) |
| --- | --- | --- | --- | --- |
| 0 | 57.0% | 43.6% | 35.8% | 30.9% |
| 1 | 57.7% | 44.6% | 37.7% | 32.6% |
| 2 | 57.6% | 44.5% | 37.3% | 32.2% |
| 3 | 58.1% | 46.1% | 39.4% | 34.6% |
| 4 | 58.5% | 46.4% | 39.9% | 35.2% |

![The learned player's wins in fair shares after each round](charts/rounds.svg)

All on the same 50,000 deals against the default in every other seat (`scripts/compare.ts`),
where two rounds differ by ±0.35 to ±0.46 points. Round 1 played 10,000 games a player count,
round 2 2,500, and round 3 5,000 with the playouts paying by the learned payer (`src/pay.json`).
Round 4 played 10,000 on 16 shuffles a move instead of 32, with only the mover paying that way.
That beat 5,000 games on 32 (+0.1 to +0.3) and 10,000 with half the decisions played out (0 to
+0.6), each against round 3: more decisions beat less noise in each. Ranked playouts gain nothing
from rounds 2 to 4 (±1 to ±1.4 at 4,000 games).

## What each card is worth

*From `node scripts/cards.ts`*, which deals each game twice: once as dealt, and once with one copy
of a card moved from the draw pile into one player's opening hand. The difference in that player's
wins is the card's value, in points. The noise is about ±0.5 points, and $M is what the card is
worth as money. Sorted by 4 players:

![Each card's value in points, by player count](charts/cards.svg)

![Each card's value in points against its worth as money, at 2 and 5 players](charts/worth.svg)

| card | $M | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- | --- |
| Deal Breaker | 5 | +27.6 | +26.2 | +21.1 | +15.4 |
| It's My Birthday | 2 | +3.3 | +5.6 | +7.4 | +8.8 |
| Just Say No | 4 | +12.3 | +10.0 | +7.2 | +5.1 |
| Rent, dark blue/green | 1 | +2.2 | +4.3 | +6.1 | +7.6 |
| Property Wild, any color | 0 | +9.2 | +8.1 | +5.6 | +4.6 |
| Rent, red/yellow | 1 | +1.6 | +3.1 | +4.6 | +5.7 |
| Rent, any color | 3 | +3.5 | +3.8 | +3.9 | +3.1 |
| Rent, light blue/brown | 1 | +1.0 | +2.1 | +3.4 | +3.8 |
| Debt Collector | 3 | +8.0 | +4.5 | +3.2 | +1.9 |
| Property Wild, dark blue/green | 4 | +6.7 | +4.8 | +3.2 | +1.5 |
| Rent, pink/orange | 1 | +0.8 | +2.3 | +3.2 | +3.9 |
| Rent, railroad/utility | 1 | +0.8 | +2.1 | +3.1 | +4.1 |
| Property Wild, light blue/brown | 1 | +4.2 | +3.6 | +2.8 | +1.7 |
| Property Wild, railroad/utility | 2 | +4.0 | +3.5 | +2.5 | +1.5 |
| dark blue | 4 | +5.2 | +3.9 | +2.4 | +1.4 |
| utility | 2 | +3.4 | +2.5 | +1.8 | +1.0 |
| Property Wild, red/yellow | 3 | +3.4 | +2.8 | +1.7 | +0.9 |
| brown | 1 | +3.2 | +2.3 | +1.6 | +0.7 |
| Property Wild, pink/orange | 2 | +3.0 | +2.5 | +1.6 | +0.6 |
| $5M | 5 | +1.5 | +2.0 | +1.5 | +0.6 |
| Pass Go | 1 | +3.5 | +2.5 | +1.2 | −0.1 |
| Property Wild, light blue/railroad | 4 | +1.8 | +1.4 | +1.0 | +0.1 |
| Forced Deal | 3 | +2.4 | +1.2 | +1.0 | +0.6 |
| $4M | 4 | +0.7 | +1.6 | +0.9 | +0.5 |
| Property Wild, green/railroad | 4 | +2.4 | +1.8 | +0.8 | +0.3 |
| House | 3 | +0.6 | +1.1 | +0.8 | +0.4 |
| Sly Deal | 3 | +7.5 | +2.7 | +0.8 | −0.0 |
| $2M | 2 | +0.2 | +1.0 | +0.8 | +0.1 |
| $3M | 3 | +0.2 | +1.2 | +0.8 | +0.1 |
| Hotel | 4 | +0.6 | +1.5 | +0.6 | +0.5 |
| red | 3 | +1.8 | +0.9 | +0.3 | −0.2 |
| yellow | 3 | +2.1 | +1.2 | +0.3 | +0.0 |
| pink | 2 | +1.0 | +0.6 | +0.1 | −0.5 |
| orange | 2 | +1.7 | +0.6 | +0.1 | −0.1 |
| Double the Rent | 1 | −0.3 | +0.2 | +0.1 | −0.1 |
| green | 4 | +2.0 | +0.8 | +0.0 | −0.3 |
| $1M | 1 | −0.5 | +0.1 | −0.1 | −0.6 |
| $10M | 10 | +1.0 | +0.4 | −0.2 | −0.5 |
| light blue | 1 | +0.9 | +0.1 | −0.3 | −0.7 |
| railroad | 2 | +0.5 | −0.4 | −0.8 | −1.1 |

**Deal Breaker is worth the most by far.** With it, a 2-player game goes from a coin flip to 78%
for the holder. It's a third of a win, taken from someone else.

**Two-color Rent cards gain value with more players**, from +1 to +2 at 2 players to +4 to +8 at 5.
Each one charges every other player, so it collects more the more players there are. The one for
the most expensive colors, dark blue and green, is the third most valuable card at 5
players, after Deal Breaker and Birthday. Yet each is worth just $1M as money.

**Cards that hit one player lose value with more players.** Just Say No, Debt Collector and Sly
Deal are each worth far more at 2 players, where the one player they hit is the only opponent.

**Money is worth little**, never more than 2.0 points, and $10M is worth barely more than $1M. One
more card of money mostly sits in the bank as insurance against rent.

**The two multicolored Property Wilds are worth nothing as money, but they're among the most
valuable cards** at 2 and 3 players. They fit any set.

**Of the properties, dark blue, brown and utility are worth most.** They're the 2-card sets. Light
blue, pink and railroad are worth least.

A card worth nothing or less, like a railroad or light blue at 5 players, shows where the
default player misplays it, not that you'd be better off without it.

### Played or banked

The same deals again, with the extra action or Rent card banked on the player's first play
instead. Each cell is the card's value banked, then (in parentheses) played as the default plays
it:

![Each action card's value played and banked, at 2 and 5 players](charts/used.svg)

| card | $M | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- | --- |
| Deal Breaker | 5 | +2.0 (+27.6) | +2.0 (+26.2) | +1.7 (+21.1) | +1.0 (+15.4) |
| It's My Birthday | 2 | −0.0 (+3.3) | +0.9 (+5.6) | +0.9 (+7.4) | +0.8 (+8.8) |
| Just Say No | 4 | +0.7 (+12.3) | +1.1 (+10.0) | +0.8 (+7.2) | +0.7 (+5.1) |
| Rent, dark blue/green | 1 | −0.4 (+2.2) | +0.4 (+4.3) | +0.4 (+6.1) | −0.1 (+7.6) |
| Rent, red/yellow | 1 | −0.5 (+1.6) | +0.2 (+3.1) | +0.5 (+4.6) | +0.1 (+5.7) |
| Rent, any color | 3 | +0.3 (+3.5) | +0.9 (+3.8) | +0.7 (+3.9) | +0.4 (+3.1) |
| Rent, light blue/brown | 1 | −0.5 (+1.0) | +0.0 (+2.1) | +0.2 (+3.4) | −0.6 (+3.8) |
| Debt Collector | 3 | +0.2 (+8.0) | +1.0 (+4.5) | +1.0 (+3.2) | +0.4 (+1.9) |
| Rent, pink/orange | 1 | −0.5 (+0.8) | +0.2 (+2.3) | −0.1 (+3.2) | −0.2 (+3.9) |
| Rent, railroad/utility | 1 | −0.5 (+0.8) | +0.3 (+2.1) | +0.2 (+3.1) | −0.3 (+4.1) |
| Pass Go | 1 | −0.6 (+3.5) | +0.7 (+2.5) | +0.2 (+1.2) | +0.1 (−0.1) |
| Forced Deal | 3 | +0.6 (+2.4) | +1.2 (+1.2) | +1.0 (+1.0) | +0.6 (+0.6) |
| House | 3 | +0.7 (+0.6) | +1.1 (+1.1) | +0.9 (+0.8) | +0.3 (+0.4) |
| Sly Deal | 3 | +0.6 (+7.5) | +1.0 (+2.7) | +0.8 (+0.8) | +0.4 (−0.0) |
| Hotel | 4 | +0.8 (+0.6) | +1.6 (+1.5) | +0.8 (+0.6) | +0.8 (+0.5) |
| Double the Rent | 1 | −0.2 (−0.3) | +0.2 (+0.2) | +0.1 (+0.1) | −0.1 (−0.1) |

**Play your action cards; don't bank them.** Banked on the first play, none is worth more than
2.0 points, about what money is. Played, Deal Breaker is worth ten times that, and most Rent
cards several times. A Rent card's $1M is the least of it.

**Except Forced Deal and Double the Rent, early.** Forced Deal was worth more banked on the first
play than as the default played it at 3 or more players, so the default now banks it in the first
round there, and Double the Rent whenever there's no rent to double: the two columns now match.
Banking every Forced Deal still loses, 1.3 points at 5 players and 2.9 at 2 (`variants.ts`). Sly
Deal at 5 players is worth a little more banked too, but banking every Sly Deal loses 2.6 to 7
points.

Houses and hotels come out the same either way: the default banks them already.

## Which colors to chase

*From `node scripts/colors.ts`*, which counts, at the end of each game, the colors of the winner's
full sets and of the losers'. A winner has exactly 3 sets, so the shares in a column add up to
300%. The winner's share comes first, then in parentheses how often a loser holds that color as a
full set at the end.

![How often each color is a full set at the end: bars for the winner, ticks for a loser](charts/colors.svg)

| color | cards in a set | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- | --- |
| dark blue | 2 | 50% (12%) | 52% (13%) | 54% (11%) | 56% (9%) |
| brown | 2 | 49% (16%) | 49% (16%) | 49% (15%) | 49% (13%) |
| utility | 2 | 45% (15%) | 46% (15%) | 45% (14%) | 45% (12%) |
| pink | 3 | 27% (7%) | 26% (7%) | 26% (6%) | 26% (5%) |
| red | 3 | 26% (7%) | 26% (7%) | 26% (6%) | 26% (5%) |
| light blue | 3 | 24% (7%) | 24% (7%) | 24% (6%) | 25% (5%) |
| green | 3 | 23% (6%) | 24% (6%) | 23% (5%) | 23% (4%) |
| orange | 3 | 22% (6%) | 22% (6%) | 22% (5%) | 22% (4%) |
| yellow | 3 | 22% (6%) | 22% (6%) | 22% (5%) | 21% (4%) |
| railroad | 4 | 13% (4%) | 12% (3%) | 11% (3%) | 11% (2%) |

**Each 2-card set, dark blue, brown and utility, is in about half of all wins.** That's about twice
as often as any 3-card set.

**Railroads, the one 4-card set, are in only one win in eight.**

**Dark blue rises to 56% at 5 players.** It's a 2-card set and charges the highest rent, 8. So
it's the set most worth finishing, and the one most worth taking with a Deal Breaker.

So: chase 2-card sets, especially dark blue, and leave railroads for last. The default player only
places what it draws, so these shares follow from how easy each set is to finish, not from any
plan.

## When a game is decided

*From `node scripts/decided.ts`*, which plays default players and, after each round, finds who's
ahead by the chance to win that playouts score boards with: full sets, progress toward more,
money and cards in hand. Each cell is the share of games still going, then how often the player
ahead wins them, and in parentheses how often the one furthest behind does. 100,000 games each.

![After each round, how often the player ahead (solid) and the one furthest behind (dashed) go on to win](charts/decided.svg)

| after round | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 1 | 100%: 63% (37%) | 100%: 46% (25%) | 100%: 37% (18%) | 100%: 31% (14%) |
| 2 | 100%: 67% (33%) | 100%: 52% (21%) | 100%: 43% (14%) | 100%: 38% (10%) |
| 3 | 100%: 71% (29%) | 100%: 57% (17%) | 100%: 49% (10%) | 99%: 46% (6%) |
| 4 | 99%: 74% (26%) | 98%: 62% (13%) | 96%: 56% (7%) | 92%: 53% (4%) |
| 5 | 95%: 77% (23%) | 90%: 66% (11%) | 81%: 60% (5%) | 71%: 56% (2%) |
| 6 | 85%: 79% (21%) | 71%: 67% (9%) | 56%: 60% (4%) | 39%: 53% (2%) |
| 7 | 68%: 79% (21%) | 47%: 65% (9%) | 28%: 56% (4%) | 12%: 51% (2%) |
| 8 | 47%: 78% (22%) | 23%: 62% (10%) | 9%: 50% (5%) | 2%: 52% (2%) |

**Nothing is decided early.** After three rounds the player ahead wins 71% of 2-player games and
46% at 5, where a fair share is 20%. Whoever is furthest behind still wins 29% at 2 players and
6% at 5.

**Comebacks run out at big tables.** At 2 players, the player behind after round 5 still wins
one game in five, as often as after round 8. At 5 players it's 2%: four others can take from
the leader, but the last player rarely catches all of them.

**The lead stops growing after round 5 or so.** Games still going then are the close ones, so
being ahead says less. At 5 players three games in five are over by round 6.

## Paying

*From `node scripts/payments.ts`*, every payment in 100,000 games of default players each:

![How often payments cost property, and how many players ever pay in property, by player count](charts/paying.svg)

| | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| payments a game | 7.6 | 16.4 | 27.9 | 42.1 |
| bank when charged | $11.0M | $10.1M | $9.3M | $8.7M |
| paid partly in property | 11% | 15% | 19% | 22% |
| property paid a game | $2.6M | $7.8M | $16.8M | $29.2M |
| winner ever paid in property | 18% | 26% | 34% | 39% |
| each loser ever paid in property | 31% | 43% | 57% | 67% |

**Big tables are expensive.** Two-color Rent cards and Birthday charge everyone, so at 5 players
there are more than five times as many payments as at 2, and $29.2M of property changes hands a
game.

**The bank runs dry with more players.** The default banks about $10M before laying properties
down, and at 2 players that's what it has when charged. At 5 it's $8.7M, and one payment in five
costs property. Most losers at 5 players pay in property at least once, and so do 39% of winners:
paying in property hurts, but it doesn't decide the game.

## Opening hands

*From `node scripts/openings.ts`*, each player's wins in 100,000 games of default players, by
what its 5 opening cards were. Each cell is wins in fair shares (1.00 is a fair share), then (in
parentheses) how many hands that was. Rent cards count as actions and wilds as properties.

![Wins in fair shares by how many actions, properties and money cards the opening hand held](charts/openings.svg)

| actions | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 0 | 0.88 (5%) | 0.79 (5%) | 0.74 (5%) | 0.68 (5%) |
| 1 | 0.94 (21%) | 0.90 (21%) | 0.87 (21%) | 0.82 (21%) |
| 2 | 0.99 (35%) | 0.99 (35%) | 0.98 (35%) | 0.97 (35%) |
| 3 | 1.04 (27%) | 1.07 (27%) | 1.09 (27%) | 1.12 (27%) |
| 4 | 1.09 (10%) | 1.15 (10%) | 1.20 (10%) | 1.28 (10%) |
| 5 | 1.09 (1%) | 1.18 (1%) | 1.32 (2%) | 1.37 (2%) |

| properties | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 0 | 0.98 (9%) | 1.05 (9%) | 1.10 (10%) | 1.14 (9%) |
| 1 | 1.00 (30%) | 1.04 (29%) | 1.07 (29%) | 1.09 (30%) |
| 2 | 1.01 (35%) | 1.01 (35%) | 1.00 (35%) | 1.00 (35%) |
| 3 | 1.00 (20%) | 0.95 (20%) | 0.91 (20%) | 0.89 (20%) |
| 4 | 0.95 (6%) | 0.86 (5%) | 0.79 (6%) | 0.73 (5%) |
| 5 | 0.88 (1%) | 0.73 (1%) | 0.71 (1%) | 0.58 (1%) |

| money cards | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 0 | 1.07 (34%) | 1.06 (34%) | 1.06 (34%) | 1.08 (34%) |
| 1 | 1.00 (42%) | 1.00 (42%) | 1.00 (42%) | 1.00 (42%) |
| 2 | 0.93 (19%) | 0.93 (19%) | 0.93 (19%) | 0.91 (19%) |
| 3 | 0.84 (4%) | 0.83 (4%) | 0.84 (4%) | 0.82 (4%) |

**Action cards make a hand.** A hand of four or five action cards wins 1.1 to 1.4 fair shares,
and one with none 0.68 to 0.88. Properties and money are the weak cards to open with.

**The opening hand matters more at big tables.** At 2 players every hand is within 16% of a fair
share; at 5, the best and worst are more than twice apart.

## Rules questions

The rule sheet leaves some rules open, and Hasbro publishes no FAQ to settle them. Fan sites
disagree, and they rarely cite a source. So the engine reads each one way (see `CLAUDE.md`), and
*`node scripts/sensitivity.ts`* plays 100,000 games each way from the same seeds, for each player
count. Each row names the other reading. Each cell gives the share of games whose winner changes,
then the change in the first player's share of wins in points, then the change in turns per game,
then any change in the number of stalled games:

![How often each other reading changes the winner, by player count](charts/readings.svg)

| reading | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| One Double the Rent per Rent card | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 |
| Just Say No on your turn isn't a play (B0965) | 1.8%: +0.0, +0.0 | 3.8%: −0.1, −0.1 | 5.9%: +0.0, −0.1 | 9.0%: −0.1, −0.2 |
| A broken set's house and hotel stay (B0965) | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 |
| A broken set's house and hotel go to the bank | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 |
| Cards past 7 in hand go under the draw pile (B0965) | 0.0%: +0.0, +0.0 | 0.1%: +0.0, +0.0 | 4.7%: +0.1, +0.0 | 18.8%: −0.3, +0.0 |
| All three of B0965's (2014) readings | 1.8%: +0.0, +0.0 | 3.8%: −0.1, −0.1 | 9.5%: +0.1, −0.1 | 23.0%: −0.3, −0.1 |
| Deal Breaker leaves the house and hotel | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 |
| A set of only multicolored wilds is full | 0.3%: +0.0, +0.0 | 1.0%: +0.0, +0.0 | 2.0%: +0.0, +0.0 | 3.3%: +0.0, +0.0 |
| No reshuffle | 0.0%: +0.0, +0.0 | 0.2%: +0.0, +0.2, +119 stalled | 9.7%: −2.1, +11.8, +7073 stalled | 36.2%: −8.1, +48.6, +29352 stalled |

Once a reading changes one play, the rest of the game goes differently, and the winner then
changes about as often as in an unrelated game. So the first number tracks how often the rule
comes up at all.

**None of the readings favors a seat.** That's expected when every player plays the same way. The
one exception is the reshuffle, which changes how long games last.

**The 2014 sheet's readings come up in up to 23% of games at 5 players, and lean nowhere.**
Together they move the first player's share by 0.3 points at most and games by 0.1 turns, which
is why the tables played under them weren't rerun. Just Say No as a play only bites when you
counter a No on your own turn after using all three plays. Discarding past 7 keeps those cards
out of the draw until the next reshuffle, so it comes up mostly at 4 and 5 players, where the
draw pile runs out.

**The three readings about houses and hotels never come up,** because the default player never
builds. They'd matter only for a player that does.

**Wild-only sets come up in 0–3% of games, and Double the Rent stacking almost never.** There are
only 2 multicolored wilds and 2 Double the Rents in the deck, and the default banks a Double the
Rent when there's no rent to double.

**No reshuffle breaks 4- and 5-player games.** At 5 players the draw pile runs out in more than a
third of games. Without a reshuffle, nearly 3 in 10 games end with no winner after 200 turns.
Neither sheet says what happens then, so reshuffling is our house rule.

## Stalled games

**A game stalls when the cards run out of circulation.** In every stalled game we looked at, the
draw pile and the discard pile are both empty, and all 106 cards are in banks, on tables or in
hands. A banked card never comes back, and a full bank holds many action cards. With nothing to
draw, the cards left in hand can't finish anyone's third set, and the game never ends.

**Players who bank their action cards cause it.** Default players alone never stalled in 400,000
games. One pacifist, which banks every action card, stalls 10 games in 100,000 at 4 players and
41 at 5. Without the reshuffle the draw pile empties for good, and nearly 3 in 10 5-player games
stall ("Rules questions").

**A player out to stall the game would, untested:**

- bank every money and action card, and never play an action, since played ones are reshuffled
  back in;
- use all three plays every turn, since cards over the 7-card limit go back to the draw pile;
- lay properties down without completing sets, since properties can't be banked;
- spend Just Say No on any steal that would complete someone's set, and pay with money before
  property, never with a property that finishes someone's set;
- play at 5 players, where the draw pile already runs out in more than a third of games.

## Next

`TODO.md` has what's left: closing more of the gap to playouts, and logging real games to compare
with the model.
