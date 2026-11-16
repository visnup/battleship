# Monopoly Deal

Monopoly Deal is Hasbro's card game of Monopoly: 106 cards, no board, no dice, and games that
last fifteen minutes. You bank money, lay down properties and charge rent like the board game,
but most of the cards are actions that take from other players: Sly Deal steals a property, Deal
Breaker steals a whole set, and Just Say No stops either. The first player with three full sets
wins.

This repo is a simulator of the game. It plays millions of games by the rules, so it can answer
the questions that come up at the table: whether going first matters, which cards are worth
keeping, which sets to chase, whether to build houses, and when to lay your properties down.

The answers come from the model, not from real tables. It follows the rule sheet of the 2014 US
edition (B0965), and the rules the sheet leaves open are measured both ways (see "Rules
questions"). It hasn't been checked against logged real games yet.

The simulator and this analysis were written with Claude, working in Claude Code throughout.

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
sets of different colors win. When the draw pile runs out, the cards played are shuffled into a
new one.

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

**Stalled** games are ones with no winner after 1,000 turns. They count as a win for no one.

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
| 2 | 56.8% | 43.2% | | | | 16.3 | 0.0% |
| 3 | 37.2% | 32.2% | 30.6% | | | 20.6 | 0.1% |
| 4 | 28.1% | 24.6% | 24.1% | 23.2% | | 24.4 | 6.4% |
| 5 | 22.1% | 20.1% | 19.5% | 18.9% | 19.4% | 27.5 | 27.8% |

**Going first is worth 13.6 points at 2 players.** That's 31% more wins than the second player.
At 5 players the edge is 2.1 points over a fair share. The first player starts drawing and
playing a turn ahead, and in a 16-turn 2-player game, that turn matters more.

**A game lasts about 8 rounds at 2 players and 5 to 6 at 5.** A round is a turn for each player.

**The draw pile runs out in more than a quarter of 5-player games.** It holds 106 − 5 × 5 = 81
cards after the deal. It almost never runs out at 2 or 3 players.

## Which strategy wins

*From `node scripts/strategies.ts`*, which seats one player of each strategy in
`src/strategies.ts` against the default player in every other seat, rotating seats. Playouts are
slow, so they play 10,000 games per cell, which is good to about ±1 point.

![Each strategy's wins in fair shares, by player count](charts/strategies.svg)

| strategy | 2 players (fair 50.0%) | 3 players (fair 33.3%) | 4 players (fair 25.0%) | 5 players (fair 20.0%) |
| --- | --- | --- | --- | --- |
| default | 49.9% | 33.3% | 25.0% | 20.0% |
| builder | 40.1% | 22.3% | 15.6% | 12.5% |
| banker | 49.9% | 33.3% | 25.4% | 20.4% |
| pacifist | 11.9% | 2.0% (2 stalled) | 0.3% (2 stalled) | 0.0% (9 stalled) |
| random | 7.4% | 2.1% | 0.9% | 0.4% |
| playouts | 62.1% | 51.1% | 46.5% | 43.2% |
| quick playouts | 54.9% | 43.5% | 40.6% | 37.9% |

**Builder** plays the way the default player first did. It lays down properties as soon as it
draws them, builds houses and hotels, and only then charges rent. It wins 10 points less than the
default at 2 players, and more than a third fewer games at 5. "Playing well" breaks that gap down.

**Banker** banks $10M before anything else. That's now about the same as the default, which
already banks its money before laying properties down.

**Pacifist** never takes from anyone and banks every action card. It almost never wins: this is a
game of taking.

**Random** plays a legal move at random. It's the floor.

**Playouts** plays out every legal move on up to 80 deals before each play and makes the move that
wins most. For each deal it reshuffles the cards it can't see, the other hands and the draw pile,
so it doesn't peek. Each deal stops after two rounds, and the board decides: a fitted chance to
win from full sets, progress toward more, money and cards in hand (`scripts/chance.ts`). That's
faster than playing to the end, and better: playing to the end, it won 50.3%, 39.5%, 36.4% and
33.7%. It wins 12 to 23 points more than the default, so there is still a lot to find.

**Quick playouts** plays out each move on 16 deals, one round each. It's about 5 times faster
than playouts (the row took 4 minutes on 20 cores, against 21) and still wins 5 to 18 points more
than the default: a strong opponent that's cheap enough to play against.

**Skill counts for more at big tables.** Against the default, playouts win 1.24 fair shares at
2 players and 2.16 at 5. At 2 players the weaker player still wins nearly 4 games in 10; at 5,
the four default players together win only 57%.

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
| the builder | 40.1% | 12.5% |
| lay down properties before charging (previous) | 42.0% | 14.0% |
| lay down properties before banking (previous) | 44.4% | 16.0% |
| build houses and hotels, never bank them (previous) | 46.5% | 17.9% |
| Deal Breaker refuses when the best set is a color it has (previous) | 49.5% | 19.4% |
| build, else bank them | 49.7% | 19.8% |
| Pass Go only as the last play | 46.6% | 16.9% |
| bank Pass Go | 34.6% | 12.7% |
| Deal Breaker before Pass Go | 49.9% | 20.2% |
| Debt Collector on the richest (previous) | 49.9% | 18.3% |
| any-color Rent on the richest (previous) | 49.9% | 17.0% |
| bank all money before laying down properties (previous) | 48.9% | 19.6% |
| Debt Collector on the most money banked | 49.9% | 18.2% |
| any-color Rent on the most money banked | 49.9% | 16.8% |
| lay down wilds before charging | 49.0% | 19.3% |
| any-color Rent and Debt Collector on the leader (previous) | 49.9% | 17.6% |
| any-color Rent and Debt Collector on the most paid in property | 49.9% | 20.0% |
| any-color Rent on the least banked | 49.9% | 19.4% |
| hold the card that completes a set unless it wins | 35.8% | 17.4% |
| Just Say No only against Deal Breaker | 48.4% | 19.3% |
| keep one Just Say No for a Deal Breaker | 49.1% | 19.5% |
| keep two Just Say Nos for a Deal Breaker | 48.5% | 19.3% |
| lay down properties once $5M is banked | 49.5% | 19.0% |
| lay down properties once $15M is banked | 49.8% | 20.2% |

**Charge before you lay properties down, and bank before that too.** This is the biggest lesson,
worth 8 points at 2 players and 6 at 5. A property laid down can be taken by Sly Deal, Forced Deal
or as payment. One held in hand can't, and it can go down later in a single turn. The default
still lays a property down right away when it completes a set.

**Don't build.** Banking a house ($3M) or hotel ($4M) as money beats putting it on a set. Never
banking them costs 3.4 points at 2 players. Building when you can and banking otherwise is no
better than never building. A house adds $3M to one rent card's charge, but the play spent placing
it could have charged rent itself. A set with a house is also the first thing a Deal Breaker
takes.

**Charge one player who has to pay in property.** The any-color Rent and Debt Collector hit one
player. Aim them at someone whose bank can't cover the charge but whose table can, since the
properties they pay with come to you. Among those, pick whoever pays the most, then the leader,
the player with the most full sets. Aiming both at the leader instead costs 2.4 points at 5
players, and aiming them at whoever has the most to pay with costs more. At 2 players there's
only one target. At 5 players, playouts at each any-color Rent found this rule gaining 8 points
each time it chose differently from aiming at the leader, more than any other rule tried: the
least banked, the richest, the next or previous seat, the most or fewest cards in hand, and others.

**Don't save Pass Go.** Playing it first, while plays are left to use what it draws, beats holding
it for the last play by 3 points at 2 players. Banking it costs 15.

**Bank about $10M, then lay properties down before banking more.** This beats banking everything
first by 1 point at 2 players, and is even at 5. $5M is too little, and $15M is about the same as
$10M.

**Two pieces of table advice lose.** Players online say to hold the property that completes a
set, so a Deal Breaker can't take the set, and to keep a Just Say No for a Deal Breaker instead
of spending it on rent. Holding the card costs 14 points at 2 players and 3 at 5: a set in hand
charges no rent and counts toward no win. Keeping a Just Say No, even only while holding two,
costs 0.5 to 1.3 points at every player count (3 and 4 players: 32.0% and 23.9%, against 33.2%
and 25.0%). What you lose by paying now is worth more than the Deal Breaker it might stop later.

**Deal Breaker had a bug.** It sorted sets of a color it already had first, then refused them, so
it often skipped a better target. Fixing it was worth about half a point.

Tried and rejected, besides the alternatives in the table (at 2 and 5 players, against 49.9% and
20.0% for the default):

- Choosing which property to lay down first: by the most progress toward a set, the least, wilds
  first, the cheapest, the dearest, the highest rent or the smallest set. All were within noise
  of taking the first one in hand, the one held longest, or worse (wilds first: 19.4% at 5
  players). The most progress first with wilds last gains 0.4 points at 2 players, but 0.2 at 3
  and −0.2 at 5 (400,000 games each).
- Laying down a property of a color a Rent card in hand charges, then charging: 49.4% and 19.3%.
- Laying down properties before Debt Collector and Birthday: 46.1% and 16.2%.

**What's left of the placement gap has no pattern.** At 5 players, `decisions.ts` finds playouts
laying a property down before charging rent, Debt Collector or Birthday in some spots, and the
default's choice of rent first or ending the turn winning in others. No rule that splits them
beat the default.

### How good could the choices be?

Playouts still beat the default by 12 to 23 points. What's left at 5 players, found with
playouts that play each deal to the end:

- **Forced Deal.** At 5 players, the best Forced Deal by playouts, rechecked on fresh deals, beats
  the default's by 4.6 points each time they differ, or 1.6 points a game. Most of that is taking
  a different card, often from a different player. But no rule for it beat the default: taking
  from the leader, the dearest card, wilds first, what the victim is closest to finishing, giving
  the cheapest card or what helps the victim least, giving wilds too, swapping on a tie, on any
  swap or only on a clear gain, or playing it before rent. Each was scored by playouts at the same
  decisions. None beat the default beyond the noise, and some, like taking the dearest, did
  worse. Playouts that stop after two rounds find more: at 5 players they play a Forced Deal
  where the default plays something else worth about 7 points a game. But playing it whenever it
  can, before rent, or giving wilds too, each lost 0.1 to 1.1 points head to head at 2 to 5
  players (`variants.ts`). Which swap matters, not how often. Picking the swap that most raises
  `chance`, the board score playouts end on, loses too: 48.1% and 19.0% at 2 and 5 players, or
  49.1% and 19.3% only when it raises it. So does picking Sly Deal by it (49.5%, 19.4%). Deal
  Breaker by it ties the default (49.9%, 20.1%).
- **The any-color Rent.** Aiming it at whoever has to pay in property closed most of its gap. The
  best move by playouts now gains at most 2.5 points where they differ, and that's an overstated
  estimate.

Untouched so far: when to hold Just Say No, and what to pay with.

## What each card is worth

*From `node scripts/cards.ts`*, which deals each game twice: once as dealt, and once with one copy
of a card moved from the draw pile into one player's opening hand. The difference in that player's
wins is the card's value, in points. The noise is about ±0.5 points, and $M is what the card is
worth as money. Sorted by 4 players:

![Each card's value in points, by player count](charts/cards.svg)

| card | $M | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- | --- |
| Deal Breaker | 5 | +28.7 | +26.2 | +21.2 | +15.9 |
| Rent, dark blue/green | 1 | +3.3 | +5.6 | +7.6 | +8.7 |
| Just Say No | 4 | +12.8 | +10.2 | +7.1 | +4.8 |
| Property Wild, any color | 0 | +10.5 | +8.6 | +6.4 | +5.2 |
| It's My Birthday | 2 | +4.6 | +5.8 | +6.2 | +6.4 |
| Rent, red/yellow | 1 | +2.3 | +4.0 | +6.1 | +6.4 |
| Rent, any color | 3 | +4.9 | +5.5 | +5.0 | +4.1 |
| Rent, pink/orange | 1 | +0.7 | +3.6 | +4.6 | +5.4 |
| Rent, light blue/brown | 1 | +0.2 | +3.2 | +4.6 | +4.8 |
| Rent, railroad/utility | 1 | −0.0 | +3.1 | +4.4 | +5.0 |
| Debt Collector | 3 | +9.0 | +5.3 | +4.1 | +2.7 |
| Property Wild, dark blue/green | 4 | +7.0 | +5.7 | +3.7 | +2.4 |
| dark blue | 4 | +5.9 | +4.4 | +2.9 | +1.9 |
| Pass Go | 1 | +5.5 | +3.8 | +2.8 | +1.3 |
| Property Wild, railroad/utility | 2 | +4.3 | +3.4 | +2.7 | +1.7 |
| Property Wild, light blue/brown | 1 | +4.9 | +4.1 | +2.6 | +2.1 |
| Property Wild, red/yellow | 3 | +4.1 | +3.4 | +2.3 | +1.2 |
| $5M | 5 | +2.1 | +2.9 | +2.3 | +1.3 |
| Property Wild, pink/orange | 2 | +3.7 | +2.7 | +2.0 | +1.5 |
| utility | 2 | +3.7 | +2.8 | +1.9 | +1.1 |
| $4M | 4 | +1.4 | +2.3 | +1.9 | +0.8 |
| brown | 1 | +3.5 | +2.7 | +1.8 | +1.2 |
| Sly Deal | 3 | +8.0 | +3.2 | +1.7 | +0.4 |
| $2M | 2 | +1.0 | +1.7 | +1.6 | +0.6 |
| $3M | 3 | +0.8 | +1.8 | +1.5 | +0.9 |
| House | 3 | +1.3 | +1.7 | +1.5 | +0.9 |
| Hotel | 4 | +1.4 | +2.2 | +1.5 | +0.8 |
| Property Wild, green/railroad | 4 | +3.4 | +2.2 | +1.2 | +0.6 |
| Property Wild, light blue/railroad | 4 | +2.7 | +1.9 | +1.0 | +0.5 |
| yellow | 3 | +2.5 | +1.6 | +0.9 | +0.3 |
| $10M | 10 | +2.1 | +1.2 | +0.9 | +0.1 |
| red | 3 | +2.6 | +1.5 | +0.6 | +0.1 |
| orange | 2 | +2.1 | +1.3 | +0.6 | −0.0 |
| green | 4 | +2.4 | +1.4 | +0.6 | +0.2 |
| $1M | 1 | −0.3 | +0.8 | +0.5 | +0.0 |
| Double the Rent | 1 | +1.0 | +0.5 | +0.3 | +0.5 |
| Forced Deal | 3 | +3.2 | +1.0 | +0.3 | −0.2 |
| pink | 2 | +1.7 | +0.9 | +0.2 | +0.2 |
| light blue | 1 | +1.6 | +1.0 | +0.2 | −0.1 |
| railroad | 2 | +1.2 | +0.3 | −0.5 | −0.6 |

**Deal Breaker is worth the most by far.** With it, a 2-player game goes from a coin flip to 79%
for the holder. It's a third of a win, taken from someone else.

**Two-color Rent cards gain value with more players**, from 0 to +3 at 2 players to +5 to +9 at 5.
Each one charges every other player, so it collects more the more players there are. The one for
the most expensive colors, dark blue and green, is the second most valuable card at 4 and 5
players. Yet each is worth just $1M as money.

**Cards that hit one player lose value with more players.** Just Say No, Debt Collector and Sly
Deal are each worth far more at 2 players, where the one player they hit is the only opponent.

**Money is worth little**, never more than 2.9 points, and $10M is worth barely more than $1M. One
more card of money mostly sits in the bank as insurance against rent.

**The two multicolored Property Wilds are worth nothing as money, but they're among the most
valuable cards** at 2 and 3 players. They fit any set.

**Of the properties, dark blue, brown and utility are worth most.** They're the 2-card sets. Light
blue, pink and railroad are worth least.

A card worth nothing or less, like Forced Deal or a railroad at 5 players, shows where the
default player misplays it, not that you'd be better off without it.

### Played or banked

The same deals again, with the extra action or Rent card banked on the player's first play
instead. Each cell is the card's value banked, then (in parentheses) played as the default plays
it:

![Each action card's value played and banked, at 2 and 5 players](charts/used.svg)

| card | $M | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- | --- |
| Deal Breaker | 5 | +2.8 (+28.7) | +3.3 (+26.2) | +2.6 (+21.2) | +1.6 (+15.9) |
| Rent, dark blue/green | 1 | −0.2 (+3.3) | +1.1 (+5.6) | +1.2 (+7.6) | +0.7 (+8.7) |
| Just Say No | 4 | +1.3 (+12.8) | +2.1 (+10.2) | +1.7 (+7.1) | +1.0 (+4.8) |
| It's My Birthday | 2 | +0.6 (+4.6) | +1.7 (+5.8) | +1.8 (+6.2) | +1.0 (+6.4) |
| Rent, red/yellow | 1 | −0.1 (+2.3) | +1.0 (+4.0) | +1.1 (+6.1) | +0.7 (+6.4) |
| Rent, any color | 3 | +1.0 (+4.9) | +1.9 (+5.5) | +1.9 (+5.0) | +1.7 (+4.1) |
| Rent, pink/orange | 1 | −0.0 (+0.7) | +1.5 (+3.6) | +0.7 (+4.6) | +0.4 (+5.4) |
| Rent, light blue/brown | 1 | −0.1 (+0.2) | +0.8 (+3.2) | +1.2 (+4.6) | +0.2 (+4.8) |
| Rent, railroad/utility | 1 | −0.2 (−0.0) | +1.2 (+3.1) | +0.8 (+4.4) | +0.7 (+5.0) |
| Debt Collector | 3 | +1.1 (+9.0) | +1.8 (+5.3) | +1.5 (+4.1) | +1.2 (+2.7) |
| Pass Go | 1 | +0.1 (+5.5) | +2.0 (+3.8) | +1.0 (+2.8) | +0.9 (+1.3) |
| Sly Deal | 3 | +1.2 (+8.0) | +2.0 (+3.2) | +1.8 (+1.7) | +1.1 (+0.4) |
| House | 3 | +1.4 (+1.3) | +1.9 (+1.7) | +1.8 (+1.5) | +1.1 (+0.9) |
| Hotel | 4 | +1.7 (+1.4) | +2.6 (+2.2) | +1.8 (+1.5) | +1.3 (+0.8) |
| Double the Rent | 1 | +0.2 (+1.0) | +1.2 (+0.5) | +0.5 (+0.3) | +0.4 (+0.5) |
| Forced Deal | 3 | +1.2 (+3.2) | +2.1 (+1.0) | +1.9 (+0.3) | +1.4 (−0.2) |

**Play your action cards; don't bank them.** Banked on the first play, none is worth more than
3.3 points, about what money is. Played, Deal Breaker is worth ten times that, and most Rent
cards several times. A Rent card's $1M is the least of it.

**Except Forced Deal, early, at 3 or more players.** It's worth more banked on the first play
than as the default plays it. Banking every Forced Deal still loses, 1.1 points at 5 players and
3 at 2 (`variants.ts`). Banking one only in the first round gains 0.35 to 0.4 points at 3 to 5
players and loses 0.3 at 2 (400,000 games). Sly Deal at 5 players is the same story, but
banking every Sly Deal loses 2 to 7 points.

Houses and hotels come out the same either way: the default banks them already.

## Which colors to chase

*From `node scripts/colors.ts`*, which counts, at the end of each game, the colors of the winner's
full sets and of the losers'. A winner has exactly 3 sets, so the shares in a column add up to
300%. The winner's share comes first, then in parentheses how often a loser holds that color as a
full set at the end.

![How often each color is a full set at the end: bars for the winner, ticks for a loser](charts/colors.svg)

| color | cards in a set | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- | --- |
| dark blue | 2 | 49% (12%) | 52% (12%) | 53% (11%) | 55% (9%) |
| brown | 2 | 49% (15%) | 49% (15%) | 49% (14%) | 49% (12%) |
| utility | 2 | 45% (14%) | 45% (15%) | 45% (14%) | 45% (12%) |
| pink | 3 | 27% (7%) | 27% (7%) | 27% (6%) | 27% (5%) |
| red | 3 | 26% (7%) | 26% (7%) | 26% (6%) | 26% (5%) |
| light blue | 3 | 24% (6%) | 24% (6%) | 25% (6%) | 25% (5%) |
| orange | 3 | 23% (6%) | 22% (6%) | 23% (5%) | 23% (4%) |
| green | 3 | 23% (6%) | 23% (6%) | 23% (5%) | 23% (4%) |
| yellow | 3 | 22% (6%) | 22% (6%) | 21% (5%) | 22% (4%) |
| railroad | 4 | 13% (4%) | 12% (3%) | 12% (3%) | 12% (2%) |

**Each 2-card set, dark blue, brown and utility, is in about half of all wins.** That's about twice
as often as any 3-card set.

**Railroads, the one 4-card set, are in only one win in eight.**

**Dark blue rises to 55% at 5 players.** It's a 2-card set and charges the highest rent, 8. So
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
| 1 | 100%: 64% (36%) | 100%: 47% (24%) | 100%: 37% (18%) | 100%: 32% (13%) |
| 2 | 100%: 68% (32%) | 100%: 52% (21%) | 100%: 43% (14%) | 100%: 39% (10%) |
| 3 | 100%: 72% (28%) | 100%: 58% (16%) | 99%: 51% (10%) | 98%: 48% (6%) |
| 4 | 99%: 76% (24%) | 97%: 64% (13%) | 94%: 58% (7%) | 88%: 55% (3%) |
| 5 | 94%: 79% (21%) | 87%: 67% (10%) | 77%: 61% (5%) | 64%: 57% (2%) |
| 6 | 84%: 80% (20%) | 67%: 68% (9%) | 50%: 60% (4%) | 32%: 54% (2%) |
| 7 | 67%: 80% (20%) | 43%: 66% (8%) | 23%: 57% (4%) | 8%: 50% (2%) |
| 8 | 47%: 79% (21%) | 21%: 63% (9%) | 7%: 52% (5%) | 1%: 51% (1%) |

**Nothing is decided early.** After three rounds the player ahead wins 72% of 2-player games and
48% at 5, where a fair share is 20%. Whoever is furthest behind still wins 28% at 2 players and
6% at 5.

**Comebacks run out at big tables.** At 2 players, the player behind after round 5 still wins
one game in five, as often as after round 8. At 5 players it's 2%: four others can take from
the leader, but the last player rarely catches all of them.

**The lead stops growing after round 5 or so.** Games still going then are the close ones, so
being ahead says less. At 5 players two thirds of games are over by round 6.

## Paying

*From `node scripts/payments.ts`*, every payment in 100,000 games of default players each:

![How often payments cost property, and how many players ever pay in property, by player count](charts/paying.svg)

| | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| payments a game | 6.6 | 16.0 | 26.7 | 39.8 |
| bank when charged | $10.9M | $8.9M | $8.0M | $7.5M |
| paid partly in property | 14% | 19% | 22% | 24% |
| property paid a game | $3.2M | $10.1M | $19.6M | $31.5M |
| winner ever paid in property | 19% | 32% | 39% | 43% |
| each loser ever paid in property | 36% | 52% | 63% | 72% |

**Big tables are expensive.** Two-color Rent cards and Birthday charge everyone, so at 5 players
there are six times as many payments as at 2, and $31.5M of property changes hands a game.

**The bank runs dry with more players.** The default banks about $10M before laying properties
down, and at 2 players that's what it has when charged. At 5 it's $7.5M, and one payment in four
costs property. Most losers at 5 players pay in property at least once, and so do 43% of winners:
paying in property hurts, but it doesn't decide the game.

## Opening hands

*From `node scripts/openings.ts`*, each player's wins in 100,000 games of default players, by
what its 5 opening cards were. Each cell is wins in fair shares (1.00 is a fair share), then (in
parentheses) how many hands that was. Rent cards count as actions and wilds as properties.

![Wins in fair shares by how many actions, properties and money cards the opening hand held](charts/openings.svg)

| actions | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 0 | 0.87 (5%) | 0.77 (5%) | 0.71 (5%) | 0.67 (5%) |
| 1 | 0.93 (21%) | 0.88 (21%) | 0.84 (21%) | 0.82 (21%) |
| 2 | 0.99 (35%) | 0.99 (35%) | 0.97 (35%) | 0.96 (35%) |
| 3 | 1.05 (27%) | 1.07 (27%) | 1.10 (27%) | 1.12 (27%) |
| 4 | 1.10 (10%) | 1.17 (10%) | 1.24 (10%) | 1.28 (10%) |
| 5 | 1.14 (1%) | 1.27 (1%) | 1.32 (2%) | 1.41 (2%) |

| properties | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 0 | 1.00 (9%) | 1.09 (9%) | 1.13 (10%) | 1.17 (9%) |
| 1 | 1.01 (30%) | 1.04 (29%) | 1.08 (29%) | 1.09 (30%) |
| 2 | 1.01 (35%) | 1.01 (35%) | 1.00 (35%) | 0.99 (35%) |
| 3 | 0.99 (20%) | 0.94 (20%) | 0.90 (20%) | 0.89 (20%) |
| 4 | 0.95 (6%) | 0.84 (5%) | 0.78 (6%) | 0.74 (5%) |
| 5 | 0.84 (1%) | 0.74 (1%) | 0.66 (1%) | 0.61 (1%) |

| money cards | 2 players | 3 players | 4 players | 5 players |
| --- | --- | --- | --- | --- |
| 0 | 1.07 (34%) | 1.07 (34%) | 1.07 (34%) | 1.08 (34%) |
| 1 | 0.99 (42%) | 1.00 (42%) | 0.99 (42%) | 1.00 (42%) |
| 2 | 0.93 (19%) | 0.93 (19%) | 0.92 (19%) | 0.90 (19%) |
| 3 | 0.85 (4%) | 0.86 (4%) | 0.84 (4%) | 0.82 (4%) |

**Action cards make a hand.** A hand of four or five action cards wins 1.1 to 1.4 fair shares,
and one with none 0.67 to 0.87. Properties and money are the weak cards to open with.

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
| One Double the Rent per Rent card | 0.2%: +0.0, +0.0 | 0.4%: +0.0, +0.0 | 0.6%: +0.0, +0.0 | 0.6%: +0.0, +0.0 |
| Just Say No on your turn is a play | 1.2%: +0.0, +0.0 | 3.4%: +0.0, +0.1 | 5.5%: +0.0, +0.1 | 8.0%: +0.0, +0.1 |
| A broken set's house and hotel go to the bank | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 |
| Deal Breaker leaves the house and hotel | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 | 0.0%: +0.0, +0.0 |
| A set of only multicolored wilds is full | 0.3%: +0.0, +0.0 | 1.0%: +0.0, +0.0 | 2.0%: +0.0, +0.0 | 3.0%: +0.0, +0.0 |
| No reshuffle | 0.0%: +0.0, +0.0 | 0.1%: +0.0, +0.4, +38 stalled | 4.5%: −0.7, +30.6, +3170 stalled | 21.8%: −2.8, +160.9, +16671 stalled |

Once a reading changes one play, the rest of the game goes differently, and the winner then
changes about as often as in an unrelated game. So the first number tracks how often the rule
comes up at all.

**None of the readings favors a seat.** That's expected when every player plays the same way. The
one exception is the reshuffle, which changes how long games last.

**Just Say No as a play comes up most,** in up to 8% of games at 5 players. It only bites when you
counter a No on your own turn after using all three plays.

**The two readings about houses and hotels never come up,** because the default player never
builds. They'd matter only for a player that does.

**Double the Rent stacking and wild-only sets come up in 0–3% of games.** There are only 2 Double
the Rents and 2 multicolored wilds in the deck.

**No reshuffle breaks 4- and 5-player games.** At 5 players the draw pile runs out in more than a
quarter of games. Without a reshuffle, a sixth of all games end with no winner after 1,000 turns. A
no-reshuffle house rule needs its own ending.

## Next

`TODO.md` has what's left: closing more of the gap to playouts, and logging real games to compare
with the model.
