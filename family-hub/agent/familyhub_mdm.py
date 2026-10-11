"""Apple device management (MDM) for the Family Hub agent.

Talks to a NanoMDM server running on the same Mac (plus a SCEP server that
issues each device its identity certificate). For every supervised iPhone/iPad
it keeps three things in the state Family Hub wants:

  baseline  - always-on profile: no VPNs, no erasing, no installing other
              profiles, no cellular-plan/eSIM changes, optional home Wi-Fi with
              the real (non-private) MAC address.
  downtime  - profile installed while the kid is blocked: only the allowed
              apps (Phone, Messages, Maps...) can be opened. Works on cellular.
  lost      - Lost Mode ("Lock completely"), with a message and phone number.

Devices are matched to kids by Wi-Fi MAC address, so a device assigned to a kid
on the dashboard covers both the network block and the phone itself.

NanoMDM reports device events to the agent through a webhook (local only).
The agent also runs the "front door" that the internet tunnel points at: it
forwards only /mdm and /scep to the servers and serves the enrollment profile.

Standard library only (Python 3.9+).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import http.client
import json
import logging
import plistlib
import threading
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, List, Optional, Tuple

LOG = logging.getLogger("familyhub.mdm")

DOWNTIME_ID = "com.jansick.familyhub.downtime"
BASELINE_ID = "com.jansick.familyhub.baseline"
ENROLL_ID = "com.jansick.familyhub.enroll"
NS = uuid.UUID("7d0f4c8e-3b1a-4f62-9a55-2f1e6c0b9d41")  # stable payload UUIDs

DEFAULT_DOWNTIME_APPS = [
    "com.apple.mobilephone",       # Phone
    "com.apple.MobileSMS",         # Messages
    "com.apple.Maps",
    "com.apple.mobiletimer",       # Clock (alarms)
    "com.apple.findmy",
    "com.apple.MobileAddressBook",  # Contacts
]
ALWAYS_ALLOWED = ["com.apple.Preferences"]  # Settings

INFO_QUERIES = ["DeviceName", "Model", "ModelName", "ProductName", "OSVersion", "SerialNumber",
                "WiFiMAC", "IsSupervised", "BatteryLevel", "IsActivationLockEnabled"]
INFO_REFRESH = 6 * 3600
RETRY_AFTER_ERROR = 600
REPUSH_EVERY = 300
CERT_CHECK_EVERY = 6 * 3600
MAX_BODY = 20 * 1024 * 1024


class MDMError(Exception):
    pass


def norm_mac(mac: Any) -> Optional[str]:
    if not isinstance(mac, str):
        return None
    m = mac.strip().lower().replace("-", ":")
    parts = m.split(":")
    if len(parts) != 6 or not all(len(p) == 2 for p in parts):
        return None
    try:
        [int(p, 16) for p in parts]
    except ValueError:
        return None
    return m


def digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:16]


# --------------------------------------------------------------------------
# Profiles
# --------------------------------------------------------------------------

def _payload_uuid(*parts: str) -> str:
    return str(uuid.uuid5(NS, "/".join(parts))).upper()


def mobileconfig(identifier: str, display_name: str, payloads: List[dict],
                 description: str = "", removal_disallowed: bool = True) -> bytes:
    content = []
    for i, p in enumerate(payloads):
        p = dict(p)
        p.setdefault("PayloadIdentifier", f"{identifier}.{i}")
        p.setdefault("PayloadUUID", _payload_uuid(identifier, str(i), p["PayloadType"]))
        p.setdefault("PayloadVersion", 1)
        content.append(p)
    profile = {
        "PayloadContent": content,
        "PayloadDisplayName": display_name,
        "PayloadDescription": description,
        "PayloadIdentifier": identifier,
        "PayloadOrganization": "Family Hub",
        "PayloadType": "Configuration",
        "PayloadUUID": _payload_uuid(identifier),
        "PayloadVersion": 1,
        "PayloadRemovalDisallowed": removal_disallowed,
    }
    return plistlib.dumps(profile)


def downtime_profile(apps: List[str]) -> bytes:
    allowed = sorted(set(apps) | set(ALWAYS_ALLOWED))
    return mobileconfig(DOWNTIME_ID, "Family Hub: Downtime", [{
        "PayloadType": "com.apple.applicationaccess",
        "PayloadDisplayName": "Downtime apps",
        "allowListedAppBundleIDs": allowed,  # supervised only
    }], "Screens are off. Only essential apps can be opened.")


def platform_of(product: str) -> str:
    """'macos' for Macs (ProductName like Mac14,2 / MacBookPro18,3 / iMac21,1), else 'ios'."""
    return "macos" if (product or "").startswith(("Mac", "iMac")) else "ios"


def baseline_profile(settings: dict, platform: str = "ios") -> bytes:
    if platform == "macos":
        # Macs: no erasing; everything else on the home network is handled by the router.
        restrictions = {"PayloadType": "com.apple.applicationaccess",
                        "PayloadDisplayName": "Family Hub restrictions",
                        "allowEraseContentAndSettings": False}
        return _baseline(settings, restrictions)
    restrictions = {
        "PayloadType": "com.apple.applicationaccess",
        "PayloadDisplayName": "Family Hub restrictions",
        "allowVPNCreation": False,
        "allowEraseContentAndSettings": False,
        "allowUIConfigurationProfileInstallation": False,
        "allowCellularPlanModification": False,
        "allowESIMModification": False,
        "forceAutomaticDateAndTime": True,
    }
    return _baseline(settings, restrictions)


def _baseline(settings: dict, restrictions: dict) -> bytes:
    payloads = [restrictions]
    wifi = settings.get("home_wifi") or {}
    if wifi.get("ssid"):
        payload = {
            "PayloadType": "com.apple.wifi.managed",
            "PayloadDisplayName": "Home Wi-Fi",
            "SSID_STR": wifi["ssid"],
            "AutoJoin": True,
            # Real hardware MAC on the home network, so the router knows the device.
            "DisableAssociationMACRandomization": True,
            "EncryptionType": wifi.get("encryption", "Any"),
        }
        if wifi.get("password"):
            payload["Password"] = wifi["password"]
        payloads.append(payload)
    return mobileconfig(BASELINE_ID, "Family Hub", payloads,
                        "House rules for this device, managed by Mom & Dad.")


def enrollment_profile(public_url: str, topic: str, scep_challenge: str) -> bytes:
    base = public_url.rstrip("/")
    scep_uuid = _payload_uuid(ENROLL_ID, "scep")
    return mobileconfig(ENROLL_ID, "Family Hub", [
        {
            "PayloadType": "com.apple.security.scep",
            "PayloadUUID": scep_uuid,
            "PayloadIdentifier": ENROLL_ID + ".scep",
            "PayloadDisplayName": "Family Hub device identity",
            "PayloadContent": {
                "URL": base + "/scep",
                "Challenge": scep_challenge,
                "Key Type": "RSA",
                "Keysize": 2048,
                "Key Usage": 5,
            },
        },
        {
            "PayloadType": "com.apple.mdm",
            "PayloadIdentifier": ENROLL_ID + ".mdm",
            "PayloadDisplayName": "Family Hub device management",
            "AccessRights": 8191,
            "CheckOutWhenRemoved": True,
            "IdentityCertificateUUID": scep_uuid,
            "ServerURL": base + "/mdm",
            "ServerCapabilities": ["com.apple.mdm.per-user-connections"],
            "SignMessage": True,
            "Topic": topic,
        },
    ], "Lets Mom & Dad manage this device with Family Hub.")


def cert_expiry(pem: bytes) -> str:
    """notAfter of a PEM certificate as ISO 8601 UTC, or ""."""
    import subprocess
    from datetime import datetime
    proc = subprocess.run(["openssl", "x509", "-noout", "-enddate"], input=pem, capture_output=True)
    line = proc.stdout.decode().strip()
    if proc.returncode != 0 or not line.startswith("notAfter="):
        return ""
    try:
        when = datetime.strptime(line.split("=", 1)[1].replace("  ", " "), "%b %d %H:%M:%S %Y %Z")
    except ValueError:
        return ""
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def unencrypted_key(pem: bytes, password: str = "") -> bytes:
    """NanoMDM needs the push key without a password. mdmctl writes it encrypted."""
    if b"ENCRYPTED" not in pem:
        return pem.strip() + b"\n"
    if not password:
        raise MDMError("The push key is password-protected: pass --key-password")
    import os
    import subprocess
    proc = subprocess.run(["openssl", "rsa", "-passin", "env:FH_PUSH_KEY_PASSWORD"], input=pem,
                          capture_output=True, env=dict(os.environ, FH_PUSH_KEY_PASSWORD=password))
    if proc.returncode != 0 or b"PRIVATE KEY" not in proc.stdout:
        raise MDMError("Could not decrypt the push key (wrong password?)")
    return proc.stdout.strip() + b"\n"


# --------------------------------------------------------------------------
# NanoMDM API client
# --------------------------------------------------------------------------

class NanoMDM:
    def __init__(self, url: str, api_key: str, timeout: float = 10):
        u = urllib.parse.urlsplit(url)
        self.host, self.port = u.hostname or "127.0.0.1", u.port or 9000
        self.auth = "Basic " + base64.b64encode(f"nanomdm:{api_key}".encode()).decode()
        self.timeout = timeout
        self.push_error = ""  # last Apple push failure, cleared by the next success

    def _req(self, method: str, path: str, body: Optional[bytes] = None, allow_error: bool = False) -> dict:
        conn = http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)
        try:
            conn.request(method, path, body=body, headers={"Authorization": self.auth})
            resp = conn.getresponse()
            raw = resp.read()
        except (OSError, http.client.HTTPException) as exc:
            raise MDMError(f"Cannot reach NanoMDM at {self.host}:{self.port}: {exc}") from exc
        finally:
            conn.close()
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            data = {"raw": raw[:200].decode("utf-8", "replace")}
        if resp.status >= 400 and not (allow_error and isinstance(data, dict)):
            raise MDMError(f"NanoMDM {method} {path.split('?')[0]} -> HTTP {resp.status}: {data}")
        return data

    def enqueue(self, ids: List[str], command: dict) -> str:
        command_uuid = str(uuid.uuid4()).upper()
        body = plistlib.dumps({"Command": command, "CommandUUID": command_uuid})
        # NanoMDM answers 500 when the command was queued but Apple's push failed
        # (e.g. the internet is down). The command is still delivered the next time
        # the device checks in, and the agent re-pushes, so that counts as sent.
        data = self._req("PUT", "/v1/enqueue/" + ",".join(ids), body, allow_error=True)
        status = data.get("status") or {}
        for i in ids:
            err = (status.get(i) or {}).get("enqueue_error")
            if err:
                raise MDMError(f"Could not queue {command['RequestType']} for {i}: {err}")
        if data.get("enqueue_error") or (data.get("command_uuid") or "").upper() != command_uuid:
            raise MDMError(f"Could not queue {command['RequestType']}: {data}")
        self._note_push(status, command["RequestType"])
        return command_uuid

    def _note_push(self, status: dict, what: str = "push") -> None:
        errors = [(i, s.get("push_error")) for i, s in status.items() if (s or {}).get("push_error")]
        if errors:
            detail = str(errors[0][1]).rsplit(": ", 1)[-1]
            self.push_error = f"Can't reach Apple's push service ({detail}). Phones get changes when they next check in."
            LOG.warning("%s for %s: %s", what, errors[0][0], errors[0][1])
        elif status:
            self.push_error = ""

    def push(self, ids: List[str]) -> dict:
        data = self._req("GET", "/v1/push/" + ",".join(ids), allow_error=True)
        self._note_push(data.get("status") or {})
        return data

    def upload_push_cert(self, pem: bytes) -> str:
        return self._req("PUT", "/v1/pushcert", pem).get("topic", "")

    def push_cert_info(self, topic: str) -> dict:
        # Newer NanoMDM only; v0.9.0 has no read API (expiry comes from the cert file instead).
        return self._req("GET", "/v1/pushcert?topic=" + urllib.parse.quote(topic))


# --------------------------------------------------------------------------
# Manager
# --------------------------------------------------------------------------

ASPECTS = ("baseline", "downtime", "lost")


class MDMManager:
    def __init__(self, cfg: dict, state: dict, save: Callable[[], None],
                 api: Optional[NanoMDM] = None):
        self.cfg = cfg
        self.api = api or NanoMDM(cfg.get("nanomdm_url", "http://127.0.0.1:9000"), cfg["api_key"])
        self.state = state.setdefault("mdm", {})
        self.state.setdefault("devices", {})
        self.state.setdefault("commands", {})
        self._save = save
        self.lock = threading.RLock()
        self.events: List[dict] = []
        self.error = ""
        self.cert_info: dict = self.state.get("cert_info") or (
            {"not_after": cfg["push_cert_expires"]} if cfg.get("push_cert_expires") else {})
        self.last_cert_check = 0.0
        self.servers: List[ThreadingHTTPServer] = []

    # -- bookkeeping ------------------------------------------------------

    def save(self) -> None:
        with self.lock:
            self._save()

    def _event(self, kind: str, udid: str = "", message: str = "", profile_id: str = "") -> None:
        dev = self.state["devices"].get(udid, {})
        name = dev.get("name") or dev.get("product") or udid[:8]
        self.events.append({"type": kind, "profile_id": profile_id, "mac": dev.get("wifi_mac", "") or "",
                            "message": f"{name}: {message}" if message else name, "ts": int(time.time())})

    def drain_events(self) -> List[dict]:
        with self.lock:
            out, self.events = self.events, []
            return out

    def _device(self, udid: str) -> dict:
        devs = self.state["devices"]
        if udid not in devs:
            devs[udid] = {"udid": udid, "enrolled": True, "have": {}, "pending": {}, "retry_at": {},
                          "first_seen": int(time.time())}
        return devs[udid]

    # -- webhook ----------------------------------------------------------

    def handle_webhook(self, event: dict) -> None:
        topic = event.get("topic", "")
        with self.lock:
            if "checkin_event" in event:
                self._on_checkin(topic, event["checkin_event"] or {})
            elif "acknowledge_event" in event:
                self._on_ack(event["acknowledge_event"] or {})
            self.save()

    @staticmethod
    def _payload(ev: dict) -> dict:
        try:
            return plistlib.loads(base64.b64decode(ev.get("raw_payload") or ""))
        except Exception:  # noqa: BLE001 - malformed payload
            return {}

    @staticmethod
    def _udid(ev: dict, payload: dict) -> str:
        ids = ev.get("ids") or {}
        if ids.get("type") not in (None, "Device"):
            return ""  # user-channel messages: not used
        return ev.get("udid") or payload.get("UDID") or ids.get("id") or ""

    def _on_checkin(self, topic: str, ev: dict) -> None:
        payload = self._payload(ev)
        udid = self._udid(ev, payload)
        if not udid:
            return
        dev = self._device(udid)
        dev["last_seen"] = int(time.time())
        if topic == "mdm.Authenticate":
            # Fresh enrollment: a newly set-up device has none of our profiles yet.
            dev.update({"enrolled": True, "have": {"downtime": False, "lost": False},
                        "pending": {}, "retry_at": {}, "info_at": 0})
            for k_src, k_dst in (("SerialNumber", "serial"), ("ProductName", "product"),
                                 ("Model", "model"), ("OSVersion", "os"), ("DeviceName", "name")):
                if payload.get(k_src):
                    dev[k_dst] = payload[k_src]
            dev["platform"] = platform_of(dev.get("product", ""))
            self._event("mdm_enrolled", udid, "enrolled in device management")
        elif topic == "mdm.TokenUpdate":
            dev["enrolled"] = True
            dev["pushable"] = True
        elif topic == "mdm.CheckOut":
            dev.update({"enrolled": False, "pushable": False, "pending": {}})
            self._event("mdm_removed", udid, "left device management")

    def _on_ack(self, ev: dict) -> None:
        payload = self._payload(ev)
        udid = self._udid(ev, payload)
        if not udid:
            return
        dev = self._device(udid)
        dev["last_seen"] = int(time.time())
        status = ev.get("status") or payload.get("Status", "")
        cu = (ev.get("command_uuid") or payload.get("CommandUUID") or "").upper()
        cmd = self.state["commands"].pop(cu, None) if cu and status != "NotNow" else None
        if not cmd:
            return
        aspect, value = cmd["aspect"], cmd.get("value")
        pending = dev["pending"].get(aspect)
        is_current = pending and pending.get("cu") == cu
        if status == "Acknowledged":
            if aspect == "info":
                self._apply_info(dev, payload.get("QueryResponses") or {})
                dev["info_at"] = int(time.time())
            else:
                dev["have"][aspect] = value
                dev.pop("error", None)
                if aspect == "downtime":
                    self._event("mdm_downtime_on" if value else "mdm_downtime_off", udid,
                                "apps locked" if value else "apps unlocked", cmd.get("profile_id", ""))
                elif aspect == "lost":
                    self._event("mdm_locked" if value else "mdm_unlocked", udid,
                                "locked (Lost Mode)" if value else "unlocked", cmd.get("profile_id", ""))
        elif status == "Error":
            chain = payload.get("ErrorChain") or [{}]
            msg = chain[0].get("LocalizedDescription") or chain[0].get("USEnglishDescription") or "error"
            if cmd["kind"] in ("RemoveProfile", "DisableLostMode"):
                dev["have"][aspect] = False  # nothing to remove: already in the wanted state
            else:
                dev["error"] = f"{cmd['kind']}: {msg}"
                dev["retry_at"][aspect] = int(time.time()) + RETRY_AFTER_ERROR
                self._event("error", udid, f"{cmd['kind']} failed: {msg}", cmd.get("profile_id", ""))
        if is_current:
            dev["pending"].pop(aspect, None)

    @staticmethod
    def _apply_info(dev: dict, q: dict) -> None:
        mapping = {"DeviceName": "name", "ProductName": "product", "ModelName": "model_name",
                   "Model": "model", "OSVersion": "os", "SerialNumber": "serial"}
        for src, dst in mapping.items():
            if q.get(src):
                dev[dst] = str(q[src])
        if q.get("ProductName"):
            dev["platform"] = platform_of(str(q["ProductName"]))
        if q.get("WiFiMAC"):
            dev["wifi_mac"] = norm_mac(q["WiFiMAC"]) or dev.get("wifi_mac")
        if "IsSupervised" in q:
            dev["supervised"] = bool(q["IsSupervised"])
        if "BatteryLevel" in q:
            try:
                dev["battery"] = round(float(q["BatteryLevel"]) * 100)
            except (TypeError, ValueError):
                pass
        if "IsActivationLockEnabled" in q:
            dev["activation_lock"] = bool(q["IsActivationLockEnabled"])

    # -- reconcile --------------------------------------------------------

    def _send(self, dev: dict, aspect: str, kind: str, command: dict, value: Any, profile_id: str = "") -> None:
        command = dict(command, RequestType=kind)
        try:
            cu = self.api.enqueue([dev["udid"]], command)
        except MDMError as exc:
            self.error = str(exc)
            LOG.error("%s", exc)
            return
        self.error = ""
        now = int(time.time())
        self.state["commands"][cu] = {"udid": dev["udid"], "aspect": aspect, "kind": kind,
                                      "value": value, "at": now, "profile_id": profile_id}
        dev["pending"][aspect] = {"cu": cu, "value": value, "at": now, "pushed": now}
        LOG.info("Queued %s for %s", kind, dev.get("name") or dev["udid"])

    def reconcile(self, desired: Dict[str, Tuple[bool, bool, str]], settings: dict, now: float) -> None:
        """desired: wifi MAC -> (blocked, locked, profile_id) for every device assigned to a kid."""
        apps = settings.get("downtime_apps") or DEFAULT_DOWNTIME_APPS
        lock_msg = settings.get("lock_message") or "This device is locked by Mom & Dad."
        lock_phone = settings.get("lock_phone") or ""
        baseline_cfg = {"home_wifi": self.cfg.get("home_wifi") or {}}
        want_baseline = digest(baseline_cfg)
        want_downtime = digest(sorted(apps))
        want_lost = digest([lock_msg, lock_phone])

        with self.lock:
            self._check_cert(now)
            self._expire_commands(now)
            for dev in self.state["devices"].values():
                if not dev.get("enrolled"):
                    continue
                blocked, locked, pid = desired.get(dev.get("wifi_mac") or "", (False, False, ""))
                if now - dev.get("info_at", 0) > INFO_REFRESH and "info" not in dev["pending"]:
                    self._send(dev, "info", "DeviceInformation", {"Queries": INFO_QUERIES}, None)
                is_mac = dev.get("platform") == "macos"
                targets = {
                    "baseline": want_baseline + ("-mac" if is_mac else ""),
                    # Downtime profiles and Lost Mode are iPhone/iPad features. Macs are
                    # cut off by the router at home instead.
                    "downtime": want_downtime if blocked and not is_mac else False,
                    "lost": want_lost if locked and not is_mac else False,
                }
                for aspect in ASPECTS:
                    want = targets[aspect]
                    pending = dev["pending"].get(aspect)
                    if pending:
                        if pending["value"] == want:
                            if now - pending.get("pushed", 0) > REPUSH_EVERY:
                                pending["pushed"] = int(now)
                                try:
                                    self.api.push([dev["udid"]])
                                except MDMError as exc:
                                    LOG.warning("%s", exc)
                            continue
                        # Wanted state flipped while a command is still queued: queue the
                        # opposite one behind it (the device runs them in order).
                    elif dev["have"].get(aspect) == want:
                        continue
                    if now < dev["retry_at"].get(aspect, 0):
                        continue
                    if aspect == "baseline":
                        profile = baseline_profile(baseline_cfg, "macos" if is_mac else "ios")
                        self._send(dev, aspect, "InstallProfile", {"Payload": profile}, want)
                    elif aspect == "downtime":
                        if want:
                            self._send(dev, aspect, "InstallProfile", {"Payload": downtime_profile(apps)}, want, pid)
                        else:
                            self._send(dev, aspect, "RemoveProfile", {"Identifier": DOWNTIME_ID}, False, pid)
                    elif aspect == "lost":
                        if want:
                            cmd = {"Message": lock_msg, "Footnote": "Family Hub"}
                            if lock_phone:
                                cmd["PhoneNumber"] = lock_phone
                            self._send(dev, aspect, "EnableLostMode", cmd, want, pid)
                        else:
                            self._send(dev, aspect, "DisableLostMode", {}, False, pid)
            self.save()

    def _expire_commands(self, now: float) -> None:
        # Forget commands for devices that never answered in a week (phone lost, sold...).
        for cu, cmd in list(self.state["commands"].items()):
            if now - cmd.get("at", 0) > 7 * 86400:
                self.state["commands"].pop(cu, None)

    def _check_cert(self, now: float) -> None:
        topic = self.cfg.get("topic")
        if not topic or now - self.last_cert_check < CERT_CHECK_EVERY:
            return
        self.last_cert_check = now
        try:
            self.cert_info = self.api.push_cert_info(topic)
            self.state["cert_info"] = self.cert_info
        except MDMError:
            pass  # older NanoMDM: keep the expiry recorded at upload time

    # -- reporting --------------------------------------------------------

    def report(self) -> dict:
        with self.lock:
            devices = []
            for d in self.state["devices"].values():
                devices.append({
                    "udid": d["udid"],
                    "name": d.get("name", ""),
                    "product": d.get("product", ""),
                    "platform": d.get("platform", "ios"),
                    "model": d.get("model_name") or d.get("model", ""),
                    "os": d.get("os", ""),
                    "serial": d.get("serial", ""),
                    "wifi_mac": d.get("wifi_mac", ""),
                    "supervised": d.get("supervised"),
                    "enrolled": bool(d.get("enrolled")),
                    "last_seen": d.get("last_seen", 0),
                    "battery": d.get("battery"),
                    "downtime": bool(d["have"].get("downtime")),
                    "locked": bool(d["have"].get("lost")),
                    "baseline": bool(d["have"].get("baseline")),
                    "pending": sorted(k for k in d["pending"] if k != "info"),
                    "error": d.get("error", ""),
                })
            return {
                "ok": not (self.error or self.api.push_error),
                "error": self.error or self.api.push_error,
                "topic": self.cfg.get("topic", ""),
                "push_cert_expires": self.cert_info.get("not_after", ""),
                "public_url": self.cfg.get("public_url", ""),
                "devices": devices,
            }

    # -- servers ----------------------------------------------------------

    def enroll_bytes(self) -> bytes:
        if not self.cfg.get("topic"):
            raise MDMError("No push certificate yet: run 'familyhub_agent.py mdm-pushcert' first")
        return enrollment_profile(self.cfg["public_url"], self.cfg["topic"], self.cfg["scep_challenge"])

    def start_servers(self) -> None:
        webhook = self.cfg.get("webhook_listen", "127.0.0.1:9010")
        front = self.cfg.get("front_listen", "127.0.0.1:9100")
        for listen, handler in ((webhook, self._webhook_handler()), (front, self._front_handler())):
            host, port = listen.rsplit(":", 1)
            server = ThreadingHTTPServer((host, int(port)), handler)
            server.daemon_threads = True
            server.handle_error = lambda request, addr: LOG.debug("Connection from %s dropped", addr)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            self.servers.append(server)
            LOG.info("Listening on %s:%s", host, server.server_address[1])

    def stop_servers(self) -> None:
        for s in self.servers:
            s.shutdown()
            s.server_close()
        self.servers = []

    def _webhook_handler(self):
        mgr = self
        secret = (self.cfg.get("webhook_secret") or "").encode()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(min(n, MAX_BODY))
                if secret:
                    want = base64.b64encode(hmac.new(secret, body, hashlib.sha256).digest()).decode()
                    if not hmac.compare_digest(want, self.headers.get("X-Hmac-Signature", "")):
                        self.send_response(401)
                        self.end_headers()
                        return
                try:
                    mgr.handle_webhook(json.loads(body))
                except Exception:  # noqa: BLE001 - never fail NanoMDM's request
                    LOG.exception("Bad webhook event")
                self.send_response(200)
                self.end_headers()

        return Handler

    def _front_handler(self):
        """Public entry point (behind the tunnel). Only /mdm, /scep and the
        enrollment profile are reachable; the NanoMDM API and webhook are not."""
        mgr = self
        upstreams = {
            "/mdm": urllib.parse.urlsplit(self.cfg.get("nanomdm_url", "http://127.0.0.1:9000")),
            "/scep": urllib.parse.urlsplit(self.cfg.get("scep_url", "http://127.0.0.1:8080")),
        }
        enroll_path = "/enroll/" + self.cfg.get("enroll_token", "")
        hop = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
               "trailers", "transfer-encoding", "upgrade", "host", "content-length"}

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *a):
                pass

            def _plain(self, code, text=b""):
                self.send_response(code)
                self.send_header("Content-Length", str(len(text)))
                self.end_headers()
                self.wfile.write(text)

            def _route(self):
                path = urllib.parse.urlsplit(self.path).path
                if self.command == "GET" and mgr.cfg.get("enroll_token") and path == enroll_path:
                    try:
                        data = mgr.enroll_bytes()
                    except MDMError as exc:
                        return self._plain(503, str(exc).encode())
                    self.send_response(200)
                    self.send_header("Content-Type", "application/x-apple-aspen-config")
                    self.send_header("Content-Disposition", 'attachment; filename="FamilyHub.mobileconfig"')
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
                up = upstreams.get(path)
                if up is None or self.command not in ("GET", "POST", "PUT"):
                    return self._plain(404)
                n = int(self.headers.get("Content-Length") or 0)
                if n > MAX_BODY:
                    return self._plain(413)
                body = self.rfile.read(n) if n else None
                headers = {k: v for k, v in self.headers.items() if k.lower() not in hop}
                headers["X-Forwarded-For"] = self.headers.get("X-Forwarded-For") or self.client_address[0]
                conn = http.client.HTTPConnection(up.hostname, up.port or 80, timeout=60)
                try:
                    conn.request(self.command, self.path, body=body, headers=headers)
                    resp = conn.getresponse()
                    data = resp.read()
                except (OSError, http.client.HTTPException):
                    return self._plain(502)
                finally:
                    conn.close()
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in hop:
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST = do_PUT = _route

            def do_DELETE(self):
                self._plain(404)

        return Handler
