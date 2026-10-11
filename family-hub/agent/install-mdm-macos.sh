#!/bin/bash
# Installs the Apple device-management servers next to the Family Hub agent:
#   NanoMDM  (the MDM server)            127.0.0.1:9000
#   SCEP     (issues device identities)  127.0.0.1:8080
# and turns on the agent's MDM support (webhook 127.0.0.1:9010, front door
# 127.0.0.1:9100 - point your tunnel at the front door only).
#
#   ./install-mdm-macos.sh https://mdm.jansick.com    install / update
#   ./install-mdm-macos.sh uninstall                  stop the servers (keeps data)
#
# Run install-macos.sh first. Needs Go to build the servers (brew install go).
set -euo pipefail

NANOMDM_VERSION="v0.9.0"
SCEP_VERSION="v2.3.0"
MICROMDM_VERSION="v1.13.1"   # only for mdmctl (push certificate requests)

RUN_USER="${SUDO_USER:-$USER}"
HOME_DIR=$(eval echo "~$RUN_USER")
APP_DIR="$HOME_DIR/Library/Application Support/FamilyHub"
MDM_DIR="$APP_DIR/mdm"
BIN_DIR="$APP_DIR/bin"
LOG_DIR="$HOME_DIR/Library/Logs/FamilyHub"
CONFIG="$APP_DIR/agent.json"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "uninstall" ]]; then
  for svc in nanomdm scep; do
    sudo launchctl bootout system "/Library/LaunchDaemons/com.jansick.familyhub.$svc.plist" 2>/dev/null || true
    sudo rm -f "/Library/LaunchDaemons/com.jansick.familyhub.$svc.plist"
  done
  echo "Stopped NanoMDM and SCEP. Enrollment data kept in: $MDM_DIR"
  echo "Enrolled devices keep their profiles until the server comes back and removes them."
  exit 0
fi

PUBLIC_URL="${1:-}"
if [[ ! "$PUBLIC_URL" =~ ^https:// ]]; then
  echo "usage: $0 https://mdm.your-domain.com"
  echo "The public HTTPS address of your tunnel (see README, 'Apple devices'). It's baked into"
  echo "every enrolled device, so pick one you can keep for years."
  exit 1
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "Run ./install-macos.sh first (no $CONFIG yet)."
  exit 1
fi
if ! command -v go >/dev/null 2>&1; then
  echo "Go is needed to build the servers. Install it with:  brew install go   (or from go.dev/dl)"
  exit 1
fi

mkdir -p "$MDM_DIR" "$BIN_DIR" "$LOG_DIR"
echo "Building NanoMDM $NANOMDM_VERSION, SCEP $SCEP_VERSION and mdmctl $MICROMDM_VERSION..."
export GOBIN="$BIN_DIR"
go install "github.com/micromdm/nanomdm/cmd/nanomdm@$NANOMDM_VERSION"
go install "github.com/micromdm/scep/v2/cmd/scepserver@$SCEP_VERSION"
go install "github.com/micromdm/micromdm/cmd/mdmctl@$MICROMDM_VERSION"

if [[ ! -f "$MDM_DIR/scep-depot/ca.pem" ]]; then
  "$BIN_DIR/scepserver" ca -init -depot "$MDM_DIR/scep-depot" -years 10 -organization "Family Hub"
fi

# Secrets and ports go into agent.json (mode 600). Existing values are kept.
/usr/bin/python3 - "$CONFIG" "$PUBLIC_URL" "$MDM_DIR" <<'PY'
import json, os, secrets, sys
path, public_url, mdm_dir = sys.argv[1:4]
cfg = json.load(open(path))
m = cfg.setdefault("mdm", {})
if m.get("public_url") and m["public_url"] != public_url and m.get("topic"):
    print(f"WARNING: changing the public URL from {m['public_url']} to {public_url}.")
    print("Devices already enrolled keep using the old address and must be re-supervised.")
m["public_url"] = public_url
for key, n in (("api_key", 32), ("webhook_secret", 32), ("scep_challenge", 24), ("enroll_token", 16)):
    m.setdefault(key, secrets.token_urlsafe(n))
m.setdefault("nanomdm_url", "http://127.0.0.1:9000")
m.setdefault("scep_url", "http://127.0.0.1:8080")
m.setdefault("webhook_listen", "127.0.0.1:9010")
m.setdefault("front_listen", "127.0.0.1:9100")
m.setdefault("home_wifi", {"ssid": "", "password": "", "encryption": "WPA2"})
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(cfg, fh, indent=2)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
with open(os.path.join(mdm_dir, "secrets.env"), "w") as fh:
    fh.write(f"API={m['api_key']}\nHOOK={m['webhook_secret']}\nCHALLENGE={m['scep_challenge']}\n")
os.chmod(os.path.join(mdm_dir, "secrets.env"), 0o600)
PY
# shellcheck disable=SC1091
source "$MDM_DIR/secrets.env"
rm -f "$MDM_DIR/secrets.env"
chown -R "$RUN_USER" "$APP_DIR" "$LOG_DIR" 2>/dev/null || true
chmod 700 "$MDM_DIR"

write_daemon() {  # label, then program arguments
  local label="$1"; shift
  local plist="/Library/LaunchDaemons/$label.plist"
  local tmp; tmp=$(mktemp)
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "  <key>Label</key><string>$label</string>"
    echo "  <key>UserName</key><string>$RUN_USER</string>"
    echo "  <key>WorkingDirectory</key><string>$MDM_DIR</string>"
    echo '  <key>ProgramArguments</key><array>'
    for arg in "$@"; do echo "    <string>$arg</string>"; done
    echo '  </array>'
    echo '  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>'
    echo "  <key>StandardOutPath</key><string>$LOG_DIR/${label##*.}.log</string>"
    echo "  <key>StandardErrorPath</key><string>$LOG_DIR/${label##*.}.log</string>"
    echo '</dict></plist>'
  } > "$tmp"
  sudo launchctl bootout system "$plist" 2>/dev/null || true
  # 600: the plist holds the server secrets.
  sudo install -m 600 -o root -g wheel "$tmp" "$plist"
  rm -f "$tmp"
  sudo launchctl bootstrap system "$plist"
}

write_daemon com.jansick.familyhub.scep "$BIN_DIR/scepserver" \
  -depot "$MDM_DIR/scep-depot" -http-addr 127.0.0.1:8080 -challenge "$CHALLENGE" \
  -allowrenew 0 -crtvalid 3650
write_daemon com.jansick.familyhub.nanomdm "$BIN_DIR/nanomdm" \
  -ca "$MDM_DIR/scep-depot/ca.pem" -api "$API" -listen 127.0.0.1:9000 \
  -storage filekv -storage-dsn "$MDM_DIR/db" \
  -webhook-url http://127.0.0.1:9010/webhook -webhook-hmac-key "$HOOK"

# Restart the agent so it starts the webhook and front door.
cp "$SRC_DIR/familyhub_agent.py" "$SRC_DIR/familyhub_mdm.py" "$APP_DIR/"
if [[ -f /Library/LaunchDaemons/com.jansick.familyhub.plist ]]; then
  sudo launchctl kickstart -k system/com.jansick.familyhub
fi

cat <<EOF

Device-management servers are running. Logs: $LOG_DIR/{nanomdm,scep,agent}.log

Next (details in the README, "Apple devices"):
  1. Tunnel:  point $PUBLIC_URL at http://127.0.0.1:9100 (front door only).
  2. Push certificate:
       cd "$MDM_DIR" && "$BIN_DIR/mdmctl" mdmcert.download -new -email=YOU@example.com
       ...follow the email, upload to identity.apple.com, then:
       /usr/bin/python3 "$APP_DIR/familyhub_agent.py" mdm-pushcert MDM_Push.pem mdmcert.download.push.key --key-password '...'
  3. Optional: home Wi-Fi name/password in agent.json -> mdm.home_wifi (forces the real MAC at home).
  4. Supervise each device with Apple Configurator using the URL from:
       /usr/bin/python3 "$APP_DIR/familyhub_agent.py" mdm-profile
EOF
