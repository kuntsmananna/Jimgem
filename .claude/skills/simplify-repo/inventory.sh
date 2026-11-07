#!/usr/bin/env bash
# Lists the repository's reviewable source files, grouped into batches.
#
# Usage: inventory.sh [--max N] [path-or-glob ...]
#   --max N   most files per batch (default 8); a bigger directory is split
#   paths     limit the sweep to these paths/globs (default: whole repo)
#
# Reads exclusions from project.md beside this script: every line of the
# form "- exclude: <glob>" (bash glob, '*' also matches '/').
# Output, one block per batch, in a stable order (a resume still matches
# work done by file, not by batch id, since new files can shift batches):
#   ## <batch-id> (<n> files)
#   <file>
#   ...
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel)"
cd "$root"

max=8
scope=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max) max="$2"; shift 2 ;;
    *) scope+=("$1"); shift ;;
  esac
done

# Source extensions worth reviewing. Data, content, lockfiles, images and
# SQL are left out by default: a standards pass is about code.
exts='ts|tsx|js|jsx|mjs|cjs|mts|cts|astro|vue|svelte|css|scss|py|sh|go|rs|rb'

excludes=(
  'node_modules/*' 'dist/*' 'build/*' '.next/*' 'out/*' 'coverage/*'
  '.simplify-repo/*' '.claude/*' '*.min.*' '*.d.ts' '*.generated.*'
  'public/*' 'vendor/*'
)
if [[ -f "$here/project.md" ]]; then
  while IFS= read -r pat; do excludes+=("$pat"); done < <(
    sed -n 's/^[[:space:]]*-[[:space:]]*exclude:[[:space:]]*`\{0,1\}\([^`]*\)`\{0,1\}[[:space:]]*$/\1/p' "$here/project.md"
  )
fi

in_scope() {
  local f="$1" s
  [[ ${#scope[@]} -eq 0 ]] && return 0
  for s in "${scope[@]}"; do
    s="${s%/}"
    [[ "$f" == $s || "$f" == "$s"/* ]] && return 0
  done
  return 1
}

excluded() {
  local f="$1" p
  for p in "${excludes[@]}"; do
    [[ "$f" == $p ]] && return 0
  done
  return 1
}

files=()
while IFS= read -r -d '' f; do
  [[ "$f" =~ \.($exts)$ ]] || continue
  [[ -f "$f" ]] || continue
  excluded "$f" && continue
  in_scope "$f" || continue
  files+=("$f")
done < <(git -c core.quotePath=false ls-files -z)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No reviewable files in scope." >&2
  exit 1
fi

# Sort by directory, then file, so a directory's files stay together even
# when it has subdirectories. A directory bigger than --max is split; small
# neighbouring directories in the same area (first three path parts, e.g.
# src/app/api) are packed together up to --max.
for f in "${files[@]}"; do
  d="${f%/*}"; [[ "$d" == "$f" ]] && d="."
  printf '%s\t%s\n' "$d" "$f"
done | LC_ALL=C sort -t $'\t' -k1,1 -k2,2 | awk -F '\t' -v max="$max" '
  function area(d,   p, n) {
    n = split(d, p, "/")
    return n <= 3 ? d : p[1] "/" p[2] "/" p[3]
  }
  function prefix(a, b,   pa, pb, n, m, i, out) {
    n = split(a, pa, "/"); m = split(b, pb, "/"); out = ""
    for (i = 1; i <= n && i <= m && pa[i] == pb[i]; i++)
      out = out (out == "" ? "" : "/") pa[i]
    return out == "" ? "." : out
  }
  function newbatch(id) { nb++; bid[nb] = id; bsize[nb] = 0 }
  function add(f) { bsize[nb]++; bfile[nb, bsize[nb]] = f }
  { dir[NR] = $1; file[NR] = $2; count[$1]++ }
  END {
    i = 1
    while (i <= NR) {
      d = dir[i]; c = count[d]
      if (c > max) {
        for (k = 0; k < c; k++) {
          if (k % max == 0) { newbatch(d "#" (k / max + 1)); open = 0 }
          add(file[i++])
        }
        continue
      }
      if (open && area(d) == carea && bsize[nb] + c <= max) {
        bid[nb] = prefix(bid[nb], d)
      } else {
        newbatch(d); open = 1; carea = area(d)
      }
      for (k = 0; k < c; k++) add(file[i++])
    }
    for (b = 1; b <= nb; b++) seen[bid[b]]++
    for (b = 1; b <= nb; b++) {
      id = bid[b] == "." ? "root" : bid[b]
      if (seen[bid[b]] > 1 && id !~ /#[0-9]+$/) id = id "#" (++num[bid[b]])
      printf "## %s (%d files)\n", id, bsize[b]
      for (k = 1; k <= bsize[b]; k++) print bfile[b, k]
      print ""
    }
  }
'
echo "Total: ${#files[@]} files" >&2
