# TODO

## Check the model

- [x] An engine: deal, battles, the fate cards, rounds and redeals, a heuristic player (`game.ts`).
- [x] Tests of the booklet's rules (`game.test.ts`).
- [x] Whole-game strategies head to head (`strategies.ts`).
- [x] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`), 2026-11-18: nine
      rounds. Against the first default, 32-deal playouts won 84% at 3 players and 76% at 6;
      against the ninth, 63.9% and 40.5%. Rules cycle (wait, then open, then wait), so from
      round five a rule had to win against the league of earlier defaults too.
- [x] Racing playouts (drop a move 2 standard errors behind): 128 deals in 0.6× the time, about
      a point weaker.
- [x] Recheck the adopted rules against strong players (`variants.ts --field playouts`): two are
      bets on how the others play (deny, wait), the rest hold up.
- [x] The Favor holder's chip choice and the discard on passing, played out (`colorPlayouts`,
      `dumpPlayouts`), 2026-11-19: both rules are within half a point of playouts on 32 deals.
- [ ] Remember what's been played: `game.pile` holds every face-up card since the deal, but
      playouts deal the hidden cards from everything unseen, which already accounts for it.
      A player that reads others' likely hands from what they've played and passed on.
- [x] Learn a move scorer from playouts, as in monopoly-deal (`dataset.ts`, `learn.py`,
      `learned.ts`), 2026-11-19: 74.7% at 3 players and 50.3% at 6 against the default, as good
      as 128-deal playouts. Round 1 (the learned player's games) +3 to +5 against round 0's
      players, adopted as `src/model.json`; round 2 ties.
- [x] Labels from learned players inside the playouts (`dataset.ts --rollout`), 25× the cost
      a decision, 3,000 games a player count on 16 deals, about 35 minutes a round. Round 3
      beats rounds 0–1's players by 12 to 20 points (and wins less against the default); each
      round after is fit to every round's games from round 3 on: round 4 beats round 3's by 11
      to 20; round 5 beats round 4's by 3.6 to 6; round 6 beats round 5's by 1.7 to 3.8
      (2026-11-19).
- [x] Round 7: beats round 6's by 1.3 to 2.3 and every older model by more than round 6 did,
      adopted as `src/model.json` (2026-11-19). The README's "rounds" tables
      and `charts/rounds.svg` track every round.
- [x] Round 8: beats round 7's by 1.0 to 1.7 and every older model by more than round 7 did, adopted as `src/model.json` (2026-11-19). `scripts/round.sh 9` runs the
      next round, and `scripts/status.ts --round 9` shows its progress.
- [x] Round 9: beats round 8's by 0.5 to 0.9 at 4 to 6 players and ties at 3, adopted
      (2026-11-20). The gains are levelling off.
- [x] Round 10, on twice the games: 0.3 to 0.7 over round 9, within the noise, not adopted
      (2026-11-20). More of the same games no longer helps; the next gain needs something new
      (more deals a label, features, or labels from playouts against a league).
- [x] Rules from the learned player: where its moves differ from the default's, grouped by
      the default's rule (2026-11-20). Ahead with a card down and others in, the default passed
      and the model played: `hold` plays the weakest force card, +17 to +5 points against the
      previous default and +6 to +0.8 against the league. Adopted. The models still read the
      previous default's pick (`hint` in `learned.ts`) until a round is trained on the new one.
- [x] `finish` costs 2.7 points at 3 players against quick playouts since `hold`, but dropping it
      loses 1.4 to 4.8 against the default and 3.9 to 7.5 against the league. Counting the whole
      hand instead of the best 4: +1.1 at 3 players, adopted (2026-11-20).
- [x] `wait` is the model's biggest disagreement at 3 players, but never waiting there loses 5.3
      points against the default and 1.5 against the league. Baiting back the strongest force card
      when behind (the model's Bait over the default's 1) wins against the league and loses to
      today's default: a bet (2026-11-20).
- [x] Mined the mixed-table Hard model (2026-11-21): at 3 players it denies a winning chip with
      a 10 where the default waits or opens with a 1; adopted as `deny`, +6.4 against the
      default, +3.5 against the league. Holding Doves and Bait back a 1 while ahead are noise.
- [ ] Rerun the README's tables for the default with `hold`, `deny` and the new `finish`.
- [x] How much knowing the table is worth (README "Knowing the table", 2026-11-20): at a league
      table, 32-deal playouts that know each seat's default win 24 to 31 points more than ones
      that assume today's default; knowing only the league's makeup gets about half.
- [x] Opponent modeling, learned (`o1`, 2026-11-20, README "Knowing the table"): mixed tables
      with true rollouts gain 19 to 29 points against the league, as much as playouts that know
      every seat; the features for what each player has shown add nothing (same data without
      them ties). It loses badly to round 9's tables (7 to 20%).
- [ ] A Hard bot for people: `o2` (round 9's player in half the seats) still loses badly to
      round 9's tables; fit with rounds 3–9's data too (`model-r3456789o12`), it gives up 0.4 to
      2.8 points there and gains 12 to 33 against the league and the default (2026-11-21).
      Decide whether to adopt it; if so, pack it and its 200-tree version.
- [ ] More from the learned player: at 6 players it passes on 1s the default opens with, and
      plays 10s where it plays 1s.
- [x] Use the model to prune playouts to its top moves, and race on more deals, 2026-11-19:
      racing on 512 deals wins 75.7% at 3 players and 56.7% at 6; pruning to the model's top 3
      loses 1 to 5 points at 128 deals and at 512.
- [ ] A smaller model: 1,000 trees are 24 MB; 200 trees lose 3 to 4 points against the default.
- [ ] A mixed strategy: wait or open at random, at the rate where neither beats the other.
- [x] Non-binding deals on who denies (README "Deals", 2026-11-21): the named denier who reneges
      loses 3 to 11 points, so the deal keeps itself; a player outside it gains 1 to 4 at 3 to 5
      players, and making it alone costs 3 to 5.
- [ ] Why an outsider gains at a deal table: it isn't the battles deal players abandon (only
      holding off opening plays the same). Then a deal outsiders can't exploit, or punishment of
      whoever skipped their turn to deny.
- [ ] Doves to stop a battle someone else is winning, not only a chip that would win them the
      game. In one 4-player review (2026-11-19, local table `longgame`), Doves played where the
      default passed beat it by 23, 18 and 13 points in battles 5–7. One game: check it with
      `scripts/decisions.ts`, then as a variant against `--field league`.
- [ ] The default's waiting leaves stopping a rival to the others, and when everyone waits nobody
      does. In `onyx` (2026-11-19), passing with a chip that would win Bot 1 the game cost 54 and
      66 points, and passing on a chip that would have set up a win of our own cost 44.

## Analysis

- [x] Who wins by seat, and how long games last, at 3 to 6 players.
- [x] What each card is worth in an opening hand, and how that changes with the player.
- [ ] How much is luck: the strongest playouts against the default, and against each other.
- [x] Which color the Favor holder should pick: `pickColor` gets nearly all of the 7 to 10 points.
- [x] Rule readings: each `Rules` flag both ways (`scripts/rules.ts`), 2026-11-19: `emptyFavor`
      comes up in 1.3% to 4% of battles and changes nothing beyond the noise.

## Online

- [x] Play online with bots, as in monopoly-deal (`replay.ts`, `convex/`, `src/components/`).
- [x] Deploy to hilt.visnup.com, 2026-11-19: Convex project `hilt` (team visnup), Vercel project
      `hilt` (team visnu), deployed from GitHub on every push to `main`.
