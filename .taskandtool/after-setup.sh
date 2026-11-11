#!/usr/bin/env bash
# Run by Task & Tool once setup.sh has succeeded, so the app is already up:
# tt-crawl (github.com/taskandtool/crawler), the browsers it reads sites with,
# and overturemaps, which finds businesses and boundaries. Also after a machine
# replacement. Safe to re-run any time, which moves the crawler to its latest:
#
#     bash ~/app/.taskandtool/after-setup.sh
#
# Exits non-zero if either cannot run, so the platform tries again.
set -euo pipefail

CRAWLER_REF="${CRAWLER_REF:-main}"
CRAWLER="git+https://github.com/taskandtool/crawler@$CRAWLER_REF"
PIP="python3 -m pip install --quiet --disable-pip-version-check"

echo "== tt-crawl $CRAWLER_REF"
if python3 -c "import ttcrawl" 2>/dev/null; then
  # pip keeps an installed version it thinks is current, so moving to the
  # latest takes both: the first for its dependencies, the second for its code.
  $PIP --upgrade "ttcrawl @ $CRAWLER"
  $PIP --force-reinstall --no-deps "ttcrawl @ $CRAWLER"
else
  $PIP "ttcrawl @ $CRAWLER"
fi
python3 -c "import PIL" 2>/dev/null || $PIP pillow

echo "== the browsers"
python3 -m ttcrawl setup
python3 -m ttcrawl --version

echo "== overturemaps"
command -v overturemaps >/dev/null 2>&1 || $PIP overturemaps
overturemaps --help >/dev/null
