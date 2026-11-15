#!/usr/bin/env bash
set -euo pipefail

patterns=(
  "Co-authored-by trailer crediting Claude" '^[[:space:]]*co-authored-by:.*claude'
  "Co-authored-by trailer using an Anthropic address" '^[[:space:]]*co-authored-by:.*anthropic\.com'
  "\"Generated with Claude Code\" footer" 'generated (with|by) \[claude code\]\('
  "Claude Code session link" 'claude\.ai/code/session_'
  "Claude session trailer" '^[[:space:]]*claude-session:'
  "commit authored or committed by Claude" '^(author|committer) .*(claude|anthropic\.com)'
)

usage() {
  cat <<'USAGE'
usage: scripts/check-attribution.bash <command> <arg>

  message <file>   check a commit message file (the commit-msg hook)
  pr <number>      check a pull request's title, description, commit messages and commit authors (needs gh)
  range <a>..<b>   check the commit messages and authors in a git range
USAGE
}

scan() {
  local text="$1" matched="" description pattern hits i
  for ((i = 0; i < ${#patterns[@]}; i += 2)); do
    description="${patterns[i]}"
    pattern="${patterns[i + 1]}"
    if hits="$(printf '%s\n' "$text" | tr -d '\r' | grep -inE "$pattern")"; then
      matched="${matched}  ${description}:"$'\n'"$(printf '%s\n' "$hits" | sed 's/^/    /')"$'\n'
    fi
  done
  if [[ -n "$matched" ]]; then
    echo "AI attribution found. Commits and pull requests here are authored by people alone."
    echo
    printf '%s' "$matched"
    echo
    echo "Remove those lines (and reset the author with git commit --amend --reset-author), then try again."
    return 1
  fi
}

message() {
  scan "$(sed '/^# *-\{1,\} *>8 *-\{1,\}/,$d' "$1" | git stripspace --strip-comments)"
}

pr() {
  command -v gh >/dev/null 2>&1 || { echo "gh is not installed: https://cli.github.com" >&2; exit 1; }
  local lines
  lines="$(gh pr view "$1" --json title,body,commits --jq '
    "title: " + .title,
    (.body // "" | split("\n")[] | "description: " + .),
    (.commits[] |
      ("author " + ([.authors[] | .name + " <" + .email + ">"] | join(", ")) + " (commit " + .oid[0:8] + ")"),
      ("commit " + .oid[0:8] + ": " + .messageHeadline),
      (.messageBody | split("\n")[] | "commit body: " + .))')" ||
    { echo "could not read pull request #$1 (in CI, set GH_TOKEN)" >&2; exit 1; }
  scan "$lines"
}

range() {
  scan "$(git log --format='author %an <%ae>%ncommitter %cn <%ce>%n%B' "$1")"
}

case "${1:-}" in
  message) message "${2:?message file required}" ;;
  pr) pr "${2:?pull request number required}" ;;
  range) range "${2:?range required, e.g. origin/main..HEAD}" ;;
  *)
    usage
    exit 1
    ;;
esac
