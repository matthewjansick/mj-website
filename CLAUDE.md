# CLAUDE.md

Context for Claude Code sessions in this repo. The full user-facing guide is `family-hub/README.md`.

## Family Hub at a glance

- **WordPress plugin** `family-hub/wordpress/family-hub/`: dashboard at jansick.com/family (admins only),
  REST API `family-hub/v1`, Brevo SMS (`includes/class-family-hub-notify.php`). Site is on **WP Engine**.
  Deploy = zip `family-hub/wordpress/family-hub` and upload it in WP Admin (Replace current with uploaded).
- **Home agent** `family-hub/agent/familyhub_agent.py` (+ `familyhub_mdm.py`): runs on the **Mac mini** as a
  LaunchDaemon, checks in outbound to the hub every ~10 s, enforces on the router, keeps working from a
  cached config if the site is down. Python 3.9+ standard library only (macOS ships 3.9; keep it compatible).
- **Apple device management**: NanoMDM v0.9.0 + SCEP v2.3.0 on the Mac mini (`install-mdm-macos.sh`),
  reached by devices through a tunnel to the agent's front door (127.0.0.1:9100), which exposes only
  `/mdm`, `/scep` and `/enroll/<token>`.
- Schedule logic exists twice and must stay in sync: `profile_state()`/`in_downtime()` in the agent
  (enforcement) and `Family_Hub_Schedule` in PHP (display/texts).

## Household facts and decisions (don't re-ask)

- Router: **UniFi Dream Machine** (original UDM) at **192.168.2.1**, UniFi OS. Agent login: local admin `familyhub`.
- Mixed wired and Wi-Fi devices, so default enforcement is **traffic rules** (wired devices are blocked too).
- Always-on machine: **Mac mini**. Agent files: `~/Library/Application Support/FamilyHub/`, logs: `~/Library/Logs/FamilyHub/`.
- Alerts: **SMS only via Brevo** (no web push, no smart speakers, no Xbox messages). Texts start "Mom & Dad".
  Both parents get notifications and can run the dashboard. Kids may add +5 min once per wind-down.
- Wind-down: 15/5/1-minute warnings; bedtime downtime runs the same warnings automatically.
- Kids' iPhones/iPads: **wipe, supervise, restore** for full control (back up first; supervise with
  Apple Configurator without MDM, restore, then install the enrollment profile). Push certificate via
  mdmcert.download; renew yearly with the **same** Apple Account.
- Tunnel hostname for MDM is still **undecided**: Cloudflare Tunnel (`mdm.jansick.com`, needs DNS on
  Cloudflare) vs Tailscale Funnel. It's baked into enrolled devices, so settle it before enrolling anything.
- **Bookmarked, not built:** AI message safety monitor on the Mac mini (README roadmap). Open decisions:
  cloud vs local model; alerts only vs alerts plus weekly summary.

## Current status

All code is on branch `claude/family-hub` (the repo has no `main`; the default branch holds only the
Colorado page). Plugin 0.5.1 is installed on jansick.com and the dashboard works. Next step: install the
agent on the Mac mini (`family-hub/agent/install-macos.sh`), fill in `agent.json`, run
`familyhub_agent.py probe`, then pin the gateway TLS fingerprint and start the service (README step 3).

## Commands

```bash
python3 -m unittest discover -s family-hub/agent/tests          # agent (MDM integration tests skip without binaries)
FAMILYHUB_MDM_BIN=/dir/with/nanomdm,scepserver,scepclient \
  python3 -m unittest discover -s family-hub/agent/tests          # + real NanoMDM/SCEP with a simulated iPhone
php -l family-hub/wordpress/family-hub/includes/*.php
node --check family-hub/wordpress/family-hub/assets/app.js
wp eval-file family-hub/wordpress/tests/{notify,limit,mdm}-test.php   # throwaway WordPress only: wipes plugin data
```

On the Mac mini (installed agent):

```bash
python3 ~/Library/Application\ Support/FamilyHub/familyhub_agent.py probe     # router + hub check
python3 ~/Library/Application\ Support/FamilyHub/familyhub_agent.py clients   # what UniFi sees
tail -f ~/Library/Logs/FamilyHub/agent.log
sudo launchctl kickstart -k system/com.jansick.familyhub                      # restart the agent
```

## Rules

- Never commit `agent.json`, push certificates/keys, enrollment profiles or anything from
  `~/Library/Application Support/FamilyHub/` (they hold secrets; see `.gitignore`).
- Bump the plugin version in `family-hub.php` (header + `FAMILY_HUB_VERSION`) and the agent `VERSION` when
  shipping changes; the dashboard warns when the agent is too old for a feature.
- Device names come from the network and are kid-controlled: always escape them in the dashboard (`h()`).
