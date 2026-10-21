#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 iniciar-offline.py
elif command -v node >/dev/null 2>&1; then
  exec node iniciar-offline-node.mjs
else
  printf '%s\n' 'Instale Python 3 ou Node.js antes de ficar sem internet.'
  exit 1
fi
