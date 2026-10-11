"""Tests for the Family Hub agent: schedule logic, plus a full sync/enforce loop
against a fake UniFi OS gateway and a fake WordPress hub.

Run: python3 -m unittest discover -s family-hub/agent/tests
"""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import familyhub_agent as fa  # noqa: E402

UTC = timezone.utc


def at(y, mo, d, hh, mm):
    return datetime(y, mo, d, hh, mm, tzinfo=UTC)


# 2026-10-11 is a Sunday.
SCHOOL_NIGHTS = [{"days": [0, 1, 2, 3, 4], "start": "21:00", "end": "07:00"}]


class ScheduleTests(unittest.TestCase):
    def test_overnight_window(self):
        self.assertFalse(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 11, 20, 59)))  # Sun 8:59pm
        self.assertTrue(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 11, 21, 0)))   # Sun 9pm
        self.assertTrue(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 12, 6, 59)))   # Mon 6:59am
        self.assertFalse(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 12, 7, 0)))   # Mon 7am

    def test_overnight_spills_into_unlisted_day(self):
        # Thursday night continues into Friday morning even though Friday isn't listed.
        self.assertTrue(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 16, 6, 0)))    # Fri 6am
        self.assertFalse(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 16, 22, 0)))  # Fri 10pm
        # Saturday morning: Friday isn't listed, so no spill.
        self.assertFalse(fa.in_downtime(SCHOOL_NIGHTS, at(2026, 10, 17, 6, 0)))

    def test_same_day_and_all_day(self):
        school = [{"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "15:00"}]
        self.assertTrue(fa.in_downtime(school, at(2026, 10, 12, 8, 0)))
        self.assertFalse(fa.in_downtime(school, at(2026, 10, 12, 15, 0)))
        self.assertFalse(fa.in_downtime(school, at(2026, 10, 11, 10, 0)))  # Sunday
        all_day = [{"days": [3], "start": "00:00", "end": "00:00"}]
        self.assertTrue(fa.in_downtime(all_day, at(2026, 10, 14, 13, 0)))
        self.assertFalse(fa.in_downtime(all_day, at(2026, 10, 15, 13, 0)))

    def test_overrides(self):
        now = at(2026, 10, 11, 22, 0).timestamp()  # in downtime
        p = {"enabled": True, "schedule": SCHOOL_NIGHTS, "override": None}
        self.assertEqual(fa.profile_state(p, now, UTC), (True, "schedule"))
        p["override"] = {"mode": "allow", "until": now + 900}
        self.assertEqual(fa.profile_state(p, now, UTC), (False, "override"))
        self.assertEqual(fa.profile_state(p, now + 901, UTC), (True, "schedule"))  # expired
        p["override"] = {"mode": "block", "until": None}
        self.assertEqual(fa.profile_state(p, now + 86400 * 3, UTC), (True, "override"))
        p["enabled"] = False
        self.assertEqual(fa.profile_state(p, now, UTC), (False, "disabled"))

    def test_winddown_starts_later(self):
        now = at(2026, 10, 11, 15, 0).timestamp()
        p = {"enabled": True, "schedule": [], "override": {"mode": "block", "start": now + 900, "until": None}}
        self.assertEqual(fa.profile_state(p, now, UTC), (False, "schedule"))
        self.assertEqual(fa.profile_state(p, now + 899, UTC), (False, "schedule"))
        self.assertEqual(fa.profile_state(p, now + 900, UTC), (True, "override"))
        self.assertEqual(fa.profile_state(p, now + 86400, UTC), (True, "override"))

    def test_daily_limit(self):
        now = at(2026, 10, 12, 16, 0).timestamp()  # Monday
        week = [180, 120, 120, 120, 120, 120, 180]  # Sun..Sat
        p = {"enabled": True, "schedule": [], "override": None, "allowance": week}
        self.assertEqual(fa.profile_state(p, now, UTC, 119), (False, "schedule"))
        self.assertEqual(fa.profile_state(p, now, UTC, 120), (True, "limit"))
        self.assertEqual(fa.profile_state(p, now, UTC, None), (False, "schedule"), "unknown usage never blocks")
        p["override"] = {"mode": "allow", "until": now + 900}
        self.assertEqual(fa.profile_state(p, now, UTC, 500), (False, "override"), "bonus time beats the limit")
        p["override"] = None
        p["allowance"] = [None] * 7
        self.assertEqual(fa.profile_state(p, now, UTC, 999), (False, "schedule"))

    def test_usage_tracker_counts_active_minutes(self):
        state = {}
        t = fa.UsageTracker(state)
        cfg = {"timezone": "UTC", "usage_threshold_kb": 100, "profiles": [
            {"id": "ava", "devices": ["00:11:22:33:44:01", "00:11:22:33:44:02"]},
            {"id": "liam", "devices": ["00:11:22:33:44:05"]}]}
        base = at(2026, 10, 12, 16, 0).timestamp()

        def sample(sec, ava_phone, xbox, liam):
            return t.observe([
                {"mac": "00:11:22:33:44:01", "online": True, "bytes": ava_phone},
                {"mac": "00:11:22:33:44:02", "online": True, "bytes": xbox},
                {"mac": "00:11:22:33:44:05", "online": True, "bytes": liam},
                {"mac": "aa:aa:aa:aa:aa:aa", "online": True, "bytes": 10 ** 9},
            ], cfg, base + sec)

        sample(0, 0, 0, 0)                      # baseline
        sample(10, 50_000, 0, 10_000)           # below threshold
        sample(20, 200_000, 0, 20_000)          # Ava's phone crosses 100 KB this minute
        sample(30, 200_000, 500_000, 30_000)    # Xbox too: same minute, counted once
        self.assertEqual(t.today, {"ava": 1})
        sample(70, 400_000, 500_000, 30_000)    # next minute, phone busy again
        sample(130, 400_000, 500_000, 40_000)   # idle-ish minute
        self.assertEqual(t.today, {"ava": 2})
        sample(140, 50_000, 500_000, 40_000)    # phone reconnected: counter reset, 50 KB
        self.assertEqual(t.today, {"ava": 2})
        # New day resets.
        t.observe([], cfg, base + 9 * 3600)
        self.assertEqual(t.today, {})
        self.assertEqual(state["usage"]["day"], "2026-10-13")

    def test_shared_device_blocked_if_any_profile_blocked(self):
        cfg = {"timezone": "UTC", "profiles": [
            {"id": "a", "enabled": True, "devices": ["AA-BB-CC-00-00-01"], "override": {"mode": "block", "until": None}},
            {"id": "b", "enabled": True, "devices": ["aa:bb:cc:00:00:01"], "override": None},
        ]}
        self.assertEqual(fa.desired_device_state(cfg, time.time()), {"aa:bb:cc:00:00:01": (True, "a")})

    def test_timezone_resolution(self):
        self.assertEqual(fa.resolve_tz("+05:30").utcoffset(None).total_seconds(), 5.5 * 3600)
        tz = fa.resolve_tz("America/New_York")
        self.assertEqual(datetime(2026, 7, 1, 12, tzinfo=tz).utcoffset().total_seconds(), -4 * 3600)

    def test_randomized_mac(self):
        self.assertTrue(fa.is_randomized_mac("da:a1:19:00:00:01"))
        self.assertFalse(fa.is_randomized_mac("00:1a:2b:00:00:01"))


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeUniFi:
    """Just enough of a UniFi OS console + Network app."""

    def __init__(self):
        self.clients = {
            "00:11:22:33:44:01": {"name": "Ava iPhone", "online": True, "wired": False},
            "00:11:22:33:44:02": {"name": "Xbox", "online": True, "wired": True},
            "00:11:22:33:44:03": {"name": "Parent Mac", "online": True, "wired": False},
        }
        self.blocked = set()
        self.rules = []
        self.calls = []
        self.logins = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, payload, headers=None):
                body = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _authed(self):
                return "TOKEN=abc" in (self.headers.get("Cookie") or "")

            def _body(self):
                n = int(self.headers.get("Content-Length") or 0)
                return json.loads(self.rfile.read(n) or b"null")

            def do_POST(self):
                body = self._body()
                outer.calls.append(("POST", self.path, body))
                if self.path == "/api/auth/login":
                    if body.get("password") != "pw":
                        return self._send(401, {"error": "bad"})
                    outer.logins += 1
                    return self._send(200, {}, {"Set-Cookie": "TOKEN=abc; path=/; secure; httponly",
                                                "X-CSRF-Token": "csrf1"})
                if not self._authed():
                    return self._send(401, {})
                if self.headers.get("X-CSRF-Token") != "csrf1":
                    return self._send(403, {"error": "csrf"})
                if self.path == "/proxy/network/api/s/default/cmd/stamgr":
                    (outer.blocked.add if body["cmd"] == "block-sta" else outer.blocked.discard)(body["mac"])
                    return self._send(200, {"meta": {"rc": "ok"}, "data": []})
                if self.path == "/proxy/network/v2/api/site/default/trafficrules":
                    body["_id"] = "r%d" % len(outer.rules)
                    outer.rules.append(body)
                    return self._send(201, body)
                self._send(404, {})

            def do_PUT(self):
                body = self._body()
                outer.calls.append(("PUT", self.path, body))
                for i, r in enumerate(outer.rules):
                    if self.path.endswith("/" + r["_id"]):
                        outer.rules[i] = body
                        return self._send(200, body)
                self._send(404, {})

            def do_GET(self):
                if not self._authed():
                    return self._send(401, {})
                p = self.path
                if p == "/proxy/network/api/s/default/rest/user":
                    data = [{"mac": m, "name": c["name"], "blocked": m in outer.blocked,
                             "is_wired": c["wired"], "last_seen": int(time.time())}
                            for m, c in outer.clients.items()]
                    return self._send(200, {"meta": {"rc": "ok"}, "data": data})
                if p == "/proxy/network/api/s/default/stat/sta":
                    data = [{"mac": m, "ip": "192.168.1.%d" % i, "is_wired": c["wired"]}
                            for i, (m, c) in enumerate(outer.clients.items())
                            if c["online"] and m not in outer.blocked]
                    return self._send(200, {"meta": {"rc": "ok"}, "data": data})
                if p == "/proxy/network/api/s/default/stat/sysinfo":
                    return self._send(200, {"meta": {"rc": "ok"}, "data": [{"version": "9.4.19"}]})
                if p == "/proxy/network/api/s/default/stat/device":
                    return self._send(200, {"meta": {"rc": "ok"}, "data": [
                        {"type": "uap", "model": "U7PG2"},
                        {"type": "udm", "model": "UCGMAX", "name": "Home", "version": "4.1.13"}]})
                if p == "/proxy/network/v2/api/site/default/trafficrules":
                    return self._send(200, outer.rules)
                self._send(404, {})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d" % self.server.server_address[1]

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class FakeHub:
    def __init__(self, config):
        self.config = config
        self.received = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                if self.headers.get("X-Family-Hub-Token") != "secret":
                    self.send_response(401)
                    self.end_headers()
                    return
                n = int(self.headers.get("Content-Length") or 0)
                outer.received.append(json.loads(self.rfile.read(n)))
                body = json.dumps({"config": outer.config, "poll_interval": 10}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d" % self.server.server_address[1]

    def close(self):
        self.server.shutdown()
        self.server.server_close()


AVA = "00:11:22:33:44:01"
XBOX = "00:11:22:33:44:02"
PARENT = "00:11:22:33:44:03"


class AgentLoopTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.unifi = FakeUniFi()
        self.hub = FakeHub({"timezone": "UTC", "enforcement": "client_block", "profiles": [
            {"id": "ava", "name": "Ava", "enabled": True, "devices": [AVA, XBOX],
             "schedule": [], "override": None}]})
        self.cfg = {
            "data_dir": self.tmp.name,
            "unifi": {"url": self.unifi.url, "username": "familyhub", "password": "pw"},
            "hub": {"url": self.hub.url, "token": "secret"},
        }
        self.agent = fa.Agent(self.cfg)

    def tearDown(self):
        self.unifi.close()
        self.hub.close()
        self.tmp.cleanup()

    def set_override(self, mode, until=None):
        self.hub.config["profiles"][0]["override"] = {"mode": mode, "until": until} if mode else None

    def test_reports_clients_and_gateway(self):
        self.agent.cycle()
        first = self.hub.received[0]
        self.assertEqual({c["mac"] for c in first["clients"]}, {AVA, XBOX, PARENT})
        self.assertEqual(first["gateway"]["gateway_model"], "UCGMAX")
        self.assertEqual(first["gateway"]["network_version"], "9.4.19")
        self.assertTrue(first["gateway"]["ok"])
        self.assertEqual(self.unifi.logins, 1)

    def test_pause_and_resume(self):
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, set())

        self.set_override("block")
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, {AVA, XBOX})  # parent's Mac untouched
        last = self.hub.received[-1]  # immediate report after acting
        self.assertEqual(last["applied"], {AVA: True, XBOX: True})
        self.assertEqual(sorted(e["type"] for e in last["events"]), ["device_blocked", "device_blocked"])

        self.agent.cycle()  # idempotent: no further gateway commands
        cmds = [c for c in self.unifi.calls if c[1].endswith("cmd/stamgr")]
        self.assertEqual(len(cmds), 2)

        self.set_override(None)
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, set())

    def test_device_removed_from_profile_is_released(self):
        self.set_override("block")
        self.agent.cycle()
        self.hub.config["profiles"][0]["devices"] = [AVA]
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, {AVA})

    def test_keeps_enforcing_from_cache_when_hub_down(self):
        self.agent.cycle()  # caches config
        now = time.time()
        self.hub.config["profiles"][0]["override"] = {"mode": "block", "until": now + 2}
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, {AVA, XBOX})
        self.hub.close()
        time.sleep(2.2)
        # Fresh agent process (e.g. after a reboot) with the hub unreachable.
        agent = fa.Agent(self.cfg)
        agent.hub.timeout = 1
        agent.cycle()
        self.assertEqual(self.unifi.blocked, set(), "expired pause must lift without the hub")
        self.hub = FakeHub({})  # so tearDown has something to close

    def test_relogin_after_session_expiry(self):
        self.agent.cycle()
        self.agent.gateway.cookies = {"TOKEN": "expired"}
        self.agent.cycle()
        self.assertEqual(self.unifi.logins, 2)

    def test_bad_password_backs_off(self):
        self.cfg["unifi"]["password"] = "wrong"
        agent = fa.Agent(self.cfg)
        agent.cycle()
        agent.cycle()
        logins = [c for c in self.unifi.calls if c[1] == "/api/auth/login"]
        self.assertEqual(len(logins), 1, "must not hammer the login endpoint (account lockout)")
        self.assertFalse(self.hub.received[-1]["gateway"]["ok"])

    def test_traffic_rule_mode(self):
        self.hub.config["enforcement"] = "traffic_rule"
        self.agent.cycle()
        self.assertEqual(self.unifi.rules, [], "no rule needed while allowed")
        self.set_override("block")
        self.agent.cycle()
        self.assertEqual(len(self.unifi.rules), 1)
        rule = self.unifi.rules[0]
        self.assertTrue(rule["enabled"])
        self.assertEqual(rule["matching_target"], "INTERNET")
        self.assertEqual(sorted(t["client_mac"] for t in rule["target_devices"]), [AVA, XBOX])
        self.assertIn("[family-hub:ava]", rule["description"])
        self.set_override(None)
        self.agent.cycle()
        self.assertFalse(self.unifi.rules[0]["enabled"])

    def test_traffic_rule_never_enabled_without_targets(self):
        self.hub.config["enforcement"] = "traffic_rule"
        self.hub.config["profiles"][0]["devices"] = []
        self.set_override("block")
        self.agent.cycle()
        self.assertEqual(self.unifi.rules, [])

    def test_switching_methods_releases_old_blocks(self):
        self.set_override("block")
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, {AVA, XBOX})
        self.hub.config["enforcement"] = "traffic_rule"
        self.agent.cycle()
        self.assertEqual(self.unifi.blocked, set())
        self.assertTrue(self.unifi.rules[0]["enabled"])
        self.hub.config["enforcement"] = "client_block"
        self.agent.cycle()
        self.assertFalse(self.unifi.rules[0]["enabled"])
        self.assertEqual(self.unifi.blocked, {AVA, XBOX})


if __name__ == "__main__":
    unittest.main()
