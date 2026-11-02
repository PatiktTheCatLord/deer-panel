#!/bin/sh
# Daily backup of the bot data (run by deerpanel-backup.timer). Keeps the newest 14 copies.
# Restore: systemctl stop deerpanel
#          gunzip -c /opt/deerpanel/backups/settings-YYYY-MM-DD.json.gz > /opt/deerpanel/data/settings.json
#          chown deerpanel:deerpanel /opt/deerpanel/data/settings.json && systemctl start deerpanel
set -eu

# The bot folder is the one above this script (e.g. /opt/deerpanel), so any install location works.
APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
DATA=$APP_DIR/data/settings.json
DIR=$APP_DIR/backups
KEEP=14

mkdir -p "$DIR"
# settings.json is always replaced in one step (write + rename), so copying it is safe while the bot runs.
gzip -c "$DATA" > "$DIR/settings-$(date -u +%F).json.gz.tmp"
mv "$DIR/settings-$(date -u +%F).json.gz.tmp" "$DIR/settings-$(date -u +%F).json.gz"

ls -1t "$DIR"/settings-*.json.gz | tail -n +$((KEEP + 1)) | xargs -r rm --
echo "Backup done: $(ls -1 "$DIR"/settings-*.json.gz | wc -l) copies kept"
