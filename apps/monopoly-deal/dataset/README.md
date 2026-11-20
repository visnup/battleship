---
license: mit
pretty_name: Monopoly Deal move values
tags:
  - games
  - card-games
  - reinforcement-learning
  - imperfect-information
size_categories:
  - 1M<n<10M
configs:
  - config_name: all
    data_files: data/*.parquet
    default: true
  - config_name: 2p
    data_files: data/2p.parquet
  - config_name: 3p
    data_files: data/3p.parquet
  - config_name: 4p
    data_files: data/4p.parquet
  - config_name: 5p
    data_files: data/5p.parquet
---

# Monopoly Deal move values

Every decision about what to play next in 40,000 simulated games of Monopoly Deal, 10,000 at
each of 2 to 5 players: 2,680,192 decisions, from 471,782 at 2 players to 847,687 at 5. Each
row has what the player to move can see, every legal move, each move's estimated chance of
winning, the simulator's hand-written player's pick, and whether the player to move went on to
win.

The games, rules and estimates come from [a simulator](https://github.com/visnup/monopoly-deal)
of the 2014 US edition (B0965). `scripts/dataset.ts` there regenerates a dataset like this one, now under the 2023 sheet's (G0351) readings: Just Say No is a play, and overflow goes on the discard pile. `game_seed` replays a game only under the rules it was played by.

The simulator, its analysis and this card were written with Claude Opus 5.5 at medium effort,
working in Claude Code throughout.

For example, how often the default player's pick is the best-valued move, with DuckDB:

```sql
select players, avg((moves[pick + 1].value = list_max(list_transform(moves, lambda m: m.value)))::int) agrees
from 'hf://datasets/visnup/monopoly-deal/data/*.parquet'
group by players order by players;
```

## How the values were made

All seats in every game are played by the simulator's default player, a list of hand-written
rules. At each of its decisions with more than one legal move, every move is played out on the
same 32 deals:

1. The cards the mover can't see (the other hands and the draw pile) are shuffled and dealt
   again.
2. The move is made, then every seat plays like the default player for two full rounds.
3. The board is scored by `chance`, a softmax over players of 15 weighted board features,
   fitted to how default-player games end. A game that ends sooner scores 1 for a win and 0
   for a loss.

`value` is the mean of the 32 scores and `se` its standard error. The 32 deals are shared by
every move of a decision, so the difference between two moves is less noisy than their `se`s
suggest. In the simulator, picking the move with the highest value this way (with up to 80 deals)
beats the default player by 9 to 19 points.

The values are estimates for a particular rollout player and scoring function, not the game's
true values. They're good at ranking moves within one decision, but they don't judge the
default player's style of play from outside it.

## Fields

| field | type | meaning |
| --- | --- | --- |
| `game` | string | game id, `{players}p-{chunk}-{index}` |
| `game_seed` | uint32 | the seed the simulator dealt this game from |
| `players` | int | 2 to 5 |
| `seat` | int | the mover's seat (0 to players − 1) |
| `turn` | int | turns played in the game so far, this one included |
| `plays_left` | int | plays left this turn, 1 to 3 |
| `hand` | list of card | the mover's hand |
| `table` | list of player | every player, starting with the mover, in turn order |
| `table[].hand_size` | int | cards in hand |
| `table[].bank` | list of card | the bank, face up |
| `table[].props` | list of {card, color} | properties and wilds on the table, with the color each counts as |
| `table[].built` | list of {card, color} | houses and hotels, with the set they're on |
| `draw_size` | int | cards left in the draw pile |
| `pile` | list of card | the play pile: action, Rent and Just Say No cards played since the last reshuffle, oldest first |
| `moves` | list of move | every legal move, ending the turn first |
| `moves[].type` | string | `end`, `bank`, `place`, `rent` or `action` |
| `moves[].card` | card | the card played |
| `moves[].color` | string | the color placed as, rented, or the set a Deal Breaker takes |
| `moves[].target` | int | for one-player actions, the seat counted from the mover (1 is next) |
| `moves[].doubles` | int | Double the Rents played on a Rent card |
| `moves[].take`, `give` | {card, color} | for Sly Deal and Forced Deal |
| `moves[].value` | float | estimated chance of winning after this move |
| `moves[].se` | float | standard error of `value` |
| `pick` | int | index into `moves` of the default player's pick |
| `won` | bool | whether the mover won; null if the game stalled (no winner after 200 turns) |

Properties are listed by color, so the duplicate copies of a card are interchangeable. Identical
moves are listed once. A wild's color when placed doesn't matter: the simulator moves wilds to
their best color after every play.

## Cards

A card is a string:

- Money: `$1M` ×6, `$2M` ×5, `$3M` ×3, `$4M` ×3, `$5M` ×2, `$10M` ×1.
- Properties, by color: `brown` ×2 ($1M), `lightBlue` ×3 ($1M), `pink` ×3 ($2M), `orange` ×3
  ($2M), `red` ×3 ($3M), `yellow` ×3 ($3M), `green` ×3 ($4M), `darkBlue` ×2 ($4M), `railroad`
  ×4 ($2M), `utility` ×2 ($2M).
- Wilds: `wild(lightBlue/brown)` ($1M), `wild(lightBlue/railroad)` ($4M), `wild(pink/orange)` ×2
  ($2M), `wild(red/yellow)` ×2 ($3M), `wild(darkBlue/green)` ($4M), `wild(green/railroad)`
  ($4M), `wild(railroad/utility)` ($2M), `wild(any)` ×2 ($0, can't pay).
- Rents: `rent(lightBlue/brown)`, `rent(pink/orange)`, `rent(red/yellow)`,
  `rent(darkBlue/green)`, `rent(railroad/utility)`, ×2 each ($1M), charging every other
  player; `rent(any)` ×3 ($3M), charging one.
- Actions: `dealBreaker` ×2 ($5M), `justSayNo` ×3 ($4M), `slyDeal` ×3, `forcedDeal` ×3,
  `debtCollector` ×3 ($3M each), `birthday` ×3 ($2M), `doubleRent` ×2 ($1M), `house` ×3 ($3M),
  `hotel` ×2 ($4M), `passGo` ×10 ($1M).

## Rules

The sheet's rules, with its open questions read as follows: Just Say No isn't a play; two Double
the Rents can go on one Rent card; Deal Breaker takes the set's house and hotel; a set of only
`wild(any)` isn't full; the play pile is reshuffled into a new draw pile when it runs out;
overflow past 7 cards goes to the bottom of the draw pile.

## Rounds

`rounds/rN.tar.zst` are later passes of the same kind, made 2026-11-17 to 19 to train the
simulator's learned player: each a zstd-compressed tar of JSONL shards,
`data-rN/{players}p-{chunk}.jsonl`, 256 a player count. They aren't part of the configs above.
Rows have the fields above, except that the default player's pick is `default`, not `pick`.
From round 1 a learned player of an earlier round plays the games, and from round 2 `moves`
holds only the moves played out: that player's top few, the default's pick and one other at
random. The simulator changed between rounds (the default player's rules, `chance`'s weights,
and the 2014 sheet's readings for the 2023 one's), so a round's values aren't comparable with
another's, and `game_seed` replays a game only at the commit it was made with.

| round | games a player count | moves played out | deals | inside the playouts |
| --- | --- | --- | --- | --- |
| r0 | 10,000, by the default player | all | 32 | the default player |
| r1 | 10,000 | all | 32 | the default player |
| r2 | 2,500 | top 6 | 32 | the default player |
| r3 | 5,000 | top 6 | 32 | the default player, everyone paying by a learned model |
| r4a | 5,000 | top 6 | 32 | the default player, the mover paying by a learned model |
| r4b | 10,000 | top 6 | 16 | as r4a |
| r4c | 10,000, half their decisions | top 6 | 32 | as r4a |
| r5 | 10,000 | top 6 | 16 | as r4a, with a newer default player |
| r6 | 10,000 | top 6 | 16 | the default player, the mover paying, saying no and discarding by learned models |
| r7 | 5,000, half their decisions | top 4 | 8 | a learned player in every seat (1,000 trees) |
| r8 | 10,000, half their decisions | top 4 | 4 | a learned player in every seat (200 trees) |

Fewer deals make each value noisier: `se` is about 0.03 on 32 deals and 0.09 on 4. Rounds 7
and 8 ask a different question from the rest, which move is best if good players play on, and
are what improved the learned player against other learned players.

## Not included

- Decisions other than what to play: what to pay with, when to Just Say No, and what to
  discard. The default player makes those.
- Hidden cards: the other hands and the draw pile's order. `game_seed` recovers them.
- Games among stronger players, in `data/`: every state there comes from default-player games.
  The rounds have them.
