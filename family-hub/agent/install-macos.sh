#!/bin/bash
# Installs the Family Hub agent on a Mac as a background service that starts
# at boot (no login needed) and restarts itself if it ever stops.
#
#   ./install-macos.sh            install or update
#   ./install-macos.sh uninstall  remove the service (keeps your config)
set -euo pipefail

LABEL="com.jansick.familyhub"
RUN_USER="${SUDO_USER:-$USER}"
HOME_DIR=$(eval echo "~$RUN_USER")
APP_DIR="$HOME_DIR/Library/Application Support/FamilyHub"
LOG_DIR="$HOME_DIR/Library/Logs/FamilyHub"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
PYTHON="/usr/bin/python3"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "uninstall" ]]; then
  sudo launchctl bootout system "$PLIST" 2>/dev/null || true
  sudo rm -f "$PLIST"
  echo "Removed the Family Hub service. Config left in: $APP_DIR"
  echo "Devices it blocked stay blocked until you unblock them in the UniFi app."
  exit 0
fi

if ! "$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
  echo "Python 3.9+ is needed. Run: xcode-select --install   then re-run this script."
  exit 1
fi

mkdir -p "$APP_DIR" "$LOG_DIR"
cp "$SRC_DIR/familyhub_agent.py" "$APP_DIR/familyhub_agent.py"
if [[ ! -f "$APP_DIR/agent.json" ]]; then
  cp "$SRC_DIR/agent.example.json" "$APP_DIR/agent.json"
  CREATED_CONFIG=1
fi
chmod 700 "$APP_DIR"
chmod 600 "$APP_DIR/agent.json"
chown -R "$RUN_USER" "$APP_DIR" "$LOG_DIR" 2>/dev/null || true

if [[ "${CREATED_CONFIG:-0}" == "1" ]]; then
  echo
  echo "Created $APP_DIR/agent.json"
  echo "Fill in the hub token and UniFi login, then run:"
  echo "  $PYTHON \"$APP_DIR/familyhub_agent.py\" probe"
  echo "and re-run this script to start the service."
  open -e "$APP_DIR/agent.json" 2>/dev/null || true
  exit 0
fi

TMP_PLIST=$(mktemp)
cat > "$TMP_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>$RUN_USER</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$APP_DIR/familyhub_agent.py</string>
    <string>run</string>
    <string>--config</string>
    <string>$APP_DIR/agent.json</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/agent.log</string>
</dict>
</plist>
PLIST

sudo launchctl bootout system "$PLIST" 2>/dev/null || true
sudo install -m 644 -o root -g wheel "$TMP_PLIST" "$PLIST"
rm -f "$TMP_PLIST"
sudo launchctl bootstrap system "$PLIST"

echo "Family Hub agent is running. Logs: tail -f \"$LOG_DIR/agent.log\""
echo
echo "Keep the Mac mini awake and auto-restarting after power cuts:"
echo "  sudo pmset -a sleep 0 disksleep 0 autorestart 1 womp 1"
