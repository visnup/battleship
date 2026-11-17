# TODO

## Check the model

- [x] Check card values and rent tables against the physical cards.
- [x] Settle what the sheet leaves open (CLAUDE.md's "Interpretations"). Hasbro has no FAQ, so
      `sensitivity.ts` runs both readings of each: none favors a seat, and only no-reshuffle
      changes how games go (`README.md`).
- [x] An engine: deal, turns, payments, Just Say No chains, and a heuristic player (`game.ts`).
- [x] Whole-game strategies head to head (`strategies.ts`).
- [x] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`, `order.ts`):
      charge, then bank, then lay properties down; never build; aim one-player charges at whoever
      has to pay in property. Against it, the first one wins 11 points less at 2 players and more
      than a third fewer games at 5.
- [x] Speed up playouts until the strategies table's playouts row is good to ±1 point in 15
      minutes (30 at most). That's about 32,000 playouts games: 6,400 at 5 players, 10,000 at
      2. On 20 cores at 3.5s a game it took about 93 minutes. With what's checked below, 10,000
      games at each of 2–5 players (±1 everywhere) took 73 minutes on 2026-11-15, so it still
      needs 2.5–5× more.
      - [x] Memoize `arrange`, score each player once in `leader` and `inProperty`, and pick
            the any-color Rent's target once per amount: 1.75× with every result unchanged
            (250bb75).
      - [x] One move per wild placed (`arrange` re-colors it after every play) and per
            identical card taken or given: about 10%, same results in the benchmark.
      - [x] Racing: play every live move on 8 more shared deals at a time, and drop one once
            it's 2 standard errors of the paired difference behind the leader, up to 80 deals.
            By regret (each method's pick, valued on 1,000 independent deals, against the
            best move, at ~450–600 sampled decisions): 1.19 points a decision on 656 rollouts
            at 5 players, against 1.26 on 985 for 80 deals each; 0.94 on 545 against 0.84 on
            683 at 2. z = 1.5 is 1.9× cheaper at 5 players at the same regret, but worse at 2.
            Successive halving only matched 80 deals each at equal cost.
      - [x] Count without `filter`, pay without copying arrays, build `arrange`'s key without
            joins, and skip `arrange` after banking or Pass Go: 1.2× with every result
            unchanged. Garbage collection went from 16% of the time to 2%. Scoring `arrange`'s
            search incrementally was slower and broke ties differently.
      - [ ] Cheaper rollouts. Profiled 2026-11-16 on two-round playouts (0.7 s a game):
            `arrange` 13.5% and its search 10%, `plays` 7%, `pay` 5%, garbage collection 5%;
            `fullSets` and `count` only 3.5% together, so memoizing them isn't worth it. A
            bitmask for `arrange`'s key changed nothing measurable. What's left is `arrange`'s
            cache missing on the wilds' current colors, which it keys on to break ties the same
            way; dropping them would change results.
      - [x] Rollouts cut off after two rounds and scored from the board (`chance`): 2.5× faster,
            and a stronger player, not a weaker one. By regret on the richer `chance`
            (2026-11-16, ±2 SE), 0.73 ± 0.12 points a decision against 1.21 ± 0.17 at 5
            players, and 0.54 ± 0.08 against 1.03 ± 0.14 at 2; paired on the same decisions,
            −0.48 ± 0.19 and −0.49 ± 0.16. One round was faster again but worse (0.88, 0.92).
            The row now takes 21.5 minutes, and playouts win 8 to 10 points more.
      - Comparing playouts and the default on the same deals doesn't help: it cut variance
        2.3× for banker at 2 players, but made it worse for builder, which, like playouts,
        plays very differently from the default.
- [x] Learn a player from playouts. A linear scorer (2026-11-16, not committed) lost to the
      default, 48.1% at 2 players and 17.4% at 5, even with a feature for the default's move.
      Gradient-boosted trees beat it, and are now `playouts`' filter: see "Use the dataset".
- [ ] Close more of the gap to playouts, now 11 to 22 points with the model-pruned playouts. Done 2026-11-16, one
      step at a time on top of the last: adopt banking Forced Deal in the first round at 3+
      players (+0.35 to +0.4 at 3–5, −0.3 at 2; done), refit `chance` (done), run
      `decisions.ts` with its recheck also cut off at two rounds (done: at 2 players the
      default ended turns holding a rent it wouldn't charge for $1M; charging it is +2.0
      there at 400,000 games, adopted), test what else it finds (banking Double the Rent
      ahead of money: +0.5 at 2 players and +0.4 at 3, adopted; banking Rent cards for
      colors we have none of loses up to 6 points at 5; Deal Breaker on the leader first is
      even). A second search round found Forced Deal held at 2 players and Sly Deal after
      Pass Go at 5, but Sly Deal before Pass Go and nine Forced Deal rules were all even or
      worse. Every table was then rerun on the new default. Done before: placement
      (no pattern beat the default) and the any-color Rent (aim it, and Debt Collector, at
      whoever has to pay in property). Forced Deal's gap is real, about 1.6 points a game at 5
      players and mostly in what to take, but 15 rules for it didn't beat the default. Also
      untouched: what to pay with. Saving Just Say No for a Deal Breaker loses; playouts at
      each Just Say No decision might still find a rule.
- [x] Test the table advice the default doesn't follow yet (web search, 2026-11-15): holding
      the card that completes a set, and keeping a Just Say No for a Deal Breaker. Both lose.
- [ ] Playouts of every move won 59.1% at 2 players, 9 points over the default (61.2% now,
      pruned by the model); playing to the end, they tied it. More deals per move still help, about 2 points each time they double: at 80,
      160 and 320, 43.1%, 45.7% and 47.2% at 5 players, and 60.2%, 60.7% and 62.1% at 2 (4,000
      games each, ±1.5). Two rounds is best at 80 deals; with fewer deals, fewer rounds win
      (at 16, one round 36.6% at 5 players, two 31.7%, three 26.4%), and stopping at the end of
      the turn is worse than the default at 2 players. Retuned on the richer `chance`
      (2026-11-16, 8,000 games, ±1.5): nothing beats 80 deals and two rounds within the
      30-minute row. One round at 160 deals is 0.6× the time and +1.3 at 5 players but −2.5 at
      2; two rounds at 160 is +1.7 and +1.5 at 1.5× the time; z = 1.5 gains nothing. A richer
      `chance` (sets half done, rent cards, cash and properties in hand) added 1.9 points at 2
      players and 1.2 at 5. Still to try: more of that. A counterfactual-regret agent on a
      cut-down 2-player game ([arXiv 2510.25080](https://arxiv.org/pdf/2510.25080), code at monopolydeal.ai)
      reportedly wins about 75% against a heuristic player.
- [x] Recheck the findings against strong opponents (`strong.ts`, quick playouts in every other
      seat, 8,000 games): never building, banking before laying down, and playing the card
      that completes a set all hold. Going first is worth about the same among strong players
      at 5 (24.0% against 23.4%).
- [ ] Remember what's been played. No player tracks it, so none knows when the Just Say Nos
      and Deal Breakers are gone and a full set is safe. Try it as a variant, and in playouts'
      guesses at the hidden cards.
- [x] What to pay with, by playouts (`pay.ts`, 2026-11-16). At 5 players it paid with a loose
      property where the default paid money in 904 of 3,251 payments, +0.8 points each by its
      two-round score. Head to head that loses 10 to 26 points; paying from loose properties
      before the bank only when the bank can't cover it is even. Not because `chance` overvalues
      the bank: halving its weight left quick playouts unchanged and zeroing it lost 3 points at 5 players (4,000 games). More likely playouts
      want property only in some spots, and no rule found them. The default's rule stands.
- [x] When to Just Say No, by playouts at each decision to say it (`sayno.ts`, 2026-11-16). It
      lets Debt Collector through and leaves a No against its own action standing, but
      head to head the first is even and never countering loses 0.5 to 0.6 points.
- [x] Tests for `STEPS`: a small board per rule (`game.test.ts`), so a refactor can't
      quietly change the default player.
- [ ] Log some real games and compare: game length, first-player advantage. Needs real games.
- [ ] A staller: a strategy that tries to make the game stall, from the list in the README's
      "Stalled games". Count its stalls at 5 players against the pacifist's 41 in 100,000, and
      see which of its rules matter most.
- [ ] Online play (Next and Convex, `pnpm dev`): works with default-player bots against a dev
      deployment. Still to do: a Vercel project and production deployment, choosing wild colors,
      names, handling a player who leaves mid-game, and harder bots: the learned player is
      stronger at 2 and 3 players than quick playouts and takes about 4 ms a game.
- [ ] Use the dataset (`scripts/dataset.ts`, on Hugging Face as `visnup/monopoly-deal`): every
      move decision of 10,000 default games at each player count, with each move's two-round
      playout value. It goes stale whenever the default player or `chance` changes, so
      regenerate it first (66 minutes).
      - [ ] Where the gap to playouts is: by card and situation, the value the default's pick
            gives up against the best move. Minutes of SQL, and it says which of the rest are
            worth doing. First look (2026-11-16, before the turn-order tie fix), counting only
            gaps over 2 standard errors: 15 points a game at 2 players to 26 at 5. At 5 players
            most is in whom to hit: which set to Deal Break, which card to Sly Deal, which swap
            to Forced Deal. At 2, Forced Deal's swap and playing it more. Playouts would Deal
            Break cheap sets (brown, utility) where the default takes dark blue, but the lowest
            rent first, or the leader's lowest or highest, were all even head to head (100,000
            games).
      - [ ] Screen rules offline: rebuild each board from what the mover sees (opponents' hands
            as placeholders), run a candidate rule, and score its pick with the stored values.
            Only what passes gets the 100,000-game check, since offline gains have failed head
            to head before (paying).
      - [x] A learned move scorer: a model that predicts playouts' pick, adopted as `playouts`'
            filter. First fit (2026-11-16, `learn.ts` and `learn.py`): gradient-boosted trees over 94
            numbers per move, 300 trees on 16 shards of each player count. Held out, +0.4
            points of win chance a decision over the default's pick. Head to head it's the
            first player to beat the default: 54.9% at 2 players and 26.4% at 5 (10,000
            games). On all 248 training shards with 1,000 trees (16 minutes on 20 cores, not
            yet early-stopped): +0.6 to +0.7 a decision held out, and 56.3%, 42.8%, 35.2% and
            30.3% at 2–5 players (100,000 games), level with quick playouts at 2 and 3 players
            at about 4 ms of CPU a game. Inside quick playouts as everyone's rollout player, 53.5% at
            2 players and 38.1% at 5 (1,000 games, ±3), against 55.6% and 36.1% with the
            default, at about 20× the time: 1,000 trees are 85% of it even from flat arrays.
            Full playouts with the default cost less and win 42.8% at 5.
            As a filter it works (`playouts`' `candidates`, 10,000 games, ±1): playing out only
            the trees' top 5 moves wins 60.9% and 44.6% at 2 and 5 players in 0.6–0.8× the
            time, and with 160 deals instead of 80, 61.8% and 46.0% (+2.0, +3.2) in the same
            time at 5 players and 1.3× at 2. Top 3 is cheaper and about 1 point worse; top 2
            loses 3 points at 5. Adopting it means committing a model, now 7 MB of trees.
            Retrained on the new default's dataset (2026-11-17): trees 56.0%, 42.0%, 33.8% and
            29.1%, the network 55.5%, 42.6%, 35.2% and 30.7% (100,000 games), and the top 5 at
            160 deals 61.2%, 49.9%, 46.4% and 41.8% against playouts' 59.1%, 48.6%, 43.7% and
            38.7%, in 1.2× the time (10,000 games). In the README's "A learned player".
      - [x] Rules from where the model overrules the default (2026-11-17, held-out shards,
            by stored value): it ended turns holding a card it wouldn't play, and played
            Birthday in the first round. Banking what's left when that empties the hand (+0.3
            to +0.8 at 2–5 players) and holding Birthday in the first round (+0.3 to +0.9 at
            3–5) were both adopted. Deal Breaker and Sly Deal before Pass Go after round 3: +0.4
            at 5, even elsewhere. The rest is whom to hit, as before.
      - [x] A neural network instead of trees (`learn_mlx.py`, MLX on the GPU): 512 wide, 2
            layers, 5 minutes against the trees' 16 on the CPU. Held out, +0.67 to +0.74 a
            decision (trees +0.59 to +0.72). Head to head (100,000 games) 55.2%, 43.1%, 37.1%
            and 32.9% at 2–5 players: −1.1 at 2 against the trees, +1.9 and +2.6 at 4 and 5.
            Ranking playouts' top 5 with it instead of the trees is even.
      - [x] A learned board score (`learn_value.py`, removed after a536e7e): the mover's chance
            of winning from what they see, fitted to who won (overfits after 5 epochs: about
            37,000 games behind 2.7 million boards). In place of `chance` on the top 3 and 80
            deals: +1.7 at 5 players, even at 2; on the top 5 and 160 deals, even at both, at
            1.2–1.7× the time.
      - [ ] Tune racing offline: how close each decision's top moves are says how many deals
            and what `z` it needs.
      - [ ] Retrain on stronger search: regenerate the dataset from the learned player's games,
            scored by the pruned playouts, retrain, and repeat while it gains. The current one
            is the default's games scored with the default inside the playouts. About 2.5 hours
            a pass.
            Round 1 (2026-11-17, 10,000 learned-player games a count): the learned player
            56.8%, 43.1%, 35.6% and 30.7% (+0.8 to +1.8), playouts ranked by it 61.1%, 50.3%,
            46.5% and 42.4% (even, ±1). Adopted. From round 2 a pass is quicker: 2,500 new
            games a count, only the model's top 6 moves, the default's and one at random played
            out (6.6 moves a decision instead of 10.6 at 5 players), LightGBM over the last three
            rounds (6 minutes, against 21 for scikit-learn's at the same held-out gain), and
            `compare.ts` on the same deals, which gets ±0.15–0.3 from 50,000 deals in under a
            minute for the learned player. Values are centered on each decision's mean:
            centering on the default's pick instead halved the held-out gain (+0.17 against
            +0.39 at 2 players), since the default's row is then always exactly 0.
            Round 2 (2,500 games a count, rounds 1–2) tied round 1: +0.1 to +0.5 ±0.4. Round 3
            (5,000 games, rounds 2–3, playouts paying by the learned payer, 73 minutes) gains
            +0.5, +1.6, +1.7 and +2.0 (±0.35–0.45) over round 1: the learned player 58.1%, 46.1%,
            39.4% and 34.6%. Ranking playouts it ties (−0.7 ±1.0 at 2, +0.9 ±1.4 at 5). Adopted.
            From round 4 only the mover pays by the learned payer in the playouts, as in the
            field it's measured against: labeling is 1.7× faster at 2 players and 2.7× at 5, and
            on the same deals its values correlate 0.99 and 0.78 with everyone paying that way
            (default paying: 0.97 and 0.75).
      - [x] A small model inside the playouts (2026-11-17, quick playouts, 4,000 games, ±1.6 at
            2 players and ±1.5 at 5): the default there wins 53.2% and 33.5%. 50 trees 54.0% and
            33.5% at 9–12× the time, 150 trees 54.8% and 33.8% at 13–19×, a network 32 wide
            53.9% and 31.6% at 15–20×. Featurizing every move costs more than the default's
            whole decision, so no model this shape pays for itself there.
      - [ ] Learn the other decisions: paying, Just Say No and discarding are still the
            default's rules. Paying is where playouts disagreed most at 5 players; `pay.ts` and
            `sayno.ts` replays give the data.
            Paying (2026-11-17): `paydata.ts` plays out every payment with a choice in 16,384
            default games per player count (338,000 payments, 32 shuffles each); trees on
            `paying.ts`'s 27 numbers per way to pay gain +0.32 to +0.51 points a payment held
            out. Head to head (100,000 games) the learned payer wins 50.8%, 34.6%, 26.2% and
            21.4%: +1.1 to +1.5 points, the first change to paying that wins. Where it differs:
            at 5 players a loose property instead of money in a fifth of payments, and from the
            bank, fewer and bigger cards ($3M for a $2M Birthday). Neither part is a rule:
            paying the fewest bank cards with the least change ties the default, and with the
            most change loses 2.3 to 3.3 points (`variants.ts`). Wired in as `paid()`
            (`src/pay.json`): on the same deals (`compare.ts`-style, 50,000), +1.1 to +2.2 for
            the learned player, and +0.4 ± 0.5 and +0.6 ± 1.3 for `playouts` at 2 and 5 players
            (4,000).
      - [ ] Mine the retrained model for rules again, as was done for `emptyHand` and Birthday.

## Analysis

- [x] Who wins: seat order and player count (2 to 5). Going first is worth 14 points at 2.
- [x] What each card is worth (`cards.ts`): Deal Breaker by far, then two-color Rents at big
      tables and Just Say No at small ones.
- [x] Bank or build: never build, and bank about $10M before laying properties down.
- [x] Which colors to chase (`colors.ts`): the 2-card sets, especially dark blue.
- [x] How long games last, and how often the draw pile runs out.
- [x] Charts in `charts/` (`scripts/charts.ts`), drawn from the README's tables.
- [x] How much is luck: playouts win 1.22 fair shares against the default at 2 players and
      2.09 at 5, so skill counts for more at big tables.
- [x] When a game is decided (`decided.ts`): the player ahead after round 3 wins 72% at 2
      players and 46% at 5. Comebacks last at 2 players and run out at 5.
- [x] Played or banked (`cards.ts`): every action card is worth far more played, except
      Forced Deal early at 3+ players. Holding one unplayed isn't measured: no player here
      reads another's hand, so a held card can't deter.
- [x] Paying (`payments.ts`): at 5 players the bank is down to $8.4M when charged, one payment
      in five costs property, and 66% of losers pay in property at least once.
- [x] Opening hands (`openings.ts`): action cards make a hand, and it matters more at big
      tables (0.59 to 1.38 fair shares at 5 players). The sheet has no mulligan.
