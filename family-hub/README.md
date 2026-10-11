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
| **Text alerts (Brevo SMS)** | ✅ Wind-down warnings to kids, "+5 min" link, confirmations to parents. |
| **Xbox** | ✅ Through UniFi: an Xbox without internet can't play online or launch online-only games. Microsoft has no public API for Family Settings, so in-console limits stay in the Xbox Family app. |
| **Apple devices (MDM)** | 🔜 Phase 2: self-hosted NanoMDM on the Mac mini, for device lock, app blocking, restriction profiles on a schedule, and blocking cellular data. |
| **Apple Screen Time** | ❌ No remote API. Apple only allows Screen Time changes from an app on the device itself. Keep using Family Sharing for app-level limits; MDM (phase 2) covers most of the rest. |

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
  The dashboard flags these as **private MAC**. On each kid's device, open
  **Settings → Wi-Fi → (i) next to your network** and turn **Private Wi-Fi Address** off, then re-pick the
  device in the dashboard. Phase 2 (MDM) can enforce this.
- **Cellular data.** Blocking Wi-Fi doesn't stop LTE/5G. For now, turn on Screen Time's
  **Content & Privacy → Cellular Data Changes: Don't Allow**. Phase 2 (MDM) can block cellular data on a schedule.
- **Xbox alternate MAC.** Xbox lets you set an "Alternate MAC address" in network settings. Lock the
  console's settings behind your Microsoft Family passkey.
- **Wired devices.** Your house has both, so the default is **Traffic rules**, which also cut cabled
  devices. If `probe` says traffic rules aren't available, switch to **Block devices** (Wi-Fi only).

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
- No inbound ports are opened at home.
- Device names from the network are treated as untrusted (escaped in the dashboard), since kids can rename their devices.
- Use strong passwords and 2FA on the WordPress admin accounts: whoever controls them controls the kids' internet.

## Development

```bash
python3 -m unittest discover -s family-hub/agent/tests   # agent: schedules + full loop against a fake UniFi OS gateway
php -l family-hub/wordpress/family-hub/includes/*.php
wp eval-file family-hub/wordpress/tests/notify-test.php    # wind-down texts, on a throwaway dev site only
```

The agent uses only the Python standard library and runs on the Python 3.9 that ships with macOS.
The plugin needs WordPress 6.0+ and PHP 7.4+, and has no build step.

## Roadmap

- **Phase 2: Apple MDM.** NanoMDM on the Mac mini plus an APNs certificate (free for personal use via
  mdmcert.download). Supervise the kids' devices with Apple Configurator (this wipes them), then
  enforce the Wi-Fi profile with a fixed MAC, block cellular data during downtime, lock or hide apps,
  and add a "Lock device now" button.
- **Phase 3:** time allowances (e.g. 2 h of Xbox per day, measured from network activity); possibly a
  companion iOS app for true Screen Time control.
