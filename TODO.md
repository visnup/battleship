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
- [ ] Close more of the gap to playouts, now 11 to 24 points with the model-pruned playouts. Done 2026-11-16, one
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
      players and mostly in what to take, but 15 rules for it didn't beat the default. Paying and
      Just Say No were later learned rather than ruled (below). Saving Just Say No for a Deal
      Breaker loses.
- [x] Compare a rule with the default on the same deals (`variants.ts --paired`, `paired` in
      `strategies.ts`, 2026-11-19): the default plays each deal while the variant is asked what
      it would do, and the deal is replayed only if it would ever differ. Its wins match
      `headToHead`'s exactly, and a rare rule needs 20 to 40 times fewer deals: ±0.10–0.25 from
      20,000 (a few seconds), where 100,000 unpaired gave ±0.3. First find: Deal Breaker on
      whoever is one set from winning is +0.11 ± 0.03, +0.12 ± 0.04 and +0.23 ± 0.05 at 3–5
      players (200,000 deals), which the unpaired run called even. Not adopted yet: gains this
      size are worth batching, since each adoption reruns the tables.
- [x] Test the table advice the default doesn't follow yet (web search, 2026-11-15): holding
      the card that completes a set, and keeping a Just Say No for a Deal Breaker. Both lose.
- [ ] Playouts of every move won 59.1% at 2 players, 9 points over the default (61.0% now,
      pruned by the model); playing to the end, they tied it. More deals per move still help, about 2 points each time they double: at 80,
      160 and 320, 43.1%, 45.7% and 47.2% at 5 players, and 60.2%, 60.7% and 62.1% at 2 (4,000
      games each, ±1.5). Two rounds is best at 80 deals; with fewer deals, fewer rounds win
      (at 16, one round 36.6% at 5 players, two 31.7%, three 26.4%), and stopping at the end of
      the turn is worse than the default at 2 players. Retuned on the richer `chance`
      (2026-11-16, 8,000 games, ±1.5): nothing beats 80 deals and two rounds within the
      30-minute row. One round at 160 deals is 0.6× the time and +1.3 at 5 players but −2.5 at
      2; two rounds at 160 is +1.7 and +1.5 at 1.5× the time; z = 1.5 gains nothing. A richer
      `chance` (sets half done, rent cards, cash and properties in hand) added 1.9 points at 2
      players and 1.2 at 5. More of that ties (2026-11-18): 12 more numbers (sets missing one
      card, two full sets and the nearest, wilds down, an empty hand, Birthday and Debt
      Collector, Pass Go and Double the Rent held, and others) cut held-out log loss by only
      0.004 to 0.012, and playouts with them win 63.0% and 45.3% at 2 and 5 players against
      62.8% and 45.0% (10,000 games, same deals). With the learned board score also even, the
      board score isn't what holds playouts back now. A counterfactual-regret agent on a
      cut-down 2-player game ([arXiv 2510.25080](https://arxiv.org/pdf/2510.25080), code at monopolydeal.ai)
      reportedly wins about 75% against a heuristic player.
- [x] Recheck the findings against strong opponents (`strong.ts`, quick playouts in every other
      seat, 8,000 games): never building, banking before laying down, and playing the card
      that completes a set all hold. Going first is worth about the same among strong players
      at 5 (24.0% against 23.4%).
- [ ] Remember what's been played. The learned player's move model has it since 2026-11-18
      (card memory, below); still to try as a variant of the default, and in playouts'
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
- [ ] Use production's games (Convex `games` and `decisions` on monopoly.visnup.com) as real
      games: each replays from its seed through every choice, and people's choices are marked
      `bot: false`. Compare game length and the first player's share with the simulator's, and
      score people's moves against the default's and the learned player's picks (where people
      beat or lose to them). Too few to train on for a while.
- [ ] A staller: a strategy that tries to make the game stall, from the list in the README's
      "Stalled games". Count its stalls at 5 players against the pacifist's 68 in 100,000, and
      see which of its rules matter most.
- [ ] Online play (Next and Convex, `pnpm dev`): works with bots at three levels, deployed at
      monopoly.visnup.com (Vercel project `visnu/monopoly-deal`, 2026-11-17). Bots come in three
      levels (2026-11-18): Easy is `builder`, Medium the default, Hard the learned player from
      `src/packed` (`scripts/pack.ts`, rerun after retraining), which a Convex mutation runs in
      about 70 ms a turn.
      - [ ] Rename the site if Hasbro objects to the name: "Monopoly Deal" is their trademark, and
            the start page says the site isn't affiliated with them. Planned name Landlord's Hand
            (after The Landlord's Game) at landlords.visnup.com, with monopoly.visnup.com
            redirecting. The page title, the start page and lobby headings, and the domain, about
            an hour. Fan versions that kept the name seem to be left alone; Hasbro has sent
            cease-and-desists over online Scrabble and My Little Pony fan games.
      - [ ] Pick a wild's color when laying it down, and move it on your own turn without using
            a play. Today `moves()` lists one place move per wild (its first color), and
            `arrange` then moves every wild to its best color after each play, for people as
            well as bots: a lone railroad/utility wild always goes to utility. People's wilds
            should skip `arrange`. Games in progress may replay differently once this ships.
      - [x] Show what just happened: others' decisions step by (Fast 0.4s, Slow 0.9s or Off in
            the lobby, with a Skip button), each card that lands glows, and once caught up
            everything since your last decision stays lit; clicking a log line glows that
            play's cards too (2026-11-18).
      - [ ] Laying down a wild says "Lay it down", then `arrange` picks its color. Say so on the
            button (or its tooltip) until people can pick the color themselves.
      - [ ] Others as a compact strip: each one a row at the top (name, level, hand count, bank,
            set pills), tapping one to open their sets, so on a phone the table and your hand get
            the screen instead of empty bot seats (193px each at 375 wide).
      - [ ] Your hand as a fan of held cards at the bottom, like the start page's, instead of a
            scrolling row.
      - [ ] Plays left as three coins instead of "3 plays left".
      - [ ] A warmer look: cream card stock, a serif display face, coin badges for values.
      - [ ] House rules as lobby toggles: the `Rules` flags (`doubles`,
            `breakerTakesBuildings`, `reshuffle`, …), saved with the game so replays stay
            deterministic, each linked to what the README measured for it.
      - [ ] Pass and play on one phone, with a "hand it to Kerem" screen between turns; and
            "Add to home screen" (a web app manifest).
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
            (default paying: 0.97 and 0.75). Round 4's data took 3.5 and 6.6 minutes at 2 and
            3 players, against round 3's 15 and 37.
            `scripts/round.sh` runs a round. Round 4 (2026-11-17, under the B0965 rules) tried
            three ways to spend the labeling, each against round 3 on the same deals (±0.3–0.4):
            4a plain (5,000 games, 32 deals) +0.1, −0.1, +0.2, +0.3; 4b 10,000 games on 16 deals
            +0.4, +0.3, +0.5, +0.6; 4c 10,000 games with half the decisions labeled
            (`--label 0.5`) 0.0, +0.2, +0.6, +0.2. 4b gains at every count (about 2.5 se at 2,
            4 and 5) and is adopted: more decisions beat less noise per decision. Each took about
            40 minutes of data. As playouts' filter all three tie (±0.9 at 2, ±1.2 at 5). That's
            now `round.sh`'s default; 8 deals and 20,000 games is the next thing to try. The
            model in `dataset/model-r4.json` is 4b's.
            **The loop is near its limit as set up** (fits the data, not tested). Rounds gained
            only when the labels changed: round 1 over round 0, and round 3, the first with the
            learned payer in the playouts, and a little in 4b with cheaper labels. Rounds 2 and 4a,
            the same recipe again, tied. Every
            label asks which move is best if the default then plays two rounds, so iterating
            converges on the best one-step deviation from the default, however strong the player
            generating the games. As playouts' filter, no round since 1 has gained. Held out, the
            model gains +0.4 to +0.7 a decision against a noisy ceiling of +1.8 to +3.5; 4b says
            some of that was too few decisions, not too noisy labels. More rounds of the same recipe aren't worth running;
            stronger rollouts are, if they stay cheap like the learned payer (the learned player
            inside the playouts was 9–20× slower for no gain). In order:
      - [ ] Mine the latest model for rules, as round 0 gave two: where it overrules the
            default most often, and by how much on playouts. Adopted into `defaultPolicy`, they
            make every rollout stronger at no cost, and so the labels; then run another round.
            Round 4's (2026-11-17, `scripts/overrules.ts` on held-out r4b shards): laying a wild
            where a plain property would do, at every count. Properties before wilds gains +0.8,
            +0.6, +0.5 and +0.2 at 2–5 players (400,000 games), adopted. Laying down before Sly
            Deal, the next biggest at 3–5 players, loses 0.7 to 2.4. Tables rerun and `chance`
            refit. Round 5 (10,000 games on 16 deals with the new default inside the rollouts)
            ties round 4: trained on r5 alone −0.1 to −1.2, on r4b and r5 +0.4, −0.2, 0.0, −0.1
            (±0.3–0.4, `compare.ts`, 50,000 deals). Held out it gains +0.41 to +0.79 a decision,
            as round 4 did. So one more rule in the default didn't move the labels enough;
            `round.sh`'s window also looks for `features-r4`, which is `features-r4b`.
            Round 6's (2026-11-18, held out): its biggest overrule at 5 players is which set to
            Deal Breaker. It breaks a set of whoever is one set from winning, where the default
            takes the highest rent (81 times to 9 the other way, 8 points each by stored value).
            As a rule it's even (100,000 games, `variants.ts`): 49.6%, 33.5%, 25.0% and 20.2%,
            against the default's 50.0%, 33.3%, 24.9% and 19.9%; also breaking colors we have
            full is even too. Deal Breakers are rare enough that 8 points on 2% of 5-player
            decisions is under 0.2 a game. Next at 2–4 players: Forced Deal before Pass Go after
            round 3, which a dozen Forced Deal rules have already failed to capture.
      - [x] Then Just Say No and discarding (the "Learn the other decisions" item below), used
            in the rollouts like the payer (2026-11-17). `saynodata.ts` on 131,072 default games
            a player count (about 1.5 chances a game, 32 shuffles each way) to `src/sayno.json`:
            51.6%, 34.8%, 26.1% and 20.9% head to head, against the default's 50.0%, 33.3%,
            24.9% and 19.9%. `discarddata.ts` the same way to `src/discard.json`: 50.4%, 34.1%,
            26.2% and 21.4%; it disagrees with the default on 82–86% of discards at 3–5 players.
            Both wired into `learned()`, `playouts` and the dataset's rollouts like `paid()`.
            The learned player with both: 59.6%, 47.5%, 41.6% and 37.1% (from 57.7%, 45.8%,
            40.1% and 35.5%); `playouts` 62.0% and 44.7% at 2 and 5 (from 61.0% and 44.0%,
            4,000 games, ±1.5). Round 6 (10,000 games with those rollouts, trained on r4b and r6)
            ties round 4: +0.1, +0.1, +0.1 and +0.6 (±0.3–0.4, 50,000 deals); as playouts'
            filter −0.3 ± 0.9 at 2 and +1.7 ± 1.2 at 5 (4,000). Not adopted.
            Retrained all three on playouts where seat 0 already decides them by the models
            (`--learned`, 2026-11-18, same game counts, trained on both rounds' data): with the
            default's moves, 53.3%, 37.3%, 29.3% and 24.2% against 53.1%, 37.1%, 29.1% and 24.1%
            for the current models (400,000 games), and each alone within 0.2 of its current
            model. Not adopted: inside the noise, in files 1.5–2× bigger.
      - [x] Card memory (2026-11-18): 12 features of what the mover hasn't seen (`memory()` in
            `learned.ts`), after the 94. On rounds 4b and 6, +0.2 to +0.4 points over the same
            data without them, each inside the noise. Kept for the rounds after.
      - [x] Check the gains aren't just exploiting the default (2026-11-18, `field.ts`): in a
            table of learned players the default wins 39.9%, 21.6%, 13.1% and 9.6%.
      - [ ] Whole-turn planning. Looking ahead to the end of the turn, scored by `chance`, loses
            1 to 7 points (`plan.ts`), more the more moves it weighs: `chance` judges a finished
            turn worse than the model ranks moves. Needs a better end-of-turn value first, such
            as one trained on playouts from the end of a turn.
      - [ ] Expert iteration: label moves by playouts where everyone is the learned player
            (`dataset.ts --strong`, `scripts/overnight.sh`). 30–60× slower per decision than
            default rollouts, so round 7 (2026-11-18, 2 h 40 min) labeled the top 4 on 8 deals
            for half the decisions of 5,000 games a count: 666,000 decisions. With rounds 6's
            data it ties the card-memory model trained without it (−0.2 to +0.2, 50,000 deals);
            alone it loses 0.6 to 3.9 to round 4. Next, if anything: several times the games, or
            the strong labels only on decisions where default rollouts disagree most.
            Those were all against the default. Against learned players in every other seat
            (`compare.ts --field`, 2026-11-19, 20,000 deals, ±0.55–0.7), round 7 with round 6's
            data gains +0.65, +0.22, +0.64 and +1.07 over the card-memory model, and alone it
            ties it; round 4 ties it there too, so card memory's gain is against the default
            only. `../hilt`'s strong rounds gained the same way: against earlier models, not the
            default. Round 7's labels were too noisy to learn much from (held out, +0.2 to +0.7
            a decision against a noisy best of 2.5 to 4.8), so round 8 buys more of them: a
            200-tree model inside the rollouts (1.0 to 1.4 points weaker than 1,000 trees
            against learned players, 1.9× faster at 5 players; 50 trees lose 3.4 to 4.4 for
            2.8×) on 4 deals, 10,000 games a count. Scoring is about 42 ns a tree whatever the
            layout, so fewer trees is the only cheap speedup.
            Round 8 (2026-11-19, 1.32 million decisions in 106 minutes, trained with rounds 6
            and 7) gains everywhere. Against learned players (40,000 deals, ±0.4–0.5): +0.53,
            +1.52, +1.80 and +2.69 over the card-memory model in its field, and +0.33, +1.14,
            +1.49 and +1.42 over round 7 in round 7's. Against the default (50,000 deals,
            ±0.35–0.45): +0.16, +0.78, +1.04 and +0.53 over the card-memory model. As playouts'
            filter it ties round 7 (−0.07 ± 0.90 at 2, +0.92 ± 1.18 at 5). `round.sh` now
            compares against the last round's learned players too. Adopted as `src/model.json`
            and `src/packed/model.ts`; the README's learned-player numbers are still round
            6's. Round 9 runs the same recipe from round 8.
      - [x] Adopted the card-memory model (`model-r6m`, rounds 4b and 6 with `memory()`) as
            `src/model.json` and `src/packed/model.ts`: +0.3, +0.4, +0.5 and +1.0 over round 4
            (±0.3–0.5, 50,000 deals).
      - [x] Card memory in the Just Say No and discard numbers too (2026-11-18,
            `scripts/memory.sh`, 30 minutes): refit on regenerated data, each ties today's model
            to 0.1 at 2–5 players (400,000 games), though they decide differently (6% of chances
            to say no, 14% of discards). Not adopted; the features stay, since the old models
            ignore them.
      - [ ] Racing with an indifference zone: stop a race once the leaders are within a set
            margin, instead of only dropping moves `z` standard errors behind. Not yet run;
            needs quiet cores.
      - [x] A small model inside the playouts (2026-11-17, quick playouts, 4,000 games, ±1.6 at
            2 players and ±1.5 at 5): the default there wins 53.2% and 33.5%. 50 trees 54.0% and
            33.5% at 9–12× the time, 150 trees 54.8% and 33.8% at 13–19×, a network 32 wide
            53.9% and 31.6% at 15–20×. Featurizing every move costs more than the default's
            whole decision, so no model this shape pays for itself there.
      - [x] Learn the other decisions: paying, Just Say No and discarding (Just Say No and
            discarding are in the item above). Paying is where playouts disagreed most at 5
            players; `pay.ts` and `sayno.ts` replays give the data.
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

## Analysis

- [x] Who wins: seat order and player count (2 to 5). Going first is worth 14 points at 2.
- [x] What each card is worth (`cards.ts`): Deal Breaker by far, then two-color Rents at big
      tables and Just Say No at small ones.
- [x] Bank or build: never build, and bank about $10M before laying properties down.
- [x] Which colors to chase (`colors.ts`): the 2-card sets, especially dark blue.
- [x] How long games last, and how often the draw pile runs out.
- [x] Charts in `charts/` (`scripts/charts.ts`), drawn from the README's tables.
- [x] How much is luck: playouts win 1.22 fair shares against the default at 2 players and
      2.20 at 5, so skill counts for more at big tables.
- [x] When a game is decided (`decided.ts`): the player ahead after round 3 wins 72% at 2
      players and 46% at 5. Comebacks last at 2 players and run out at 5.
- [x] Played or banked (`cards.ts`): every action card is worth far more played, except
      Forced Deal early at 3+ players. Holding one unplayed isn't measured: no player here
      reads another's hand, so a held card can't deter.
- [x] Paying (`payments.ts`): at 5 players the bank is down to $8.4M when charged, one payment
      in five costs property, and 66% of losers pay in property at least once.
- [x] Opening hands (`openings.ts`): action cards make a hand, and it matters more at big
      tables (0.59 to 1.38 fair shares at 5 players). The sheet has no mulligan.
