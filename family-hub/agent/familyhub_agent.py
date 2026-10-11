#!/usr/bin/env python3
"""Family Hub home agent.

Runs on an always-on machine at home (the Mac mini). Every few seconds it:

  1. checks in with the Family Hub WordPress plugin over HTTPS (outbound only),
     reporting what the UniFi gateway sees and receiving the desired rules;
  2. evaluates each kid's schedule / pause / bonus time locally;
  3. blocks or unblocks that kid's devices on the UniFi gateway.

The last config from WordPress is cached on disk, so schedules keep being
enforced even if the website or the home internet connection is down.

Standard library only, compatible with the Python 3.9 that ships with macOS.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import logging
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from typing import Any, Dict, List, Optional, Tuple

import familyhub_mdm as mdm

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9
    ZoneInfo = None  # type: ignore

VERSION = "0.3.0"
LOG = logging.getLogger("familyhub")
MAC_RE = re.compile(r"^([0-9a-f]{2}:){5}[0-9a-f]{2}$")
CLIENT_REPORT_INTERVAL = 60  # seconds between full client-list uploads
CLIENT_MAX_AGE = 30 * 86400  # only report clients seen in the last 30 days
RULE_TAG = "[family-hub:{id}]"


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def norm_mac(mac: Any) -> Optional[str]:
    if not isinstance(mac, str):
        return None
    m = mac.strip().lower().replace("-", ":")
    return m if MAC_RE.match(m) else None


def is_randomized_mac(mac: str) -> bool:
    """Locally administered bit set => private / randomized address."""
    try:
        return bool(int(mac[0:2], 16) & 0x02)
    except ValueError:
        return False


def resolve_tz(name: Optional[str]):
    if not name:
        return datetime.now().astimezone().tzinfo
    m = re.match(r"^(?:UTC)?([+-])(\d{1,2}):?(\d{2})?$", name)
    if m:
        sign = 1 if m.group(1) == "+" else -1
        delta = timedelta(hours=int(m.group(2)), minutes=int(m.group(3) or 0))
        return timezone(sign * delta)
    if name.upper() == "UTC":
        return timezone.utc
    if ZoneInfo is not None:
        try:
            return ZoneInfo(name)
        except Exception:  # noqa: BLE001 - unknown zone, fall back to local
            LOG.warning("Unknown timezone %r, using the Mac's local time", name)
    return datetime.now().astimezone().tzinfo


# --------------------------------------------------------------------------
# Schedule evaluation (mirrors includes/class-family-hub-schedule.php)
# --------------------------------------------------------------------------

def parse_hm(value: str) -> int:
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def in_downtime(rules: Optional[List[dict]], local_dt: datetime) -> bool:
    """Days use 0=Sunday..6=Saturday. A rule whose end <= start runs past
    midnight into the next day; start == end means the whole day."""
    day = local_dt.isoweekday() % 7
    prev_day = (day - 1) % 7
    minute = local_dt.hour * 60 + local_dt.minute
    for rule in rules or []:
        try:
            days = {int(d) for d in rule.get("days", [])}
            start, end = parse_hm(rule["start"]), parse_hm(rule["end"])
        except (KeyError, ValueError, TypeError):
            continue
        if start == end:
            if day in days:
                return True
        elif start < end:
            if day in days and start <= minute < end:
                return True
        elif (day in days and minute >= start) or (prev_day in days and minute < end):
            return True
    return False


def profile_state(profile: dict, now_ts: float, tz) -> Tuple[bool, str]:
    """Return (blocked, reason) for a kid profile at now_ts."""
    if not profile.get("enabled", True):
        return False, "disabled"
    override = profile.get("override") or {}
    mode, until, start = override.get("mode"), override.get("until"), override.get("start")
    # A wind-down is a block override with a future start: allowed until then.
    if mode in ("block", "allow") and (start is None or start <= now_ts) \
            and (until is None or until > now_ts):
        return mode == "block", "override"
    local = datetime.fromtimestamp(now_ts, tz)
    if in_downtime(profile.get("schedule"), local):
        return True, "schedule"
    return False, "schedule"


def desired_device_state(config: dict, now_ts: float) -> Dict[str, Tuple[bool, str]]:
    """mac -> (blocked, profile_id). A device in two profiles is blocked if
    either profile is blocked."""
    tz = resolve_tz(config.get("timezone"))
    desired: Dict[str, Tuple[bool, str]] = {}
    for profile in config.get("profiles", []):
        if not profile.get("enabled", True):
            continue
        blocked, _ = profile_state(profile, now_ts, tz)
        for mac in profile.get("devices", []):
            mac = norm_mac(mac)
            if not mac:
                continue
            if mac not in desired or (blocked and not desired[mac][0]):
                desired[mac] = (blocked, profile.get("id", ""))
    return desired


# --------------------------------------------------------------------------
# UniFi gateway client
# --------------------------------------------------------------------------

class GatewayError(Exception):
    pass


class UniFiGateway:
    """Talks to a UniFi OS console (UDM / UCG / UDR / UX / Cloud Key Gen2+) or a
    classic self-hosted Network application.

    Auth: an API key (X-API-KEY, Network 9.0+) or a local admin account.
    """

    def __init__(self, cfg: dict):
        url = urllib.parse.urlsplit(cfg["url"])
        self.scheme = url.scheme or "https"
        self.host = url.hostname or ""
        self.port = url.port or (443 if self.scheme == "https" else 80)
        self.site = cfg.get("site", "default")
        self.api_key = cfg.get("api_key") or None
        self.username = cfg.get("username") or None
        self.password = cfg.get("password") or None
        self.mode = cfg.get("controller_type", "auto")  # auto | unifi_os | classic
        self.verify_tls = bool(cfg.get("verify_tls", False))
        self.ca_file = cfg.get("ca_file") or None
        fp = (cfg.get("tls_fingerprint_sha256") or "").replace(":", "").strip().lower()
        self.fingerprint = fp or None
        self.timeout = float(cfg.get("timeout", 10))
        self.cookies: Dict[str, str] = {}
        self.csrf: Optional[str] = None
        self.logged_in = False
        self.login_backoff_until = 0.0
        if not self.api_key and not (self.username and self.password):
            raise GatewayError("unifi config needs api_key, or username + password")
        if self.api_key and self.mode == "auto":
            self.mode = "unifi_os"

    # -- transport --------------------------------------------------------

    def _ssl_context(self) -> ssl.SSLContext:
        if self.verify_tls:
            return ssl.create_default_context(cafile=self.ca_file)
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    def _connection(self) -> http.client.HTTPConnection:
        if self.scheme == "http":
            conn: http.client.HTTPConnection = http.client.HTTPConnection(
                self.host, self.port, timeout=self.timeout)
            conn.connect()
            return conn
        conn = http.client.HTTPSConnection(
            self.host, self.port, timeout=self.timeout, context=self._ssl_context())
        conn.connect()
        if self.fingerprint:
            der = conn.sock.getpeercert(binary_form=True)  # type: ignore[union-attr]
            actual = hashlib.sha256(der or b"").hexdigest()
            if actual != self.fingerprint:
                conn.close()
                raise GatewayError(
                    "Gateway TLS certificate does not match tls_fingerprint_sha256 "
                    f"(got {actual}). Refusing to send credentials.")
        return conn

    def certificate_fingerprint(self) -> Optional[str]:
        if self.scheme != "https":
            return None
        conn = http.client.HTTPSConnection(
            self.host, self.port, timeout=self.timeout, context=self._ssl_context())
        try:
            conn.connect()
            der = conn.sock.getpeercert(binary_form=True)  # type: ignore[union-attr]
            return hashlib.sha256(der or b"").hexdigest()
        finally:
            conn.close()

    def _raw(self, method: str, path: str, body: Any = None) -> Tuple[int, bytes]:
        try:
            conn = self._connection()
        except (OSError, ssl.SSLError) as exc:
            raise GatewayError(f"Cannot reach gateway {self.host}:{self.port}: {exc}") from exc
        try:
            headers = {"Accept": "application/json", "User-Agent": f"FamilyHubAgent/{VERSION}"}
            data = None
            if body is not None:
                data = json.dumps(body).encode()
                headers["Content-Type"] = "application/json"
            if self.api_key:
                headers["X-API-KEY"] = self.api_key
            if self.cookies:
                headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
            if self.csrf:
                headers["X-CSRF-Token"] = self.csrf
            conn.request(method, path, body=data, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            for key, value in resp.getheaders():
                lk = key.lower()
                if lk == "set-cookie":
                    jar: SimpleCookie = SimpleCookie()
                    try:
                        jar.load(value)
                    except Exception:  # noqa: BLE001 - malformed cookie, ignore
                        continue
                    for name, morsel in jar.items():
                        self.cookies[name] = morsel.value
                elif lk in ("x-csrf-token", "x-updated-csrf-token"):
                    self.csrf = value
            return resp.status, raw
        except (OSError, http.client.HTTPException) as exc:
            raise GatewayError(f"Gateway request {method} {path} failed: {exc}") from exc
        finally:
            conn.close()

    def _prefix(self) -> str:
        return "/proxy/network" if self.mode == "unifi_os" else ""

    def login(self) -> None:
        if self.api_key:
            return
        if time.time() < self.login_backoff_until:
            raise GatewayError("Waiting before retrying gateway login (avoids account lockout)")
        attempts = ["unifi_os", "classic"] if self.mode == "auto" else [self.mode]
        failures = []
        for mode in attempts:
            path = "/api/auth/login" if mode == "unifi_os" else "/api/login"
            self.cookies, self.csrf = {}, None
            status, raw = self._raw("POST", path, {
                "username": self.username, "password": self.password, "remember": True})
            if status == 200:
                self.mode, self.logged_in = mode, True
                return
            failures.append(f"{path} -> HTTP {status}")
        self.login_backoff_until = time.time() + 120
        raise GatewayError(
            "Gateway login failed (" + "; ".join(failures) + "). Check the local account "
            "username/password, and that the account has no 2FA.")

    def api(self, method: str, path: str, body: Any = None, _retry: bool = True) -> Any:
        if not self.api_key and not self.logged_in:
            self.login()
        status, raw = self._raw(method, self._prefix() + path, body)
        if status in (401, 403) and _retry and not self.api_key:
            self.logged_in = False
            return self.api(method, path, body, _retry=False)
        if status >= 400:
            snippet = raw[:200].decode("utf-8", "replace")
            raise GatewayError(f"{method} {path} -> HTTP {status}: {snippet}")
        try:
            payload = json.loads(raw or b"null")
        except ValueError as exc:
            raise GatewayError(f"{method} {path} returned non-JSON") from exc
        if isinstance(payload, dict) and isinstance(payload.get("meta"), dict):
            if payload["meta"].get("rc") != "ok":
                raise GatewayError(f"{method} {path}: {payload['meta'].get('msg', 'error')}")
            return payload.get("data", [])
        return payload

    # -- Network application endpoints -------------------------------------

    def clients(self) -> List[dict]:
        """All known clients merged with currently-connected ones."""
        known = self.api("GET", f"/api/s/{self.site}/rest/user") or []
        online = self.api("GET", f"/api/s/{self.site}/stat/sta") or []
        merged: Dict[str, dict] = {}
        for c in known:
            mac = norm_mac(c.get("mac"))
            if not mac:
                continue
            merged[mac] = {
                "mac": mac,
                "name": c.get("name") or "",
                "hostname": c.get("hostname") or "",
                "oui": c.get("oui") or "",
                "blocked": bool(c.get("blocked", False)),
                "last_seen": int(c.get("last_seen") or 0),
                "wired": bool(c.get("is_wired", False)),
                "online": False,
                "ip": c.get("fixed_ip") or "",
                "network": "",
            }
        for c in online:
            mac = norm_mac(c.get("mac"))
            if not mac:
                continue
            entry = merged.setdefault(mac, {
                "mac": mac, "name": "", "hostname": "", "oui": "", "blocked": False,
                "last_seen": 0, "wired": False, "online": False, "ip": "", "network": ""})
            entry.update({
                "online": True,
                "ip": c.get("ip") or entry["ip"],
                "wired": bool(c.get("is_wired", entry["wired"])),
                "network": c.get("essid") or c.get("network") or "",
                "last_seen": int(c.get("last_seen") or time.time()),
            })
            entry["name"] = entry["name"] or c.get("name") or ""
            entry["hostname"] = entry["hostname"] or c.get("hostname") or ""
            entry["oui"] = entry["oui"] or c.get("oui") or ""
            if "blocked" in c:
                entry["blocked"] = bool(c["blocked"])
        for entry in merged.values():
            entry["randomized"] = is_randomized_mac(entry["mac"])
        return list(merged.values())

    def block(self, mac: str) -> None:
        self.api("POST", f"/api/s/{self.site}/cmd/stamgr", {"cmd": "block-sta", "mac": mac})

    def unblock(self, mac: str) -> None:
        self.api("POST", f"/api/s/{self.site}/cmd/stamgr", {"cmd": "unblock-sta", "mac": mac})

    def info(self) -> dict:
        info: Dict[str, Any] = {"controller_type": self.mode}
        try:
            sysinfo = self.api("GET", f"/api/s/{self.site}/stat/sysinfo") or [{}]
            info["network_version"] = sysinfo[0].get("version", "")
        except GatewayError as exc:
            info["sysinfo_error"] = str(exc)
        try:
            for dev in self.api("GET", f"/api/s/{self.site}/stat/device") or []:
                if dev.get("type") in ("udm", "ugw", "uxg") or str(dev.get("model", "")).startswith(("UDM", "UCG", "UDR", "UX")):
                    info["gateway_model"] = dev.get("model", "")
                    info["gateway_name"] = dev.get("name", "")
                    info["gateway_firmware"] = dev.get("version", "")
                    break
        except GatewayError as exc:
            info["device_error"] = str(exc)
        return info

    # Traffic rules (Network 7.x+ "v2" API). Blocks internet for wired clients
    # too, which client blocking cannot do.
    def traffic_rules(self) -> List[dict]:
        return self.api("GET", f"/v2/api/site/{self.site}/trafficrules") or []

    def create_traffic_rule(self, rule: dict) -> dict:
        return self.api("POST", f"/v2/api/site/{self.site}/trafficrules", rule)

    def update_traffic_rule(self, rule: dict) -> dict:
        return self.api("PUT", f"/v2/api/site/{self.site}/trafficrules/{rule['_id']}", rule)


def new_traffic_rule(description: str, macs: List[str], enabled: bool) -> dict:
    return {
        "action": "BLOCK",
        "description": description,
        "enabled": enabled,
        "matching_target": "INTERNET",
        "target_devices": [{"client_mac": m, "type": "CLIENT"} for m in macs],
        "schedule": {"mode": "ALWAYS", "repeat_on_days": [], "time_all_day": False,
                     "time_range_start": "09:00", "time_range_end": "12:00"},
        "app_category_ids": [], "app_ids": [], "domains": [], "ip_addresses": [],
        "ip_ranges": [], "network_ids": [], "regions": [],
        "bandwidth_limit": {"enabled": False, "download_limit_kbps": 1024, "upload_limit_kbps": 1024},
    }


# --------------------------------------------------------------------------
# Enforcement
# --------------------------------------------------------------------------

class Enforcer:
    def __init__(self, gateway: UniFiGateway, state_path: str):
        self.gw = gateway
        self.state_path = state_path
        self.state = load_json(state_path, {"owned": []})

    def _save(self) -> None:
        save_json(self.state_path, self.state)

    def apply(self, config: dict, clients: List[dict], now_ts: float) -> Tuple[List[dict], Dict[str, bool]]:
        method = config.get("enforcement", "client_block")
        events: List[dict] = []
        if self.state.get("method", "client_block") != method:
            events.extend(self._release_other_method(method, clients))
            self.state["method"] = method
            self._save()
        if method == "traffic_rule":
            more, applied = self._apply_traffic_rules(config, clients, now_ts)
        else:
            more, applied = self._apply_client_block(config, clients, now_ts)
        return events + more, applied

    def _release_other_method(self, new_method: str, clients: List[dict]) -> List[dict]:
        """Undo blocks made by the previous enforcement method so switching
        methods never leaves a device stuck offline."""
        events: List[dict] = []
        if new_method == "traffic_rule":
            blocked = {c["mac"] for c in clients if c.get("blocked")}
            for mac in self.state.get("owned", []):
                if mac in blocked:
                    try:
                        self.gw.unblock(mac)
                        events.append(event("device_unblocked", "", mac=mac, message="Switched to traffic rules"))
                    except GatewayError as exc:
                        events.append(event("error", "", mac=mac, message=str(exc)))
            self.state["owned"] = []
        else:
            try:
                for rule in self.gw.traffic_rules():
                    if "[family-hub:" in rule.get("description", "") and rule.get("enabled"):
                        rule["enabled"] = False
                        self.gw.update_traffic_rule(rule)
            except GatewayError as exc:
                events.append(event("error", "", message=f"Could not switch off traffic rules: {exc}"))
        return events

    def _apply_client_block(self, config, clients, now_ts):
        desired = desired_device_state(config, now_ts)
        current = {c["mac"]: c.get("blocked", False) for c in clients}
        owned = set(self.state.get("owned", []))
        events: List[dict] = []

        def act(mac: str, block: bool, profile_id: str) -> None:
            try:
                (self.gw.block if block else self.gw.unblock)(mac)
                current[mac] = block
                (owned.add if block else owned.discard)(mac)
                events.append(event("device_blocked" if block else "device_unblocked",
                                    profile_id, mac=mac))
            except GatewayError as exc:
                LOG.error("Could not %s %s: %s", "block" if block else "unblock", mac, exc)
                events.append(event("error", profile_id, mac=mac, message=str(exc)))

        for mac, (want, profile_id) in desired.items():
            have = current.get(mac, False)
            if want and not have:
                act(mac, True, profile_id)
            elif not want and have:
                act(mac, False, profile_id)
            elif want:
                owned.add(mac)
        # Devices that were removed from every profile: release them.
        for mac in sorted(owned - set(desired)):
            if current.get(mac, False):
                act(mac, False, "")
            owned.discard(mac)

        self.state["owned"] = sorted(owned)
        self._save()
        applied = {mac: bool(current.get(mac, False)) for mac in desired}
        return events, applied

    def _apply_traffic_rules(self, config, clients, now_ts):
        tz = resolve_tz(config.get("timezone"))
        events: List[dict] = []
        applied: Dict[str, bool] = {}
        try:
            rules = self.gw.traffic_rules()
        except GatewayError as exc:
            return [event("error", "", message=f"Traffic rules unavailable: {exc}")], applied
        ours: Dict[str, dict] = {}
        for rule in rules:
            m = re.search(r"\[family-hub:([a-z0-9]+)\]", rule.get("description", ""))
            if m:
                ours[m.group(1)] = rule

        seen = set()
        for profile in config.get("profiles", []):
            pid = profile.get("id", "")
            seen.add(pid)
            macs = sorted({m for m in (norm_mac(x) for x in profile.get("devices", [])) if m})
            blocked = profile.get("enabled", True) and profile_state(profile, now_ts, tz)[0]
            # Never enable a rule with no targets: an empty target list could
            # match every device on the network.
            want_enabled = bool(blocked and macs)
            rule = ours.get(pid)
            try:
                if rule is None:
                    if want_enabled:
                        desc = f"Family Hub - {profile.get('name', pid)} " + RULE_TAG.format(id=pid)
                        self.gw.create_traffic_rule(new_traffic_rule(desc, macs, True))
                        events.append(event("profile_blocked", pid, message="Traffic rule created"))
                else:
                    have_macs = sorted(norm_mac(t.get("client_mac")) or "" for t in rule.get("target_devices", []))
                    changed = False
                    if macs and have_macs != macs:
                        rule["target_devices"] = [{"client_mac": m, "type": "CLIENT"} for m in macs]
                        changed = True
                    if bool(rule.get("enabled")) != want_enabled:
                        rule["enabled"] = want_enabled
                        changed = True
                    if changed:
                        self.gw.update_traffic_rule(rule)
                        events.append(event("profile_blocked" if want_enabled else "profile_unblocked", pid))
            except GatewayError as exc:
                LOG.error("Traffic rule for %s failed: %s", pid, exc)
                events.append(event("error", pid, message=str(exc)))
                continue
            for mac in macs:
                applied[mac] = want_enabled

        for pid, rule in ours.items():  # profile deleted -> switch its rule off
            if pid not in seen and rule.get("enabled"):
                rule["enabled"] = False
                try:
                    self.gw.update_traffic_rule(rule)
                    events.append(event("profile_unblocked", pid, message="Profile removed"))
                except GatewayError as exc:
                    events.append(event("error", pid, message=str(exc)))
        return events, applied


def mdm_targets(config: dict, now_ts: float) -> Dict[str, Tuple[bool, bool, str]]:
    """Wi-Fi MAC -> (blocked, locked, profile_id) for every device assigned to a kid."""
    tz = resolve_tz(config.get("timezone"))
    out: Dict[str, Tuple[bool, bool, str]] = {}
    for profile in config.get("profiles", []):
        if not profile.get("enabled", True):
            continue
        blocked, _ = profile_state(profile, now_ts, tz)
        locked = bool(profile.get("lock"))
        for mac in profile.get("devices", []):
            mac = norm_mac(mac)
            if not mac:
                continue
            prev = out.get(mac, (False, False, ""))
            out[mac] = (prev[0] or blocked, prev[1] or locked, prev[2] or profile.get("id", ""))
    return out


def event(kind: str, profile_id: str, mac: str = "", message: str = "") -> dict:
    return {"type": kind, "profile_id": profile_id, "mac": mac, "message": message, "ts": int(time.time())}


# --------------------------------------------------------------------------
# WordPress hub client
# --------------------------------------------------------------------------

class HubError(Exception):
    pass


class HubClient:
    def __init__(self, cfg: dict):
        self.url = cfg["url"].rstrip("/")
        self.token = cfg["token"]
        self.rest_prefix = cfg.get("rest_prefix", "/wp-json")
        self.ca_file = cfg.get("ca_file") or None
        self.timeout = float(cfg.get("timeout", 20))

    def sync(self, payload: dict) -> dict:
        endpoint = f"{self.url}{self.rest_prefix}/family-hub/v1/agent/sync"
        req = urllib.request.Request(
            endpoint, data=json.dumps(payload).encode(), method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Family-Hub-Token": self.token,
                "User-Agent": f"FamilyHubAgent/{VERSION}",
                "Cache-Control": "no-cache",
            })
        ctx = ssl.create_default_context(cafile=self.ca_file) if endpoint.startswith("https") else None
        try:
            with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read()[:300].decode("utf-8", "replace")
            raise HubError(f"Hub returned HTTP {exc.code}: {body}") from exc
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise HubError(f"Cannot reach hub: {exc}") from exc


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------

def load_json(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def save_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# Main loop
# --------------------------------------------------------------------------

class Agent:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        data_dir = os.path.expanduser(cfg.get("data_dir", "~/Library/Application Support/FamilyHub"))
        self.cache_path = os.path.join(data_dir, "config-cache.json")
        self.gateway = UniFiGateway(cfg["unifi"])
        self.hub = HubClient(cfg["hub"])
        self.enforcer = Enforcer(self.gateway, os.path.join(data_dir, "state.json"))
        self.config: Optional[dict] = load_json(self.cache_path, None)
        self.pending_events: List[dict] = []
        self.applied: Dict[str, bool] = {}
        self.gateway_info: dict = {}
        self.gateway_error = ""
        self.last_client_report = 0.0
        self.poll_interval = float(cfg.get("poll_interval", 10))
        self.mdm: Optional[mdm.MDMManager] = None
        if cfg.get("mdm", {}).get("api_key"):
            mdm_path = os.path.join(data_dir, "mdm-state.json")
            mdm_state = load_json(mdm_path, {})
            self.mdm = mdm.MDMManager(cfg["mdm"], mdm_state, lambda: save_json(mdm_path, mdm_state))

    def start(self) -> None:
        if self.mdm:
            self.mdm.start_servers()

    def cycle(self) -> None:
        now = time.time()
        clients: Optional[List[dict]] = None
        try:
            clients = self.gateway.clients()
            if not self.gateway_info:
                self.gateway_info = self.gateway.info()
            self.gateway_error = ""
        except GatewayError as exc:
            self.gateway_error = str(exc)
            LOG.error("%s", exc)

        report_clients = None
        if clients is not None and now - self.last_client_report >= CLIENT_REPORT_INTERVAL:
            report_clients = [c for c in clients
                              if c["online"] or now - c.get("last_seen", 0) < CLIENT_MAX_AGE][:400]
        if not self._sync(report_clients):
            LOG.warning("Using cached rules")

        events: List[dict] = []
        if self.config is not None and clients is not None:
            more, self.applied = self.enforcer.apply(self.config, clients, now)
            events.extend(more)
        if self.config is not None and self.mdm:
            # Phones are managed even when the router is unreachable.
            self.mdm.reconcile(mdm_targets(self.config, now), self.config.get("mdm") or {}, now)
            events.extend(self.mdm.drain_events())
        for e in events:
            LOG.info("%s %s %s %s", e["type"], e["profile_id"], e["mac"], e["message"])
        self.pending_events = (self.pending_events + events)[-500:]
        if events:  # report changes now so the dashboard updates promptly
            self._sync(None)
        if self.config is None:
            LOG.warning("No rules yet: waiting for first successful check-in with the hub")

    def _sync(self, clients: Optional[List[dict]]) -> bool:
        sent_events = self.pending_events[:100]
        payload: Dict[str, Any] = {
            "agent_version": VERSION,
            "hostname": socket.gethostname(),
            "gateway": dict(self.gateway_info, ok=not self.gateway_error, error=self.gateway_error),
            "applied": self.applied,
            "events": sent_events,
        }
        if clients is not None:
            payload["clients"] = clients
        if self.mdm:
            payload["mdm"] = self.mdm.report()
        try:
            response = self.hub.sync(payload)
        except HubError as exc:
            LOG.warning("%s", exc)
            return False
        self.pending_events = self.pending_events[len(sent_events):]
        if clients is not None:
            self.last_client_report = time.time()
        if isinstance(response.get("config"), dict):
            self.config = response["config"]
            save_json(self.cache_path, self.config)
        self.poll_interval = float(response.get("poll_interval", self.poll_interval))
        return True

    def run_forever(self) -> None:
        LOG.info("Family Hub agent %s starting", VERSION)
        self.start()
        while True:
            started = time.time()
            try:
                self.cycle()
            except Exception:  # noqa: BLE001 - never let the loop die
                LOG.exception("Unexpected error in sync cycle")
            time.sleep(max(2.0, self.poll_interval - (time.time() - started)))


def probe(cfg: dict) -> int:
    """Identify the gateway and check that every API the agent needs works."""
    gw = UniFiGateway(cfg["unifi"])
    ok = True
    print(f"Gateway: {cfg['unifi']['url']}")
    try:
        fp = gw.certificate_fingerprint()
        if fp:
            print(f"  TLS certificate SHA-256: {fp}")
            print("  (put this in unifi.tls_fingerprint_sha256 to pin the certificate)")
    except (OSError, ssl.SSLError) as exc:
        print(f"  !! Cannot connect: {exc}")
        return 1
    try:
        info = gw.info()
        print(f"  Controller type:   {gw.mode}")
        print(f"  Gateway model:     {info.get('gateway_model', 'unknown')} {info.get('gateway_name', '')}")
        print(f"  Gateway firmware:  {info.get('gateway_firmware', 'unknown')}")
        print(f"  Network app:       {info.get('network_version', 'unknown')}")
        for key in ("sysinfo_error", "device_error"):
            if key in info:
                print(f"  !! {info[key]}")
                ok = False
    except GatewayError as exc:
        print(f"  !! {exc}")
        if gw.api_key:
            print("  Hint: if your Network app is older than 9.0, or the API key is not accepted by\n"
                  "  the internal API, use a local admin username/password instead.")
        return 1
    try:
        clients = gw.clients()
        online = sum(1 for c in clients if c["online"])
        rand = sum(1 for c in clients if c["online"] and c["randomized"])
        print(f"  Clients:           {online} online, {len(clients)} known")
        if rand:
            print(f"  Note: {rand} online devices use a private (randomized) Wi-Fi address.")
    except GatewayError as exc:
        print(f"  !! Client list: {exc}")
        ok = False
    try:
        rules = gw.traffic_rules()
        print(f"  Traffic rules API: OK ({len(rules)} rules) - 'traffic_rule' enforcement available")
    except GatewayError as exc:
        print(f"  Traffic rules API: unavailable ({exc}) - use 'client_block' enforcement")
    if "hub" in cfg:
        try:
            HubClient(cfg["hub"]).sync({"agent_version": VERSION, "hostname": socket.gethostname(),
                                        "probe": True, "events": [], "applied": {}})
            print(f"Hub: {cfg['hub']['url']} OK")
        except HubError as exc:
            print(f"Hub: !! {exc}")
            ok = False
    return 0 if ok else 1


def list_clients(cfg: dict) -> int:
    gw = UniFiGateway(cfg["unifi"])
    clients = sorted(gw.clients(), key=lambda c: (not c["online"], (c["name"] or c["hostname"]).lower()))
    for c in clients:
        flags = ("online " if c["online"] else "       ") + ("wired " if c["wired"] else "wifi  ")
        flags += ("BLOCKED " if c["blocked"] else "") + ("private-mac" if c["randomized"] else "")
        print(f"{c['mac']}  {flags:<32} {c['name'] or c['hostname'] or c['oui']}")
    return 0


def mdm_command(args, cfg: dict) -> int:
    m = cfg.get("mdm") or {}
    if not m.get("api_key"):
        print("Device management isn't set up: run install-mdm-macos.sh first.", file=sys.stderr)
        return 2
    api = mdm.NanoMDM(m.get("nanomdm_url", "http://127.0.0.1:9000"), m["api_key"])
    if args.command == "mdm-pushcert":
        if len(args.args) != 2:
            print("usage: mdm-pushcert PUSH_CERT.pem PUSH_KEY.key [--key-password ...]", file=sys.stderr)
            return 2
        cert = open(args.args[0], "rb").read()
        key = mdm.unencrypted_key(open(args.args[1], "rb").read(), args.key_password)
        topic = api.upload_push_cert(cert.strip() + b"\n" + key)
        m["topic"] = topic
        m["push_cert_expires"] = mdm.cert_expiry(cert)
        cfg["mdm"] = m
        save_json(args.config, cfg)
        print(f"Push certificate stored. Topic: {topic}")
        print(f"Expires: {m['push_cert_expires'] or '?'}  (renew at identity.apple.com with the SAME Apple Account,")
        print("then run mdm-pushcert again and restart the agent)")
        return 0
    if args.command == "mdm-profile":
        if not m.get("topic"):
            print("Upload the push certificate first (mdm-pushcert).", file=sys.stderr)
            return 2
        data = mdm.enrollment_profile(m["public_url"], m["topic"], m["scep_challenge"])
        out = args.args[0] if args.args else "FamilyHub-enroll.mobileconfig"
        with open(out, "wb") as fh:
            fh.write(data)
        print(f"Wrote {out}")
        print(f"Apple Configurator server URL: {m['public_url'].rstrip('/')}/enroll/{m['enroll_token']}")
        return 0
    if args.command == "mdm-devices":
        state = load_json(os.path.join(os.path.expanduser(cfg.get(
            "data_dir", "~/Library/Application Support/FamilyHub")), "mdm-state.json"), {})
        devices = (state.get("mdm") or {}).get("devices", {})
        if not devices:
            print("No devices enrolled yet.")
        for d in devices.values():
            flags = ("supervised " if d.get("supervised") else "NOT-supervised ") + \
                    ("" if d.get("enrolled") else "UNENROLLED ") + \
                    ("downtime " if d.get("have", {}).get("downtime") else "") + \
                    ("LOCKED " if d.get("have", {}).get("lost") else "")
            print(f"{d.get('name') or '?':<24} {d.get('product', ''):<14} iOS {d.get('os', '?'):<8} "
                  f"{d.get('wifi_mac') or 'no-mac-yet':<18} {flags}")
        return 0
    return 2


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Family Hub home agent")
    parser.add_argument("command", nargs="?", default="run",
                        choices=["run", "once", "probe", "clients",
                                 "mdm-pushcert", "mdm-profile", "mdm-devices"])
    parser.add_argument("args", nargs="*", help="mdm-pushcert: CERT.pem KEY.pem | mdm-profile: [OUT]")
    parser.add_argument("--key-password", default="", help="mdm-pushcert: password for an encrypted push key")
    parser.add_argument("-c", "--config", default=os.path.expanduser(
        "~/Library/Application Support/FamilyHub/agent.json"))
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_json(args.config, None)
    if not isinstance(cfg, dict):
        print(f"Cannot read config file {args.config}", file=sys.stderr)
        return 2
    try:
        if args.command == "probe":
            return probe(cfg)
        if args.command == "clients":
            return list_clients(cfg)
        if args.command.startswith("mdm-"):
            return mdm_command(args, cfg)
        agent = Agent(cfg)
        if args.command == "once":
            agent.cycle()
            agent.cycle()  # second pass reports the results of the first
            return 0
        agent.run_forever()
    except (GatewayError, mdm.MDMError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
