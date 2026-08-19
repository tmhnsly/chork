#!/usr/bin/env bash
# Dump a database, restore it into an EMPTY Supabase stack, prove the
# copy matches. The drill, as one script, so the CI job that runs it
# against production and the self-test that runs it against a local
# stack are the same code.
#
#   restore-drill.sh <source-psql-url> <target-psql-url> <supabase db dump source flags...>
#
#   e.g.  restore-drill.sh "$SUPABASE_DB_URL" "$LOCAL_DB_URL" --db-url "$SUPABASE_DB_URL"
#         restore-drill.sh "$STACK_A_DB_URL" "$STACK_B_DB_URL" --local
#
# Three dumps the way Supabase documents a project migration — roles,
# schema, data — then the documented psql one-liner into the target,
# then scripts/backup/inventory.sql on both ends and a diff, then an
# RLS probe on the copy. Writes a Markdown table to $GITHUB_STEP_SUMMARY
# when that exists. Deletes the dump files however it exits: nothing
# with production rows in it outlives the run.
#
# Never prints either URL. Never `set -x`.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <source-psql-url> <target-psql-url> <supabase db dump source flags...>" >&2
  exit 2
fi
SOURCE_URL="$1"; TARGET_URL="$2"; shift 2
DUMP_ARGS=("$@")

HERE="$(cd "$(dirname "$0")" && pwd)"
INVENTORY="$HERE/inventory.sql"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

step() { printf '\n\033[1m— %s\033[0m\n' "$*"; }

step "dump: roles, schema, data"
supabase db dump "${DUMP_ARGS[@]}" -f "$WORK/roles.sql"  --role-only
supabase db dump "${DUMP_ARGS[@]}" -f "$WORK/schema.sql"
supabase db dump "${DUMP_ARGS[@]}" -f "$WORK/data.sql"   --data-only --use-copy
wc -c "$WORK"/roles.sql "$WORK"/schema.sql "$WORK"/data.sql | sed 's#'"$WORK"'/##'
# The role file is tiny and carries no passwords (`--no-role-passwords`);
# show it, because a restore that fails usually fails HERE — a role
# setting the target's postgres may not set — and line numbers beat
# guessing.
echo "roles.sql:"; nl -ba "$WORK/roles.sql"

step "restore into the empty target"
# Supabase's documented recipe, verbatim: one transaction, stop on the
# first error, triggers and FK checks off for the data load.
psql "$TARGET_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --quiet \
  --file "$WORK/roles.sql" \
  --file "$WORK/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$WORK/data.sql"

step "inventory both ends"
psql "$SOURCE_URL" -At -F '|' -f "$INVENTORY" | LC_ALL=C sort > "$WORK/source.txt"
psql "$TARGET_URL" -At -F '|' -f "$INVENTORY" | LC_ALL=C sort > "$WORK/restored.txt"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Restore drill — source vs restored copy"
    echo
    echo '| fact | source | restored |'
    echo '|---|---|---|'
    join -t '|' "$WORK/source.txt" "$WORK/restored.txt" \
      | sed 's/^\([^|]*\)|\([^|]*\)|\(.*\)$/| \1 | \2 | \3 |/'
  } >> "$GITHUB_STEP_SUMMARY"
fi

if diff -u "$WORK/source.txt" "$WORK/restored.txt"; then
  echo "restored copy matches the source: every table, every RLS flag, every policy, function, index, trigger and cron job, and every row count."
else
  echo "::error::the restored copy differs from the source — see the diff above. A shape difference is a lost object; a rows difference is a table the dump did not carry (or a live write between dump and count)."
  exit 1
fi

step "RLS is live in the copy"
# Same rows as the source, so prove the guard came back with them: an
# anonymous reader must see nothing.
n=$(psql "$TARGET_URL" -At -c "set role anon; select count(*) from public.route_logs;")
if [ "$n" != "0" ]; then
  echo "::error::anon can read $n route_logs rows in the restored copy — RLS did not come back with the schema."
  exit 1
fi
echo "anon sees 0 route_logs rows in the copy."
