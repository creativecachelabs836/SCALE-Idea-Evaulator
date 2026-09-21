#!/usr/bin/env bash
#
# S.C.A.L.E. Strategic Evaluator - launch script.
#
# Takes a fresh checkout to a running application: checks prerequisites,
# installs dependencies, creates local configuration, then starts the server in
# development or production mode.
#
# Safe to re-run. Every step is skipped when it has already been done, so the
# common case is a fast start rather than a reinstall.
#
# This script grows with the application: checks are added by the iteration
# that introduces the thing being checked, so it never verifies something that
# does not exist yet.
#
#   ./scripts/launch.sh                 development server on port 3000
#   ./scripts/launch.sh --prod          production build, then serve
#   ./scripts/launch.sh --port 4000     use a different port
#   ./scripts/launch.sh --check         run typecheck and tests first
#   ./scripts/launch.sh --help          full usage
#
set -euo pipefail

# Resolve the project root from this script's own location, so it works from
# any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

readonly MIN_NODE_MAJOR=20
readonly MIN_NODE_MINOR=9

MODE="dev"
PORT="${PORT:-3000}"
RUN_CHECKS=0
OPEN_BROWSER=0

# --- Output helpers -------------------------------------------------------
# Colour only when stdout is a terminal, so piped or logged output stays clean.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

step()  { printf '%s==>%s %s\n' "$C_CYAN$C_BOLD" "$C_RESET" "$1"; }
ok()    { printf '    %s+%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
skip()  { printf '    %s-%s %s\n' "$C_DIM" "$C_RESET" "$1"; }
warn()  { printf '    %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1" >&2; }
die()   { printf '\n%sError:%s %s\n\n' "$C_RED$C_BOLD" "$C_RESET" "$1" >&2; exit 1; }

usage() {
  cat <<'__USAGE__'
S.C.A.L.E. Strategic Evaluator - launch script

  ./scripts/launch.sh [options]

OPTIONS
    --dev               Development server with hot reload (default)
    --prod              Production build, then serve the built output
    -p, --port PORT     Port to listen on (default: 3000, or $PORT)
    --check             Run typecheck and tests before starting
    --open              Open the app in a browser once it is listening
    -h, --help          Show this message

EXAMPLES
    ./scripts/launch.sh
    ./scripts/launch.sh --prod --port 8080
    ./scripts/launch.sh --check --open

NOTES
    Re-running is cheap: dependency install, configuration and build steps are
    skipped when they are already up to date.

    The plan for this application, including what each iteration delivers, is
    in SPEC.md.
__USAGE__
}

# --- Argument parsing -----------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dev)      MODE="dev"; shift ;;
    --prod|--production) MODE="prod"; shift ;;
    -p|--port)
      [ $# -ge 2 ] || die "--port requires a value."
      PORT="$2"; shift 2 ;;
    --port=*)   PORT="${1#*=}"; shift ;;
    --check)    RUN_CHECKS=1; shift ;;
    --open)     OPEN_BROWSER=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          die "Unknown option: $1  (try --help)" ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) die "Port must be a number, got: $PORT" ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Port must be between 1 and 65535, got: $PORT"

printf '\n%sS.C.A.L.E. STRATEGIC EVALUATOR%s  %s%s mode%s\n\n' \
  "$C_BOLD" "$C_RESET" "$C_DIM" "$MODE" "$C_RESET"

# --- 1. Prerequisites -----------------------------------------------------
step "Checking prerequisites"

command -v node >/dev/null 2>&1 || die \
  "Node.js is not installed. Install Node ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} or newer: https://nodejs.org"
command -v npm >/dev/null 2>&1 || die "npm is not installed. It ships with Node.js."

NODE_VERSION="$(node -v)"            # e.g. v22.22.2
NODE_SEMVER="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_SEMVER%%.*}"
NODE_REST="${NODE_SEMVER#*.}"
NODE_MINOR="${NODE_REST%%.*}"

# Next.js requires >=20.9.0; the test runner needs 22+ for --experimental-strip-types.
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ] ||
   { [ "$NODE_MAJOR" -eq "$MIN_NODE_MAJOR" ] && [ "$NODE_MINOR" -lt "$MIN_NODE_MINOR" ]; }; then
  die "Node ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ is required, found ${NODE_VERSION}."
fi
ok "Node ${NODE_VERSION}, npm $(npm -v)"

if [ "$NODE_MAJOR" -lt 22 ] && [ "$RUN_CHECKS" -eq 1 ]; then
  warn "The test runner needs Node 22+; --check may fail on ${NODE_VERSION}."
fi

# --- 2. Dependencies ------------------------------------------------------
step "Checking dependencies"

# node_modules/.package-lock.json is written by npm on every install. Comparing
# it to package-lock.json is how we tell a stale tree from a current one.
INSTALLED_MARKER="node_modules/.package-lock.json"
if [ ! -d node_modules ]; then
  ok "Installing (no node_modules yet); this takes a minute"
  npm install
elif [ ! -f "$INSTALLED_MARKER" ] || [ package-lock.json -nt "$INSTALLED_MARKER" ]; then
  ok "Lockfile changed since the last install; syncing"
  npm install
else
  skip "Dependencies already up to date"
fi

# --- 3. Local configuration ----------------------------------------------
step "Checking configuration"

if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.local
    ok "Created .env.local from .env.example"
  else
    warn ".env.example is missing; continuing with built-in defaults"
  fi
else
  skip ".env.local already exists"
fi

# --- 4. Optional checks ---------------------------------------------------
if [ "$RUN_CHECKS" -eq 1 ]; then
  step "Running checks"
  npm run typecheck
  ok "Typecheck passed"
  npm test
  ok "Tests passed"
fi

# --- 5. Port availability -------------------------------------------------
step "Checking port ${PORT}"

# Attempting the bind is the only authoritative test, and it is exactly what
# the server is about to do. Inspection tools are deliberately not used here:
# lsof and ss report nothing for network sockets in some sandboxed and
# containerized environments, and their empty output is indistinguishable from
# a genuinely free port -- which would turn this friendly check into a raw
# EADDRINUSE stack trace from Next.js.
#
# Probing 0.0.0.0 matches the interface Next.js binds by default, and on every
# supported platform it also conflicts with a listener bound only to loopback,
# so this is the strictest of the available probes.
port_in_use() {
  node -e '
    const net = require("net");
    const s = net.createServer();
    s.once("error", (e) => process.exit(e.code === "EADDRINUSE" ? 0 : 1));
    s.once("listening", () => s.close(() => process.exit(1)));
    s.listen(Number(process.argv[1]), "0.0.0.0");
  ' "$1" 2>/dev/null
}

if port_in_use "$PORT"; then
  die "Port ${PORT} is already in use.
       Stop whatever is listening, or launch with --port $((PORT + 1))."
fi
ok "Port ${PORT} is free"

# --- 6. Build (production only) -------------------------------------------
if [ "$MODE" = "prod" ]; then
  step "Building for production"
  npm run build
  ok "Build complete"
fi

# --- 7. Launch ------------------------------------------------------------
URL="http://localhost:${PORT}"

printf '\n%s%s%s\n' "$C_BOLD" "────────────────────────────────────────────────────────" "$C_RESET"
printf '  %sReady%s   %s%s%s\n' "$C_GREEN$C_BOLD" "$C_RESET" "$C_BOLD" "$URL" "$C_RESET"
printf '  Mode    %s\n' "$MODE"
printf '  Plan    SPEC.md\n'
printf '%s%s%s\n\n' "$C_BOLD" "────────────────────────────────────────────────────────" "$C_RESET"

if [ "$OPEN_BROWSER" -eq 1 ]; then
  # Give the server a moment to bind before pointing a browser at it.
  ( sleep 3
    if command -v open >/dev/null 2>&1; then open "$URL"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
    fi >/dev/null 2>&1 || true
  ) &
fi

# exec replaces this shell with the server, so Ctrl-C reaches Next.js directly
# and the process exits with the server's own status code.
if [ "$MODE" = "prod" ]; then
  exec npx next start -p "$PORT"
else
  exec npx next dev -p "$PORT"
fi
