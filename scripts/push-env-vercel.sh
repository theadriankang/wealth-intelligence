#!/usr/bin/env bash
# Push the non-empty variables from .env into Vercel.
#
# `vercel env add NAME <env>` normally PROMPTS for the value; it never reads .env on its own.
# It does accept the value on stdin, which is what this does — so the local file stays the
# single source of truth instead of you retyping secrets into a terminal prompt.
#
#   ./scripts/push-env-vercel.sh production
#   ./scripts/push-env-vercel.sh preview
#
# Re-running replaces an existing value (the old one is removed first). Nothing is echoed.
set -euo pipefail

TARGET="${1:-production}"
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "no .env here"; exit 1; }

# PORT is Vercel's to set. OFFLINE is a local-dev switch. The blanks are skipped automatically.
SKIP="PORT OFFLINE"

while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue ;; esac
  [ -n "$value" ] || continue
  case " $SKIP " in *" $key "*) echo "skip  $key"; continue ;; esac

  vercel env rm "$key" "$TARGET" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" "$TARGET" >/dev/null
  echo "push  $key"
done < .env

echo
echo "Done. Env changes do not apply to existing deployments — redeploy:"
echo "  vercel --prod"
