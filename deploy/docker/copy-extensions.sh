#!/bin/sh
# Copy selected UI extension bundles to /tmp/extensions/.
#
# Set ENABLED_EXTENSIONS to a comma-separated list of extension names
# to copy only those bundles (e.g. "metrics,backups,argoplane").
# If ENABLED_EXTENSIONS is empty or unset, all bundles are copied.

set -e

if [ -z "$ENABLED_EXTENSIONS" ]; then
  cp -r /extensions/. /tmp/extensions/
  exit 0
fi

IFS=','
for ext in $ENABLED_EXTENSIONS; do
  ext=$(echo "$ext" | xargs)
  src="/extensions/extension-${ext}.js"
  if [ -f "$src" ]; then
    cp "$src" /tmp/extensions/
  fi
done
