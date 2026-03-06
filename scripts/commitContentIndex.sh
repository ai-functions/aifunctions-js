#!/usr/bin/env bash
# Commit the library index in the .content repo after running content:index.
# Usage: from repo root, ./scripts/commitContentIndex.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTENT="$ROOT/.content"
if [[ ! -d "$CONTENT/.git" ]]; then
  echo ".content is not a git repo. Nothing to commit."
  exit 0
fi
if [[ ! -f "$CONTENT/skills/index.v1.json" ]]; then
  echo "No library index at .content/skills/index.v1.json. Run: npm run content:index"
  exit 0
fi
cd "$CONTENT"
git add skills/index.v1.json skills/index/v1 2>/dev/null || true
if git diff --staged --quiet 2>/dev/null; then
  echo "No index changes to commit in .content"
  exit 0
fi
git commit -m "chore: update library index (skills/index.v1.json and per-skill entries)"
echo "Committed library index in .content"
