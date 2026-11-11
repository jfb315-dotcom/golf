# JB Golf — project notes

The golf app for John's group: sign-ups, teams, live scoring from each cart, money, Our Match, past rounds.
Served by GitHub Pages at `jfb315-dotcom.github.io/golf/`. Data in Firebase (project `golf-327be`, Firestore under `tournaments/`).

## Files
- `index.html` — the whole app (vanilla JS, one file).
- `cart.html`, `live.html`, `match.html`, `results.html`, `join.html` — link landing pages: each has its own preview card for Messages, then opens `index.html` with the same link details.
- `sw.js` — offline cache. Bump `CACHE` when adding files to `APP_FILES`.
- `manifest.json` / `logo.png` — the **JB Golf** Home Screen icon. `manifest-watch.json` / `logo-watch*.png` — the **JB Watch** icon.
- `firebase/` — Firestore rules. `cloudflare/` — the alerts worker.
- `tests/` — the test suite (see below).

## Working with John
- John is not a developer. Explain in plain words, no jargon; show screenshots of changes.
- Flow: build → run the tests → commit and push to the working branch → open a PR → wait for John to say **merge**. Then merge (with the head SHA) and reset the working branch to `main`.
- **Always update "How it works"** (`#step-help` in `index.html`) in the same change whenever a change affects how something is used or what it's called. Keep it accurate and plain; it's the in-app guide.
- **Always run `bash tests/run-all.sh`** before pushing, and add or update a test for each change. Every test must pass.
- Typing boxes must use text of at least 16px, or iPhones zoom the page in (`zoomscan` test checks every screen).

## Test copy
`?beta=1` is a separate copy for trying new layouts (orange TEST COPY strip). It stores its rounds apart from the real ones (`beta_` documents), sends no alerts, and its look is switched on by `html.revamp`. John prefers the original look for now, so the redesign stays in the test copy until he says otherwise.

## Our Match (2 on 2, the four of them)
- Started from Home's **⛳ Our Match** button (2 teams of 2, no tournament purse, no side bets). A tournament can also include it: "Our Match within this tournament?" at the bottom of setup.
- Games, per person: Nassau (front, back, overall; low ball; net if "strokes count on the Nassau"; each pair one press per bet; presses can be undone), 1st ball goes to 2nd ball (auto new bet when the newest goes 1 down), team birdies (gross; eagle = 2).
- **The second nine played is double** (start on 10: 10–18 single, 1–9 double).
- Say **pair**, never "side" (side sounds like front/back nine). Pair pickers show the players' initials once picked.
- John keeps the score. The others follow with **per-person links** (`match.html?spectator=true&me=<full name>`): the link finds which pair that player is in for that match and shows it from his pair's side (names first, + when they're up). Sent one text per player from **Share & message › Send the match to the other players** (also Share results link and after Finalize). Old pair links (`om=2`) still work.
- Our Match links are short (three lines) and never pitch alerts: the players are on the course with John.
- **Standings layout:** trending box and money table on top, PRESS buttons under them (when a pair can press), then three buttons — **1st ball → 2nd / Nassau / Scorecards** — that open one view at a time (the nine being played first; play order once it's over; "↑ Pick another view" at the end scrolls back up to the buttons). No colour coding in the charts: the winning score is bold and bigger. **Presses made** (with Undo) is a folded dropdown at the bottom, organizer only. No rules dropdown on Our Match rounds (they're in How it works).

## Home Screen icons (iPhone) — how it really works
- A link in a text always opens in **Safari**, never in a Home Screen icon.
- A Home Screen icon remembers **the link it was saved from** (no `start_url` in the manifests). Adding again makes a second icon.
- **JB Golf** icon: scoring. Cart links are **per person** too (`cart.html?cart=2&r=<round>&me=<full name>`, sent one text per player from **Share & message › Text live links to carts**). Saved to the Home Screen, it finds his cart by name in every later round: when a tournament starts he just opens JB Golf, no link, no question. It asks "Which cart are you in today?" only if he isn't in any cart that round (or the icon came from an older one-link-per-cart text, which has no name).
- **JB Watch** icon: following along. Spectator, Our Match and results links save as "JB Watch" with the WATCH logo automatically.
  - Once JB Watch is on a player's phone he doesn't need the link: opening it shows whatever round is being played right then.
  - Save it from a **live** link, not a results link (a results link always opens that one finished round).
  - Our Match players should save it from John's Our Match text (it carries who he is, so every match shows from his pair's side).
  - With no round going, it says the round is over and picks up again when the next one starts.
- Alerts only work from a Home Screen icon, and belong to the icon they were turned on in.

## Tests
`bash tests/run-all.sh` runs every test headless (Playwright + Chromium; `tests/stub.js` stands in for Firebase). Screenshots go to `tests/shots/` (not committed). Extra checks not in the run: `fit.js`/`fit2.js`/`fit3.js` (scoring fits on iPhone SE / 14 / Pro Max without scrolling), `sim.js` (simulated rounds: `node tests/sim.js <first> <count>`).

## Back burner (John's list)
- Two or more rounds going at once / separate groups for other organizers
- Venmo / Cash App
- Season leaderboard
- Turning the test copy's redesign on for everyone
