#!/usr/bin/env bash
# One-step setup for Ubuntu/Debian. Run from the project folder:  bash setup-ubuntu.sh
set -e

need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -p "process.versions.node.split('.')[0]")
  [ "$major" -ge 16 ] && need_node=0
fi

sudo apt-get update
sudo apt-get install -y wget curl ca-certificates zip
if [ "$need_node" = 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

npm install

# Optional but recommended: headless Chromium for JavaScript-heavy sites.
# Without it the app automatically falls back to wget.
if [ "$1" != "--no-browser" ]; then
  npm run setup-browser || echo "Browser install failed; the app will use wget only."
fi

echo
echo "Done. Start the app with:  npm start   then open http://localhost:3000"
