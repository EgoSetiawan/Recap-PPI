#!/usr/bin/env bash
# Full QA run with live, readable stage output.
#
#   bash scripts/qa-watch.sh                # all gates
#   bash scripts/qa-watch.sh --verbose      # ...and print every test/subtest name
#   bash scripts/qa-watch.sh --fail-fast    # stop at the first failing gate
#   bash scripts/qa-watch.sh --no-e2e       # skip the Playwright stage
#
# Output streams to the terminal and is mirrored to .qa/last.log, so a second
# shell can follow along with:  tail -f .qa/last.log

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

LOG_DIR="$ROOT/.qa"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/last.log"
: >"$LOG"

FAIL_FAST=0
VERBOSE=0
RUN_E2E=1
for arg in "$@"; do
  case "$arg" in
    --fail-fast) FAIL_FAST=1 ;;
    --verbose|-v) VERBOSE=1 ;;
    --no-e2e) RUN_E2E=0 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) printf 'unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_BLUE=$'\033[38;5;39m'; C_GREEN=$'\033[38;5;42m'
  C_RED=$'\033[38;5;203m'
else
  C_RESET=''; C_DIM=''; C_BOLD=''; C_BLUE=''; C_GREEN=''; C_RED=''
fi

say()   { printf '%b\n' "$*" | tee -a "$LOG"; }
head2() { printf '\n%b\n' "${C_BLUE}${C_BOLD}━━━ $* ━━━${C_RESET}" | tee -a "$LOG"; }

PASSED=(); FAILED=(); TIMES=()

now_ms() { date +%s%3N; }

run_stage() {
  local name="$1" cmd="$2" start end secs rc

  head2 "$name"
  say "${C_DIM}\$ $cmd${C_RESET}"

  start=$(now_ms)
  # Stream live, tee into the log, and keep the stage's real exit code.
  set -o pipefail
  eval "$cmd" 2>&1 | tee -a "$LOG"
  rc=$?
  set +o pipefail

  end=$(now_ms)
  secs=$(awk -v a="$start" -v b="$end" 'BEGIN{printf "%.1f", (b-a)/1000}')
  TIMES+=("$name ${secs}s")

  if [[ $rc -eq 0 ]]; then
    say "${C_GREEN}✓ PASS${C_RESET} ${C_DIM}(${secs}s)${C_RESET}"
    PASSED+=("$name")
  else
    say "${C_RED}✗ FAIL${C_RESET} ${C_DIM}(exit $rc, ${secs}s)${C_RESET}"
    FAILED+=("$name")
    [[ $FAIL_FAST -eq 1 ]] && return 1
  fi
  return 0
}

START=$(now_ms)
say "${C_BOLD}Recap-PPI · full QA${C_RESET}  ${C_DIM}$(date '+%Y-%m-%d %H:%M:%S') · $(uname -srm)${C_RESET}"
say "${C_DIM}log: $LOG${C_RESET}"

command -v go  >/dev/null 2>&1 || { say "${C_RED}go not found in PATH${C_RESET}";  exit 127; }
command -v npx >/dev/null 2>&1 || { say "${C_RED}npx not found in PATH${C_RESET}"; exit 127; }

# -count=1 defeats the test cache so every run really executes the tests.
TEST_FLAGS="-count=1"
[[ $VERBOSE -eq 1 ]] && TEST_FLAGS="$TEST_FLAGS -v"

run_stage "Backend · go test"   "go -C backend test $TEST_FLAGS ./..." || exit 1
run_stage "Backend · go vet"    "go -C backend vet ./..."               || exit 1
run_stage "Frontend · eslint"   "npx eslint ."                          || exit 1
run_stage "Frontend · prettier" "npx prettier . --check"                || exit 1

# Playwright boots the frontend itself but needs the API and its database up.
# It is a local-only tool (bash scripts/e2e-setup.sh), so skip the stage when it
# is not installed instead of failing the whole run.
if [[ $RUN_E2E -eq 1 ]]; then
  if [[ -f qa/playwright.config.js ]]; then
    run_stage "Frontend · e2e" "npx playwright test --config qa/playwright.config.js" || exit 1
  else
    say "${C_DIM}skipping e2e — Playwright not installed (bash qa/e2e-setup.sh)${C_RESET}"
  fi
fi

END=$(now_ms)
TOTAL=$(awk -v a="$START" -v b="$END" 'BEGIN{printf "%.1f", (b-a)/1000}')

head2 "Summary"
for t in "${TIMES[@]}"; do
  say "  ${C_DIM}•${C_RESET} $t"
done
say ""
say "  ${C_GREEN}passed${C_RESET} ${#PASSED[@]}  ${C_RED}failed${C_RESET} ${#FAILED[@]}  ${C_DIM}total ${TOTAL}s${C_RESET}"

if [[ ${#FAILED[@]} -eq 0 ]]; then
  say "\n${C_GREEN}${C_BOLD}QA GREEN${C_RESET} — all gates passed in ${TOTAL}s"
  exit 0
fi

say "\n${C_RED}${C_BOLD}QA RED${C_RESET} — ${#FAILED[@]} gate(s) failed in ${TOTAL}s: ${FAILED[*]}"
exit 1
