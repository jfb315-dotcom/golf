# JB Golf — how to work on this project

## What it is
A phone web app John uses to run golf for his group: sign-ups, balanced teams, live scoring from each cart, skins and team bets, "Our Match" (a 2-on-2 money match), side bets, season money, past rounds.
- **No framework, no build.** `index.html` (~7,700 lines) holds all the HTML, CSS and JavaScript. Edit it directly.
- **Hosting:** GitHub Pages at `https://jfb315-dotcom.github.io/golf/`. A push to `main` deploys it (`.github/workflows/pages.yml`). Repo: `jfb315-dotcom/golf`.
- **Data:** Firebase project `golf-327be`, Firestore collection `tournaments/`, one document per thing (Firebase compat SDK 10.8 from gstatic). Organizer signs in with email; cart phones sign in anonymously.
- **Alerts:** web push through a Cloudflare Worker (`ALERTS_URL`). iPhones only get them from a Home Screen icon.
- **Users:** John (the organizer, non-technical) on an iPhone, and his players on iPhones. Everything is judged on a phone screen.

## Map
- `index.html` — the app. Order inside: `<style>` → screens (`<div id="step-…" class="screen">`) → modals (`.modal-overlay`) → one big `<script>` → a second `<script>` for the test copy's layouts.
  - Screens: `step-home`, `step-1` (setup), `step-2` (rosters), `step-2-half` (scramble carts), `step-3` (scoring), `step-dashboard` (Standings), `step-7` (cart links), `step-players`, `step-money`, `step-whos`, `step-signup`, `step-alerts`, `step-help` (How it works), `step-8`/`step-9` (Past rounds list / one round), `step-cartpick`, `step-dead-link`.
  - Script sections (search the banner comments): THEMES & POPUPS · FIREBASE & STATE · SETUP & SCRAMBLED PAIRINGS · TEXT SHARE · SCORING ENGINE · SCOREBOARDS & PAYOUTS · CORE SCORING MATH · SHARE & ARCHIVE · PHONE ALERTS.
- `cart.html`, `live.html`, `match.html`, `results.html`, `join.html` — 21-line link pages. Each only carries the picture card Messages shows (`og:image` → `card-*.png`), then redirects to `./` with the same query string.
- `sw.js` — offline cache. `manifest.json` + `logo.png` = the **JB Golf** icon; `manifest-watch.json` + `logo-watch*.png` = the **JB Watch** icon.
- `firebase/firestore.rules` (pasted into the Firebase console by hand; `ORGANIZER_EMAIL` placeholder) and `rules.test.mjs`.
- `cloudflare/alerts-worker.js` — deployed by hand in Cloudflare.
- `tests/` — Playwright tests, `stub.js` (fake Firestore), `run-all.sh`. `tests/shots/` holds screenshots (not committed).

## Commands
- **Build:** none. **Run locally:** `python3 -m http.server 8000` in the repo, open `http://localhost:8000/?beta=0` (talks to the real Firebase; prefer the tests).
- **All tests:** `bash tests/run-all.sh` → prints `FAILS:` followed by failing test names (empty = all pass). ~5 minutes.
- **One test:** `node tests/<name>.js`. Many accept another build to compare: `node tests/<name>.js /path/to/old-index.html`.
- **Compare with what's live:** `git show origin/main:index.html > /tmp/old.html`, then run a test against it to prove the test fails before your change.
- **Fit checks (not in run-all):** `node tests/fit.js`, `fit2.js`, `fit3.js` — the scoring screen must fit iPhone SE / 14 / Pro Max without scrolling. Run after any change to scoring or the keypad.
- **Simulated rounds:** `node tests/sim.js <first> <count>`.
- Tests expect Playwright at `/opt/node22/lib/node_modules/playwright` and Chromium at `/opt/pw-browsers/chromium`.

## Working with John
- He is not a developer. Plain words, no jargon, short answers. Show a screenshot of every visible change (render it in a test, look at it yourself first).
- Flow: change → tests → commit → push to the working branch → open a PR on `jfb315-dotcom/golf` → **stop and wait for him to say "merge"**. Then merge with the PR's head SHA and reset the working branch to `origin/main` (force-push). Never merge on your own. If he says "do X then merge", that is permission for that one PR.
- After merging, tell him to close the app fully and reopen it (the offline cache serves the old copy first).
- **Always update How it works** (`#step-help`) and this file in the same change when anything changes how the app is used or what something is called.
- When he asks "does it do X?", check the code or run it before answering. He often turns out to be describing a real bug.
- When he asks for a "rendering", build it in the test copy and send screenshots; don't change the real app until he approves.

## Code rules
- One file. No new dependencies, no modules, no build step, no `localStorage` keys without the `jbGolf…`/`jb…` naming.
- State is a few globals: `roundData`, `scoresDb[groupId][playerId][hole]`, `matchPresses`, `savedPlayers`, `roundHistory`, `signup`, `lockedTeamId` (null = organizer, otherwise the cart), `currentTeamFilter`, `liveRoundInCloud`, `showingFinalResults`.
- Screens switch with `showScreen(id)` / `switchScreen(hide, show)`. HTML is built as template strings and set with `innerHTML`; re-render by calling the screen's render function (`renderScoreEntry()`, `viewDashboard()`, `renderArchivedRound()`, `renderHome()`).
- **Firestore:** docs are `tournaments/<name>`; always go through `docName('<name>')` for round-related docs so the test copy stays separate. Change one field with `ref.update(new firebase.firestore.FieldPath('roundData', 'x'), value)` and wrap in `trackCloudWrite(...)`; never rewrite the whole round doc from a cart. Firestore rejects `undefined` and lists inside lists. A cart may only change the keys allowed in `firestore.rules`; a new cart-written field needs a rules change John must paste in.
- Scores are saved with `saveScoresToCloud([[g, p], …], hole)`; it also feeds Undo, alerts and the score-change log.
- **All money maths goes through the existing functions**, which take `(rData, sDb)` so they work for live rounds and Past rounds alike: `calculatePayouts`, `calculateOurMatch`, `calculateSideBet`, `roundSettleUp`, `getPlayerNetScore`, `playableFormats`, `getHoleSequenceFor`. Never recompute money in a render function. Match money is in dollars; `roundHistory` stores cents.
- Round types: `hasTournamentMoney(rd)` (team bets/skins) and `isOurMatchOnly(rd)` (Our Match with no purse). Branch on these, not on player counts.
- Whose view: `ourMatchForViewer(rd, presses)` / `omViewerFlipped(rd)` flip the pairs for a player's link (`me=<name>` or old `om=2`); a button on a flipped page must pass through `realOurMatchSide()`.
- Link parameters: `cart`, `r` (round id), `me` (player's full name, lower case), `spectator=true`, `round` (a finished round), `om`, `signup`, `beta`. Build links with `shareUrl(page, query)`. Open Messages with `openSms(url)`.
- Collapsible sections use `fold(id, title, body, open)`; reuse it rather than writing `<details>` by hand.
- Comments say *why*, in plain words, one line. Match the surrounding style (long single-line CSS rules, `let`, arrow functions).
- Adding a file the app loads: add it to `APP_FILES` in `sw.js` and bump `CACHE`. Changing a `card-*.png`: add `?v=N` to its `og:image` so Messages refetches it.
- Never add `start_url` to a manifest: each Home Screen icon must keep the link it was saved from.

## Design rules
- **Colours come from theme variables only:** `--bg-dark` (page), `--bg-card`, `--text-main`, `--text-muted`, `--accent-gold` (the one accent), `--on-accent` (text on the accent), `--fill-soft` / `--fill` / `--fill-strong` (panels), `--line` (dividers), `--good`, `--bad`, `--border-color`, `--band-*`, `--head-bg`. Seven themes in `appThemes` (five dark, two light); a hard-coded colour will break on the light ones. For a tint use `color-mix(in srgb, var(--accent-gold) 16%, transparent)`. Team colours: `teamColor(group)`, never `group.color`.
- **Font:** `'Segoe UI', Tahoma, sans-serif` (system font on iPhone); `ui-monospace` only for bet strings like `+2 +1 E`.
- **Type:** page title `.clean-title` 34px; section labels (`.clean-eyebrow`, `.field-label`, `.dash-section-title`) 13px bold uppercase, letter-spacing .12–.14em, muted; rows 16–17px; notes (`.payout-note`, `.clean-sub`) 13–15px muted. Money: `+$50` / `−$50` via `formatMatchMoney` (real minus sign).
- **Spacing:** page padding 15px; `.screen.clean` max-width 600px (Standings 1000px); new section `margin-top` 24–28px; rows divided by `1px solid var(--line)`; gaps 8/12/14px.
- **Controls:** inputs, steppers, money fields 56px tall, radius 14px, `--fill` background; segmented choices 44px; main action `.bar-primary` 56px pill (radius 28) in a sticky `.bottom-bar`; list rows `.list-row` min 52px; cards/tiles radius 16px, `1px solid var(--line)`; modals `.modal-overlay` + `.modal-content`. Anything tappable ≥ 44px tall and must *look* tappable (outline or fill, an arrow if it opens something).
- **Typing boxes ≥ 16px text**, or iPhones zoom the page and stay zoomed (`zoomscan` test).
- Standings pages: the answer first (who's winning / who pays who), details behind buttons or folds. In Our Match charts there is no colour coding; the winning number is `<b class="om-win">`.
- Reuse before inventing: `.format-row` + `.switch`, `.segmented`, `.stepper`, `.money-field`, `.list-row`, `.payout-row`, `.om-head`, `.match-send-row`, `.om-tabs`, `fold()`.
- The scoring screen must never scroll or shift while scores are entered (no `scrollIntoView`, no smooth scrolling there).

## Words to use (John's vocabulary)
- **Pair**, never "side" (side means front/back nine). **Our Match**, **1st ball goes to 2nd ball**, **Nassau**, **press**, **Standings**, **How it works**, **JB Golf** (scoring icon), **JB Watch** (follow-along icon), **test copy**.

## Our Match facts
- Home has **＋ New tournament** and **⛳ Our Match** (`startNewRound('tournament' | 'om')`). Our Match = 2 teams of 2, no purse, no side bets, short setup (`.tourn-only` elements hidden via `#om-only:checked`). A tournament can add it: "Our Match within this tournament?".
- Per person: Nassau front/back/overall (low ball; net only if "strokes count on the Nassau"; one press per pair per bet; presses can be undone), 1st ball goes to 2nd ball (net; a new bet whenever the newest goes 1 down), team birdies (gross; eagle = 2).
- **The second nine *played* is double**, whichever holes those are.
- John keeps all four scores. The others get **their own link** (`match.html?spectator=true&me=<name>`), one text each from **Share & message › Send the match to the other players**; it always shows the match from that player's pair. Texts are three lines.
- **No alerts in an Our Match round**, for anyone. Our Match inside a tournament still alerts.
- Standings: trending box → money table → PRESS buttons (if a pair can press) → **1st ball → 2nd / Nassau / Scorecards** buttons (one view open at a time; the nine being played first, play order once over; "↑ Pick another view" at the end) → **Presses made** fold with Undo (organizer only). No rules dropdown.

## Home Screen icons (iPhone)
- A texted link opens in Safari, never in an icon. An icon remembers the link it was saved from.
- Cart links are per person (`cart.html?cart=2&r=<round>&me=<name>`): the saved **JB Golf** icon finds his cart by name every later round, and only asks "Which cart are you in today?" if he isn't in one (or the icon predates names).
- Spectator, Our Match and results links save as **JB Watch** automatically. Once saved, opening it shows whatever round is on. Save from a *live* link, not a results link.

## Test copy
`?beta=1` (sticky; `?beta=0` or **Leave** exits). `BETA` prefixes localStorage keys and uses `beta_` Firestore docs, turns alerts off, adds `html.revamp`, and has its own layouts (4-step setup, Standings tabs, Home with a tab bar). John prefers the original look; new ideas go here first, gated by `BETA`, and move to the real app only when he says so.

## Mistakes a weaker model makes here
1. **Merging, or changing the real app, without being asked.** Wait for "merge"; try layout ideas in the test copy.
2. **Answering from memory.** Reproduce it in a test on the live build first; John's "it looks different" has been a real bug nearly every time.
3. **Testing only one view.** The organizer's CART tab, a real cart phone (`?cart=1&r=<id>`), a spectator link and a `me=` link are four different paths. Check the ones your change touches, and Past rounds if it touches Standings.
4. **Trusting Chromium to behave like an iPhone.** It won't zoom on small inputs, keeps no status-bar blur, and resets scroll differently. Assert positions and font sizes in the test instead (`zoomscan`, `noscroll`, `listjump`, `logo`).
5. **Setting scores in a test without saving them.** `scoresDb[..] = x` alone is wiped by the next cloud update; call `saveScoresToCloud`. Same for `matchPresses` (`activeTournamentRef.update`).
6. **Tests that can't fail.** End every test with `process.exit(fails ? 1 : 0)`, select buttons by id/`onclick` rather than wording, and run the new test against `origin/main` to see it fail.
7. **Doubling the back nine by hole number**, or assuming the round starts on 1. Use `getHoleSequenceFor(rd)` and play order.
8. **Showing a player the match from John's pair.** Anything a link shows (top box, table, scorecards order, buttons) must respect `omViewerFlipped`.
9. **Hard-coded colours or `group.color`**, which vanish on the light themes.
10. **Moving the page during scoring**, or adding a row that pushes the keypad off small phones. Run the fit checks.
11. **String edits that silently miss.** `index.html` has trailing spaces and near-duplicate lines; when scripting an edit, assert the target occurs exactly once.
12. **Forgetting the other copies of a feature:** the test copy's second `<script>`, Past rounds (`renderArchivedRound`), shared text (`TEXT SHARE`), How it works, and this file.
13. **Sending alerts where they don't belong** (Our Match, the test copy) or adding a share option that sends one.
14. **Offering 3-Ball to 2-player teams** or other impossible games; use `playableFormats`.
15. **Writing "side", "PR", "commit", "cache" to John.** Say pair, update, saved, "close the app and reopen it".

## Before saying a task is done
- [ ] Reproduced the problem (or the "before") on `origin/main`'s build.
- [ ] Added or updated a test in `tests/`, listed it in `run-all.sh`, and it fails on the old build.
- [ ] `bash tests/run-all.sh` prints `FAILS:` with nothing after it; fit checks pass if scoring changed.
- [ ] Looked at the screenshots yourself: phone width 375–430, at least one light theme if colours changed, nothing overlapping or cut off.
- [ ] Checked each affected view: organizer, cart, spectator/`me=` link, Past rounds, test copy.
- [ ] Our Match checked both starting on 1 and on 10 if money or order changed.
- [ ] How it works and this file updated if behaviour or names changed.
- [ ] `sw.js` cache bumped if a file was added; `?v=` bumped if a card picture changed.
- [ ] Committed, pushed, PR opened; John told in plain words what changed, shown a screenshot, and asked to say **merge**.

## Back burner (John's list)
- Two or more rounds at once / separate groups for other organizers · Venmo / Cash App · Season leaderboard · Turning the test copy's redesign on for everyone
