#!/bin/sh
# Runs every automated test. Needs node 18+, python 3.9+, and (for the browser check) google-chrome.
set -e
cd "$(dirname "$0")"
node focuslog/test.js | tail -1
node weekplan/test.js | tail -1
(cd selftest && python3 -m unittest discover -s tests 2>&1 | tail -3)
if command -v google-chrome >/dev/null; then
  for app in focuslog weekplan; do
    echo "browser flow: $app"
    google-chrome --headless=new --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=30000 \
      --dump-dom "file://$PWD/$app/e2e.html" 2>/dev/null | sed -n '/id="result"/,/<\/pre>/p' | sed 's/.*result">//; s/<\/pre>.*//; s/<iframe.*//'
  done
fi
