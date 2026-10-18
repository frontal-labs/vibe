#!/bin/bash

INPUT=$(cat)

# Fail closed: if the hook input cannot be parsed, block rather than allow.
if ! COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command' 2>/dev/null); then
  echo "BLOCKED: could not parse the hook input; refusing to run an unchecked command." >&2
  exit 2
fi

# Best-effort normalization: drop git global options (-C <path>, -c <kv>, --git-dir=...,
# --no-pager, ...) between `git` and the subcommand, and collapse whitespace.
# This is a guardrail, not a security boundary.
COMMAND=$(echo "$COMMAND" | sed -E \
  -e 's/(^|[;&|][[:space:]]*)git[[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+[[:space:]]+)+/\1git /g' \
  -e 's/(^|[;&|][[:space:]]*)git[[:space:]]+(--[a-z-]+(=[^[:space:]]+)?[[:space:]]+)+/\1git /g' \
  | tr -s '[:space:]' ' ')

DANGEROUS_PATTERNS=(
  "git push"
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "reset --hard"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
