#!/bin/bash
# Runs the whole suite (headless Chromium via Playwright); prints failing tests and their first lines.
# Usage: bash tests/run-all.sh
cd "$(dirname "$0")"
mkdir -p shots
out="${TMPDIR:-/tmp}/jbgolf-tests"; mkdir -p "$out"
fails=""
for t in om-only board-fit archdel auth cartpick help-shot whos vcf links scroll-lock money home batch1 balance picker history players-db tees alert-prefs alerts alerts2 theme-alerts multi keypad names cart-end setup scramble-edit cancel-edit fin texts om-ui om-default admin-msg c3-real cart-new3 skins-group res-alerts older net-edit om-full alerts-diag dupes sidebets fin-text allgames cleanup beta live revamp themes-rv undo fairway-real noscroll listjump om-back unpress zoomscan zoomshots omsplit omview omflip pairlabels permatch watchicon cartme omtabs logo om-noalerts omshare; do
  timeout 120 node "$t.js" > "$out/$t.txt" 2>&1 || fails="$fails $t"
done
echo "FAILS:$fails"
for f in $fails; do echo "== $f"; grep -v "^PASS" "$out/$f.txt" | grep -v agent-proxy | head -6; done
