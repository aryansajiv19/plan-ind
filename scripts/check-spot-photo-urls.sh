#!/bin/sh
# Pre-apply gate for a photo migration: every photo_url in the file must
# resolve to a real image in the bucket BEFORE the migration runs. Migration
# 039 was held for exactly this reason -- a broken image is worse than a null.
#
#   sh scripts/check-spot-photo-urls.sh supabase/migration-046-*.sql
#
# Prints ok/BLOCK per URL and exits non-zero if any BLOCK. The bucket is
# public, so this needs no key of any kind.
#
# CONTENT TYPE, NOT JUST THE STATUS. A missing object in a public Supabase
# bucket answers with a JSON error body, and some paths answer 200 with it, so
# "did it respond?" is not the question -- "is it an image?" is.
set -u
[ $# -eq 1 ] || { echo "usage: $0 <migration.sql>"; exit 2; }
file=$1
urls=$(grep -oE "https://[^']+/storage/v1/object/public/spot-photos/[^']+" "$file" | sort -u)
[ -n "$urls" ] || { echo "BLOCK: no spot-photos URLs found in $file"; exit 1; }

fail=0
for url in $urls; do
  headers=$(curl -sS -m 20 -o /dev/null -D - "$url" 2>/dev/null)
  status=$(printf '%s' "$headers" | awk 'NR==1{print $2}')
  type=$(printf '%s' "$headers" | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tr -d '\r' | tail -1)
  name=${url##*/}
  case "$status:$type" in
    200:image/*) echo "ok    $name ($type)" ;;
    200:*)       echo "BLOCK $name: 200 but content-type is '$type', not an image"; fail=1 ;;
    "":*)        echo "BLOCK $name: no response"; fail=1 ;;
    *)           echo "BLOCK $name: HTTP $status"; fail=1 ;;
  esac
done
[ "$fail" -eq 0 ] && echo "all photo URLs resolve to images" || echo "DO NOT APPLY: fix the uploads first"
exit $fail
