#!/usr/bin/env bash
# Deploys the bot code to the VDS and restarts it (run from Git Bash in the project folder).
#   bash deploy/deploy-vds.sh            -> update code + dependencies, restart
#   bash deploy/deploy-vds.sh --first    -> first install: also copies .env and data/
# .env and data/ on the server are never overwritten by a normal deploy.
set -euo pipefail

HOST="${VDS_HOST:-vds}"
APP_DIR=/opt/deerpanel
cd "$(dirname "$0")/.."

FIRST=false
[[ "${1:-}" == "--first" ]] && FIRST=true

echo "==> Checking commands build"
npm run --silent check
npm run --silent check:locales

echo "==> Uploading code to $HOST:$APP_DIR"
FILES=(package.json package-lock.json src deploy/deerpanel.service deploy/deerpanel-backup.service deploy/deerpanel-backup.timer deploy/backup.sh)
$FIRST && FILES+=(.env data)
tar -czf - "${FILES[@]}" | ssh "$HOST" "
  set -e
  id deerpanel >/dev/null 2>&1 || useradd --system --home-dir $APP_DIR --shell /usr/sbin/nologin deerpanel
  mkdir -p $APP_DIR/data $APP_DIR/backups
  rm -rf $APP_DIR/src
  tar -xzf - -C $APP_DIR
  cp $APP_DIR/deploy/deerpanel.service $APP_DIR/deploy/deerpanel-backup.service $APP_DIR/deploy/deerpanel-backup.timer /etc/systemd/system/
  chown -R deerpanel:deerpanel $APP_DIR
  chmod 600 $APP_DIR/.env
  chmod 700 $APP_DIR/data $APP_DIR/backups
"

echo "==> Installing dependencies"
ssh "$HOST" "cd $APP_DIR && sudo -u deerpanel -H npm ci --omit=dev --no-audit --no-fund --cache $APP_DIR/.npm-cache --loglevel=error"

echo "==> Restarting service"
ssh "$HOST" "systemctl daemon-reload && systemctl enable deerpanel >/dev/null 2>&1 && systemctl enable --now deerpanel-backup.timer >/dev/null 2>&1 && systemctl restart deerpanel && sleep 8 && systemctl is-active deerpanel && journalctl -u deerpanel -n 6 --no-pager -o cat"
