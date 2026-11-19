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
- [ ] Recheck the adopted rules against strong players (`variants.ts --field playouts`).
- [ ] The Favor holder's chip choice and the discard on passing are still rules (`pickColor`,
      `dump`); play them out too.
- [ ] Remember what's been played: `game.pile` holds every face-up card since the deal, but
      playouts deal the hidden cards from everything unseen, which already accounts for it.
      A player that reads others' likely hands from what they've played and passed on.
- [x] Learn a move scorer from playouts, as in monopoly-deal (`dataset.ts`, `learn.py`,
      `learned.ts`), 2026-11-19: 74.7% at 3 players and 50.3% at 6 against the default, as good
      as 128-deal playouts. Round 1 (the learned player's games) +3 to +5 against round 0's
      players, adopted as `src/model.json`; round 2 ties.
- [x] Labels from learned players inside the playouts (`dataset.ts --rollout`), 25× the cost
      a decision, 3,000 games a player count on 16 deals, about 35 minutes a round. Round 3
      beats rounds 0–1's players by 12 to 20 points (and wins less against the default); rounds
      3–4 beat round 3's by 11 to 20; rounds 3–5 beat rounds 3–4's by 3.6 to 6; rounds 3–6 beat
      rounds 3–5's by 1.7 to 3.8, adopted as `src/model.json` (2026-11-19).
- [ ] More strong rounds while they gain, and more games a round now that they cost less than
      expected. Check each against every earlier model, not just the last, since these cycle too.
- [ ] Use the model to prune playouts to its top moves, and race on more deals.
- [ ] A smaller model: 1,000 trees are 24 MB; 200 trees lose 3 to 4 points against the default.
- [ ] A mixed strategy: wait or open at random, at the rate where neither beats the other.

## Analysis

- [x] Who wins by seat, and how long games last, at 3 to 6 players.
- [x] What each card is worth in an opening hand, and how that changes with the player.
- [ ] How much is luck: the strongest playouts against the default, and against each other.
- [ ] Which color the Favor holder should pick.
- [ ] Rule readings: each `Rules` flag both ways.
