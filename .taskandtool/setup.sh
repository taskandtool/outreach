#!/usr/bin/env bash
# Outreach Starter App setup. Task & Tool runs this in ~/app after the
# repository is cloned onto the machine, and again whenever the machine is
# replaced. Safe to re-run any time:
#
#     bash ~/app/.taskandtool/setup.sh
#
# The app's own files arrive with the clone, and the owner's working knowledge
# (companies.csv, raw/, records/, data/, outreach/) from backups. tt-crawl, its
# browsers and overturemaps are after-setup.sh's, once the site is up.
set -euo pipefail

echo "== outreach starter app: setup in $(pwd)"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "node and npm are required (Node 20 or newer); install them and re-run" >&2
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "Node $(node --version) found; the site needs Node 20 or newer (nvm install 22)" >&2
  exit 1
fi

echo "== npm install"
npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error

echo "== building the CSS"
npm run --silent css

# The web service, which the manifest's `ready` check looks for: a failure here fails the setup.
if [ -f "$HOME/tools/taskandtool.py" ]; then
  echo "== serving dev (npm run dev on port 3000)"
  python3 "$HOME/tools/taskandtool.py" serve "npm run dev" --port 3000
fi

echo "== outreach setup done. Next: dev answers at localhost:3000; choosing a niche takes tt-crawl and overturemaps, which after-setup.sh installs"
