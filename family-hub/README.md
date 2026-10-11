# Family Hub

A self-hosted parental controls hub at **jansick.com/family**: wind down, pause, schedule
and give bonus time for each kid, for every device on the home network (phones, iPads,
laptops, the Xbox), from one dashboard.

**Wind down** is the main button: tap it, pick 15 minutes, and each kid gets a text
(through Brevo) at 15, 5 and 1 minute before their internet goes off. Each kid can add
5 minutes once from a link in the text. When the router confirms the cutoff, both
parents get a text.

```
jansick.com/family  ── WordPress plugin (WP Engine)
  dashboard + REST API; stores kids, devices, schedules, pauses
        ▲
        │  HTTPS, outbound from home only (every ~10 s)
        │
Mac mini at home  ── familyhub_agent.py (launchd service)
  evaluates schedules locally, caches the rules
        │
        ▼
UniFi gateway  ── blocks/unblocks the kids' devices
```

The website never connects into the house. The agent checks in, so no ports are
opened on the router. If the website or internet is down, the agent keeps
enforcing the last rules it received (pauses still expire on time, downtime still
starts and ends).

## What works today, and what doesn't

| Ecosystem | Status |
|---|---|
| **UniFi (all devices on home Wi-Fi/LAN)** | ✅ Wind-down, pause, schedules, bonus time, per kid. |
| **Screen time & daily limits** | ✅ Estimated from each kid's internet activity at home; per-kid limits for school days and weekends, with texts as time runs low and an automatic cutoff until midnight. |
| **Text alerts (Brevo SMS)** | ✅ Wind-down warnings to kids, "+5 min" link, confirmations to parents. |
| **Xbox** | ✅ Through UniFi: an Xbox without internet can't play online or launch online-only games. Microsoft has no public API for Family Settings, so in-console limits stay in the Xbox Family app. |
| **iPhones & iPads (MDM)** | ✅ Supervised devices: at cutoff only the apps you allow can open, **on cellular too**. Always-on rules (no VPNs, no erasing, no profile installs). **Lock completely** (Lost Mode). Needs a one-time wipe, supervise and restore per device. |
| **Apple Screen Time** | ❌ No remote API. Apple only allows Screen Time changes from an app on the device itself. Device management covers what Family Hub needs. |

---

## Setup

### 1. Install the WordPress plugin (WP Engine)

1. Zip the plugin folder: `cd family-hub/wordpress && zip -r family-hub.zip family-hub`
2. In WP Admin, go to **Plugins → Add New → Upload Plugin**, upload `family-hub.zip` and **Activate** it.
   (Or SFTP/git-push the `family-hub` folder into `wp-content/plugins/`.)
3. Visit **https://jansick.com/family**. You'll be asked to log in. Only administrators get in.
   - If `/family` shows a 404, open **Settings → Permalinks** and click **Save** once.
   - **Ask WP Engine support to exclude `/family/` (including `/family/more/`) and
     `/wp-json/family-hub/` from page caching.** The dashboard is only seen logged in
     (never cached), but the kids' "+5 min" page is opened without logging in.
4. In the dashboard, open **⚙ Settings → Generate agent token** and copy the snippet it shows.
   It's shown once. Generate a new one if you lose it.

The dashboard URL can be changed with `define( 'FAMILY_HUB_SLUG', 'kids' );` in `wp-config.php`.

### 2. Create a UniFi login for the agent

Use **one** of these:

- **API key** (Network app 9.0 or newer): in the UniFi Network app, open
  **Settings → Control Plane → Integrations** and create an API key. Put it in `unifi.api_key`.
- **Local admin account** (works on every version): in UniFi OS, open **Admins & Users → Add admin**,
  choose **Restrict to local access only**, give it access to **Network** only (Site Admin),
  and don't turn on 2FA. Use a long random password. Put it in `unifi.username`/`unifi.password`.

If the API key is rejected by `probe` (some versions only accept it on the newer
integration API), fall back to the local account.

### 3. Install the agent on the Mac mini

```bash
cd family-hub/agent
./install-macos.sh          # first run creates the config file and opens it
```

Fill in `~/Library/Application Support/FamilyHub/agent.json`:

- `hub.url` / `hub.token`: from step 1.4
- `unifi.url`: your gateway, `https://192.168.2.1` (UniFi Dream Machine)
- the API key **or** username/password from step 2

Then identify the gateway and check everything works:

```bash
python3 ~/Library/Application\ Support/FamilyHub/familyhub_agent.py probe
```

```
Gateway: https://192.168.2.1
  TLS certificate SHA-256: 3f9a…
  Controller type:   unifi_os
  Gateway model:     UCGMAX Home
  Gateway firmware:  4.1.13
  Network app:       9.4.19
  Clients:           23 online, 61 known
  Traffic rules API: OK (2 rules) - 'traffic_rule' enforcement available
Hub: https://jansick.com OK
```

Copy the certificate fingerprint into `unifi.tls_fingerprint_sha256`. This pins the
gateway's self-signed certificate, so the agent won't send credentials to anything
impersonating it. Then run `./install-macos.sh` again to start the service.
It starts at boot and restarts itself if it stops. Logs are in `~/Library/Logs/FamilyHub/agent.log`.

Keep the Mac mini awake: `sudo pmset -a sleep 0 disksleep 0 autorestart 1 womp 1`.

Other commands: `clients` lists everything UniFi sees, `once` runs a single sync cycle,
and `./install-macos.sh uninstall` removes the service.

### 4. Add the kids

In the dashboard, click **Add a kid**, then tick their devices (the list comes from UniFi
and shows names, makers, MACs and IPs) and add downtime rules. There are one-click presets
for school nights (Sun–Thu 9 PM–7 AM) and weekend nights.

### 5. Turn on text alerts (Brevo)

In **⚙ Settings → Text alerts**:

1. Tick **Send texts through Brevo** and paste your **Brevo API key** (Brevo → SMTP & API → API keys).
   The key is never shown again or sent back to the browser. You can instead put
   `define( 'FAMILY_HUB_BREVO_API_KEY', 'xkeysib-…' );` in `wp-config.php` (WP Engine → your site →
   SFTP), which keeps it out of the database.
2. **Sender** is optional. Leave it blank to use your registered Brevo US number. US carriers
   ignore name-style senders.
3. Add both parents' phone numbers. Add each kid's phone in their profile (✎).
4. Click **Send test**, then **Save text settings**.

Defaults: messages start with "Mom & Dad", warnings at 15/5/1 minutes, 15-minute wind-downs,
and warnings before scheduled downtime too. Wording is editable under **Message wording**.

**Cost:** a wind-down sends up to 4 texts per kid (3 warnings and "screens off") plus one per
parent. With nightly scheduled downtime that's roughly 120–150 texts a month per kid.
Turn off **Also warn before scheduled downtime** to only text for wind-downs you start.

### 6. Close the easy loopholes

- **Private Wi-Fi Address.** iPhones/iPads/Macs can use a random MAC per network, and it can change.
  The dashboard flags these as **private MAC**. Supervised devices get it forced off for your home
  network (step 7, `home_wifi`). Until then: **Settings → Wi-Fi → (i) next to your network → Private
  Wi-Fi Address** off, then re-pick the device in the dashboard.
- **Cellular data.** Blocking Wi-Fi doesn't stop LTE/5G. Supervised devices (step 7) are covered:
  at cutoff only the allowed apps open, wherever the phone is.
- **Xbox alternate MAC.** Xbox lets you set an "Alternate MAC address" in network settings. Lock the
  console's settings behind your Microsoft Family passkey.
- **Wired devices.** Your house has both, so the default is **Traffic rules**, which also cut cabled
  devices. If `probe` says traffic rules aren't available, switch to **Block devices** (Wi-Fi only).

### 7. Apple devices: full control (wipe, supervise, restore)

What you get for each supervised iPhone/iPad:

| | |
|---|---|
| **At cutoff** (wind-down end, pause, bedtime) | A "Downtime" profile lets only the apps you pick open (Phone, Messages, Maps, Clock, Find My, Contacts by default; editable in **Settings → Apple devices**). Works on cellular and other people's Wi-Fi. Removed automatically when time's back on. |
| **Always** | No VPNs, no erasing the device, no installing other profiles, no cellular-plan or eSIM changes, automatic date & time. Optionally: joins home Wi-Fi with its real MAC, so the router always recognizes it. |
| **Lock completely** | Button on the kid's card. Puts their Apple devices in Lost Mode: a locked screen with your message and phone number, unusable until you tap **Unlock devices**. |
| **Kid can't remove it** | Management can only be removed by you, from the Mac mini. |

Devices are matched to kids by Wi-Fi MAC: once a phone is managed it appears in the kid's device picker
as **Apple · managed**, and one tick covers both the network block and the phone.

**How it fits together.** The Mac mini runs NanoMDM (the management server) and a SCEP server (issues each
device its identity certificate). Apple's push service wakes the phone wherever it is; the phone then
connects to the Mac mini over HTTPS. That needs a public address, provided by a tunnel, so **still no
ports are opened on your router**. The tunnel points at the agent's "front door", which only lets through
the three addresses devices need (`/mdm`, `/scep` and a secret enrollment link). The management API and
everything else stay private.

**What you need:** Homebrew Go (`brew install go`), Apple Configurator (free, Mac App Store), a USB cable,
a free [mdmcert.download](https://mdmcert.download/registration) account (it signs the push-certificate
request, as Apple only does that for registered MDM vendors; register first, approval takes a day or so),
and **one Apple Account you'll keep for years** (a parent's) for the push certificate.

#### 7a. Pick a permanent public address (tunnel)

The address is written into every enrolled device. Changing it later means re-supervising every
device, so choose one you'll keep.

- **Cloudflare Tunnel** (recommended if jansick.com's DNS is, or can move, to Cloudflare; free):
  `https://mdm.jansick.com`
  ```bash
  brew install cloudflared
  cloudflared tunnel login
  cloudflared tunnel create familyhub
  cloudflared tunnel route dns familyhub mdm.jansick.com
  # ~/.cloudflared/config.yml:
  #   tunnel: familyhub
  #   credentials-file: /Users/YOU/.cloudflared/<id>.json
  #   ingress:
  #     - hostname: mdm.jansick.com
  #       service: http://127.0.0.1:9100
  #     - service: http_status:404
  sudo cloudflared service install
  ```
- **Tailscale Funnel** (no DNS changes; free): install Tailscale on the Mac mini, then
  `tailscale funnel --bg 9100`. Your address is `https://<mac-name>.<tailnet>.ts.net`. Don't rename the
  Mac or the tailnet afterwards.

#### 7b. Install the servers

```bash
cd family-hub/agent
./install-mdm-macos.sh https://mdm.jansick.com     # your address from 7a
```

This builds NanoMDM v0.9.0, SCEP v2.3.0 and `mdmctl` with Go, creates the certificate authority (10 years),
generates all secrets into `agent.json`, starts both servers at boot, and restarts the agent.
Check: `curl -s -o /dev/null -w '%{http_code}\n' https://mdm.jansick.com/v1/pushcert` prints **404**
(the API is not reachable from outside, which is correct).

#### 7c. Apple push certificate (yearly)

```bash
cd ~/Library/Application\ Support/FamilyHub/mdm
../bin/mdmctl mdmcert.download -new -email=YOU@jansick.com
#   → mdmcert.download emails you a file: mdm_signed_request.<date>.plist.b64.p7
../bin/mdmctl mdmcert.download -decrypt=$HOME/Downloads/mdm_signed_request.<date>.plist.b64.p7
#   → creates mdmcert.download.push.req
```

1. Go to [identity.apple.com](https://identity.apple.com), sign in with **the Apple Account you'll keep**,
   **Create a Certificate**, upload `mdmcert.download.push.req`, download the `.pem`.
2. Load it and restart the agent:
   ```bash
   /usr/bin/python3 ../familyhub_agent.py mdm-pushcert ~/Downloads/MDM_*.pem mdmcert.download.push.key
   sudo launchctl kickstart -k system/com.jansick.familyhub
   ```
3. **Put a reminder on the calendar for 11 months from now.** To renew: repeat the `mdmctl` steps, then on
   identity.apple.com choose **Renew** on the existing certificate (same Apple Account), and run
   `mdm-pushcert` again. Renewing keeps every device working. Creating a *new* certificate instead, or
   letting it expire, means re-supervising every device. The dashboard warns 30 days ahead.

#### 7d. Optional: force the real Wi-Fi address at home

In `~/Library/Application Support/FamilyHub/agent.json`, fill in `mdm.home_wifi` (`ssid`, `password`,
`encryption`: `WPA2` or `WPA3`) and restart the agent. Supervised devices then join your network with their
hardware MAC, so the router block always recognizes them. The password stays on the Mac mini.

#### 7e. Each device: back up, supervise, restore, enroll

Do the least important device first. Allow about an hour each, mostly waiting.

1. **Before you start:** know the kid's Apple Account password (or reset it via Family Sharing) and turn off
   **Find My** on the device. If it uses an **eSIM**, check with AT&T that you can get it reinstalled
   (erasing can remove it).
2. **Back up.** Plug the device into the Mac mini: Finder → the device → **Back Up all of the data to this
   Mac** with **Encrypt local backup** ticked (keeps passwords and Health data). An iCloud backup also works.
3. **Get the enrollment profile:**
   `/usr/bin/python3 ~/Library/Application\ Support/FamilyHub/familyhub_agent.py mdm-profile ~/Desktop/FamilyHub.mobileconfig`
4. **Supervise.** Apple Configurator → select the device → **Prepare** → *Manual Configuration* →
   **Supervise devices** ✓, *Allow devices to pair with other computers* ✗ → MDM server: **Do not enroll in
   MDM** (enrollment comes after the restore) → create an organization (e.g. "Jansick Family") when asked →
   Setup Assistant: **Show only some steps** and keep **Apps & Data** (the restore step) shown → **Prepare**.
   This erases the device.
5. **Restore.** On the device, go through setup and choose **Restore from Mac** (Finder, still plugged in) or
   **Restore from iCloud Backup**. The device stays supervised after the restore.
6. **Enroll.** Back in Apple Configurator: select the device → **Add → Profiles** → `FamilyHub.mobileconfig`.
   Supervised devices install it without asking the kid.
7. **Check:** on the device, **Settings → General → VPN & Device Management** shows Family Hub with no
   Remove option. On the dashboard, **Settings → Apple devices** lists it, not marked "not supervised", and
   the agent installs the house rules within a minute.
8. **Assign:** edit the kid on the dashboard and tick the device (shown under its Wi-Fi name, or as
   **Apple · managed** if it's out).

**Back up the Mac mini's Family Hub folder** (`~/Library/Application Support/FamilyHub`, which holds the
certificate authority and enrollment database) and Apple Configurator's **organization (supervision
identity)**: Configurator → Settings → Organizations → Export. Losing either means re-supervising devices.

---

## How it behaves

### Wind-down

| | |
|---|---|
| **Start one** | **Wind down** on a kid, or **Wind down everyone**, then pick the time (default first). Two taps. |
| **Kid's texts** | *"Mom & Dad: Screens off at 8:30 PM (15 min). Start wrapping up. Need 5 more min? jansick.com/family/more/…"*, then 5 min, then *"1 minute left. Save your game!"*, then *"Screens are off now."* |
| **+5 min** | The link opens a page with an **Add 5 minutes** button. It works once per wind-down, only before the cutoff, and both parents are texted when it's used. Opening the link alone does nothing; message apps preview links, so it needs the button tap. |
| **Parents** | One text to each parent when the router confirms everyone's offline (*"Family Hub: Ava and Liam offline now."*), or a warning if the agent hasn't confirmed within 3 minutes. |
| **Change your mind** | **+5 min** or **Cancel** on the card. The kid gets *"Change of plans…"* or *"Never mind…"*. |
| **Bedtime / bonus ending** | Scheduled downtime and the end of bonus time get the same warnings automatically. |
| **After cutoff** | Internet stays off until you tap **Resume** (or the schedule takes over). |

The cutoff itself is enforced by the Mac mini at the exact minute, even if the website is down.
The texts come from the website, timed by the agent's check-ins every 10 seconds (WP Engine's own
timer only runs when someone visits the site). If the Mac mini is offline, the website's timer is the
fallback, so texts may arrive late.

### Screen time and daily limits

- **How it's counted:** a minute counts as screen time when any of the kid's devices moves more than 250 KB
  in that minute on the home network (about the level of real use, not idle background syncing). Change it
  in **Settings → Count a minute as screen time when…**. It's an estimate: phones on cellular aren't seen,
  and a console downloading an update counts. The card shows today's total and a 7-day average.
- **Limits:** edit a kid → **Daily screen-time limit**, separately for Mon–Fri and Sat & Sun. When it runs
  out the kid is offline until midnight (*"Daily limit reached"*). **Give bonus time** works as usual.
- **Texts:** *"Mom & Dad: 14 min of screen time left today."* at the warning marks (once each per day),
  then *"That is all your screen time for today. See you tomorrow!"* These follow usage, not the clock,
  and use the same **Also warn before scheduled downtime…** switch.
- The agent counts and enforces limits itself, so a limit still applies if the website is down.
- **Weekly summary:** every Sunday at 7 PM both parents get one text, e.g. *"Family Hub week: Ava 9h 20m
  (avg 1h 20m/day, limit reached 1 day). Liam 6h 5m (avg 52m/day)."* Switch it off or **Preview** it in
  **Settings → Text alerts**.

### Macs

A kid's Mac enrolls with the same profile as an iPhone (Apple Configurator, or double-click the
`.mobileconfig` on the Mac). It gets the rules that apply to Macs (no erasing; the home Wi-Fi profile) and
shows as **managed Mac**. App Downtime is an iPhone/iPad feature; at home a Mac is cut off by the router
like everything else.

**Lock completely** works on Macs too, differently: Macs have no Lost Mode, so the Mac is locked with a
6-digit PIN that appears on the kid's card (*"locked · PIN 482913"*). It stays locked until someone types
that PIN **at the Mac**. Unlocking a Mac can't be done remotely, and the PIN disappears from the
dashboard once the Mac checks in again.

### Everything else

- **States.** A kid is *Internet on*, *Downtime* (schedule), *Paused* (you), *Bonus time* (you), or
  *Not managed*. Pauses and bonus time override the schedule and expire on their own.
  "Until I resume" lasts until you tap **Resume**.
- **Shared devices** can belong to more than one kid. They're blocked if any of those kids is blocked.
- **The hub owns assigned devices.** If you unblock one of them by hand in the UniFi app while the
  hub says it should be blocked, the agent re-blocks it within one check-in. Remove a device from
  its profile (or turn the profile off) and the agent unblocks it and leaves it alone.
- **Applying…** on a card means the change is saved and waiting for the agent. It normally clears within
  10 seconds. **Not applied** means the agent is offline.
- **Activity** (☰) logs every pause, schedule change, and block/unblock the agent performed,
  with who did it.

### Enforcement methods

| | Block devices | Traffic rules (default) |
|---|---|---|
| How | UniFi "Block client" | A UniFi traffic rule per kid: block Internet |
| Wi-Fi devices | ✅ Kicked off and can't rejoin | ✅ Stay connected, no internet |
| Wired devices | ❌ | ✅ |
| Needs | Any UniFi version | Network 7.0+; `probe` tells you |

Rules are named `Family Hub - <name> [family-hub:<id>]` in the UniFi app. Don't rename them.
A rule is never enabled with no devices in it, and switching methods undoes the blocks made by the old one.

## Security

- The dashboard requires a WordPress administrator login; the REST API uses WordPress nonces.
- The agent authenticates with a random token sent in a header. Only its SHA-256 hash is stored in WordPress.
  It can only fetch rules and report status; it can't log into WordPress.
- Router credentials stay on the Mac mini (`agent.json`, mode 600) and are never sent to the website.
- No inbound ports are opened at home. The device-management tunnel reaches only the agent's front door,
  which serves `/mdm` (device-signed requests checked by NanoMDM against your own certificate authority),
  `/scep` (needs the enrollment challenge) and the enrollment profile at a secret link. The NanoMDM API,
  the webhook (HMAC-signed) and the servers themselves listen on localhost only.
- Device names from the network are treated as untrusted (escaped in the dashboard), since kids can rename their devices.
- Use strong passwords and 2FA on the WordPress admin accounts: whoever controls them controls the kids' internet.

## Development

```bash
python3 -m unittest discover -s family-hub/agent/tests   # agent: schedules, full loop vs a fake UniFi OS gateway, MDM logic
# Against the real NanoMDM/SCEP servers with a simulated iPhone (enroll, SCEP, signed check-ins, commands):
GOBIN=/tmp/fh go install github.com/micromdm/nanomdm/cmd/nanomdm@v0.9.0
GOBIN=/tmp/fh go install github.com/micromdm/scep/v2/cmd/scepserver@v2.3.0
GOBIN=/tmp/fh go install github.com/micromdm/scep/v2/cmd/scepclient@v2.3.0
FAMILYHUB_MDM_BIN=/tmp/fh python3 -m unittest discover -s family-hub/agent/tests
php -l family-hub/wordpress/family-hub/includes/*.php
wp eval-file family-hub/wordpress/tests/notify-test.php    # wind-down texts     } on a throwaway
wp eval-file family-hub/wordpress/tests/limit-test.php     # screen-time limits  } dev site only
wp eval-file family-hub/wordpress/tests/mdm-test.php       # Apple devices       }
```

GitHub runs all of this on every change to `family-hub/` (`.github/workflows/family-hub.yml`): the agent
on Python 3.9 and 3.12 including the real-NanoMDM tests, and the plugin on PHP 7.4 and 8.3 inside a fresh
WordPress, plus the wind-down, limit and Apple-device suites. Each run also produces an installable
`family-hub-plugin` zip under the run's **Artifacts**.

The agent uses only the Python standard library and runs on the Python 3.9 that ships with macOS.
The plugin needs WordPress 6.0+ and PHP 7.4+, and has no build step.

## Roadmap

- **Next:** app-level Downtime for Macs.
- **Bookmarked: message safety monitor.** A separate macOS user per kid on the Mac mini, signed into the
  kid's Messages (Messages in iCloud, plus Text Message Forwarding for SMS). A monitor reads new messages
  from `~/Library/Messages/chat.db` (needs Full Disk Access) every few minutes and has an AI model check
  them against parent-defined concerns (bullying, self-harm, grooming, sexual content, drugs, meetups with
  strangers). Parents get alerts with a short summary and the flagged excerpt, never full transcripts;
  conversations stay on the Mac mini. Covers iMessage/SMS only (not Snapchat, Discord, etc.).
  Open decisions: cloud model (more accurate) vs local model (nothing leaves the house) vs local-first with
  cloud double-check; alerts only vs alerts plus a weekly summary.
- **Later:** per-device limits (e.g. Xbox only), possibly a companion iOS app for true Screen Time control.
