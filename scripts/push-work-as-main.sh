#!/usr/bin/env bash
set -euo pipefail

REMOTE_NAME="${1:-origin}"
WORK_BRANCH="${2:-work}"
MAIN_BRANCH="${3:-main}"

# Ensure we are inside the repo root
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "[push-work-as-main] Error: not inside a Git repository" >&2
  exit 1
fi

if ! git show-ref --verify --quiet "refs/heads/${WORK_BRANCH}"; then
  echo "[push-work-as-main] Error: local branch '${WORK_BRANCH}' not found" >&2
  exit 1
fi

if ! git remote get-url "$REMOTE_NAME" > /dev/null 2>&1; then
  echo "[push-work-as-main] Error: remote '${REMOTE_NAME}' is not configured" >&2
  echo "Добавьте его командой: git remote add ${REMOTE_NAME} <url>" >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$WORK_BRANCH" ]]; then
  echo "[push-work-as-main] Switching to '${WORK_BRANCH}'"
  git checkout "$WORK_BRANCH"
fi

echo "[push-work-as-main] Fetching updates from '${REMOTE_NAME}'"
git fetch "$REMOTE_NAME" --prune

echo "[push-work-as-main] Pushing '${WORK_BRANCH}' to '${REMOTE_NAME}/${MAIN_BRANCH}'"
git push "$REMOTE_NAME" "${WORK_BRANCH}:${MAIN_BRANCH}"

echo "[push-work-as-main] Setting upstream for '${WORK_BRANCH}' -> '${REMOTE_NAME}/${MAIN_BRANCH}'"
git branch --set-upstream-to="${REMOTE_NAME}/${MAIN_BRANCH}" "$WORK_BRANCH"

echo "[push-work-as-main] Done. Subsequent pushes can use: git push"
