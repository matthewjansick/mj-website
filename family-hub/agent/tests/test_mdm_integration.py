"""End-to-end device-management test against the REAL NanoMDM and SCEP servers.

A simulated iPhone enrolls through the agent's public front door exactly like a
real one: downloads the enrollment profile, gets an identity certificate over
SCEP, sends signed Authenticate/TokenUpdate check-ins, then polls for commands
and acknowledges them. Apple's push service is not involved (the push
certificate is a self-signed stand-in), so the device polls instead of being
woken up.

Needs the binaries built with Go (skipped otherwise):
  GOBIN=/some/dir go install github.com/micromdm/nanomdm/cmd/nanomdm@v0.9.0
  GOBIN=/some/dir go install github.com/micromdm/scep/v2/cmd/scepserver@v2.3.0
  GOBIN=/some/dir go install github.com/micromdm/scep/v2/cmd/scepclient@v2.3.0
  FAMILYHUB_MDM_BIN=/some/dir python3 -m unittest discover -s family-hub/agent/tests
"""
import base64
import http.client
import os
import plistlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import familyhub_mdm as mdm  # noqa: E402

BIN = os.environ.get("FAMILYHUB_MDM_BIN", "")
HAVE_BINS = BIN and all(os.path.exists(os.path.join(BIN, b)) for b in ("nanomdm", "scepserver", "scepclient"))
WIFI_MAC = "a4:83:e7:12:34:56"
UDID = "00008110-001A2B3C4D5E801E"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_port(port, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"port {port} never opened")


class FakeIPhone:
    """Speaks the device side of the MDM protocol."""

    def __init__(self, front_port, tmp):
        self.front_port = front_port
        self.tmp = tmp
        self.installed = {}     # identifier -> profile dict
        self.lost_mode = False
        self.received = []

    def http(self, method, path, body=b"", headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.front_port, timeout=10)
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp.status, data

    def enroll(self, enroll_path):
        status, data = self.http("GET", enroll_path)
        assert status == 200, (status, data)
        profile = plistlib.loads(data)
        scep = next(p for p in profile["PayloadContent"] if p["PayloadType"] == "com.apple.security.scep")
        self.mdm_payload = next(p for p in profile["PayloadContent"] if p["PayloadType"] == "com.apple.mdm")
        # The profile points at the public URL; the test reaches it via the front door port.
        self.key = os.path.join(self.tmp, "device.key")
        self.cert = os.path.join(self.tmp, "device.pem")
        subprocess.run([os.path.join(BIN, "scepclient"), "-private-key", self.key, "-certificate", self.cert,
                        "-server-url", f"http://127.0.0.1:{self.front_port}/scep",
                        "-challenge", scep["PayloadContent"]["Challenge"], "-cn", UDID],
                       check=True, capture_output=True, cwd=self.tmp)
        # scepclient writes a DER cert; convert for openssl signing.
        pem = subprocess.run(["openssl", "x509", "-inform", "DER", "-in", self.cert], capture_output=True)
        if pem.returncode == 0:
            open(self.cert, "wb").write(pem.stdout)
        return profile

    def _signed_put(self, msg, checkin=False):
        body = plistlib.dumps(msg)
        sig = subprocess.run(["openssl", "smime", "-sign", "-binary", "-noattr", "-outform", "DER",
                              "-signer", self.cert, "-inkey", self.key],
                             input=body, capture_output=True, check=True).stdout
        ctype = "application/x-apple-aspen-mdm-checkin" if checkin else "application/x-apple-aspen-mdm"
        return self.http("PUT", "/mdm", body, {"Mdm-Signature": base64.b64encode(sig).decode(),
                                               "Content-Type": ctype})

    def checkin(self, message_type, **extra):
        msg = {"MessageType": message_type, "UDID": UDID, "Topic": self.mdm_payload["Topic"]}
        msg.update(extra)
        status, data = self._signed_put(msg, checkin=True)
        assert status == 200, (message_type, status, data)

    def poll(self, max_commands=20):
        """Ask for commands until the queue is empty, acting on each like iOS would."""
        status, data = self._signed_put({"UDID": UDID, "Status": "Idle"})
        n = 0
        while data and n < max_commands:
            n += 1
            cmd = plistlib.loads(data)
            req = cmd["Command"]
            self.received.append(req["RequestType"])
            reply = {"UDID": UDID, "CommandUUID": cmd["CommandUUID"], "Status": "Acknowledged"}
            kind = req["RequestType"]
            if kind == "DeviceInformation":
                reply["QueryResponses"] = {"DeviceName": "Ava's iPhone", "ProductName": "iPhone15,4",
                                           "ModelName": "iPhone", "OSVersion": "18.6", "SerialNumber": "F2LXK0Q9N7",
                                           "WiFiMAC": WIFI_MAC.upper(), "IsSupervised": True, "BatteryLevel": 0.82}
            elif kind == "InstallProfile":
                prof = plistlib.loads(req["Payload"])
                self.installed[prof["PayloadIdentifier"]] = prof
            elif kind == "RemoveProfile":
                if req["Identifier"] in self.installed:
                    del self.installed[req["Identifier"]]
                else:
                    reply["Status"] = "Error"
                    reply["ErrorChain"] = [{"ErrorCode": 1003, "LocalizedDescription": "The profile is not installed."}]
            elif kind == "EnableLostMode":
                self.lost_mode = req
            elif kind == "DisableLostMode":
                self.lost_mode = False
            status, data = self._signed_put(reply)
            assert status == 200, (kind, status, data)
        return n


@unittest.skipUnless(HAVE_BINS, "set FAMILYHUB_MDM_BIN to a dir with nanomdm, scepserver, scepclient")
class RealNanoMDMTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.procs = []
        depot = os.path.join(self.tmp, "depot")
        subprocess.run([os.path.join(BIN, "scepserver"), "ca", "-init", "-depot", depot, "-years", "10",
                        "-organization", "Family Hub"], check=True, capture_output=True)
        self.ports = {k: free_port() for k in ("scep", "nano", "hook", "front")}
        self.api_key, self.hook_secret, self.challenge = "apikey123", "hooksecret", "challenge123"
        self.procs.append(subprocess.Popen(
            [os.path.join(BIN, "scepserver"), "-depot", depot, "-http-addr", f"127.0.0.1:{self.ports['scep']}",
             "-challenge", self.challenge, "-allowrenew", "0", "-crtvalid", "3650"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        self._log = open(os.path.join(self.tmp, "nanomdm.log"), "wb")
        self.procs.append(subprocess.Popen(
            [os.path.join(BIN, "nanomdm"), "-ca", os.path.join(depot, "ca.pem"), "-api", self.api_key,
             "-listen", f"127.0.0.1:{self.ports['nano']}", "-storage", "filekv",
             "-storage-dsn", os.path.join(self.tmp, "db"),
             "-webhook-url", f"http://127.0.0.1:{self.ports['hook']}/webhook",
             "-webhook-hmac-key", self.hook_secret, "-debug"],
            stdout=subprocess.DEVNULL, stderr=self._log))
        wait_port(self.ports["scep"])
        wait_port(self.ports["nano"])

        # Stand-in push certificate (Apple's would come from identity.apple.com).
        topic = "com.apple.mgmt.External.5c3f1b2a-0000-4000-8000-000000000001"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "365",
                        "-keyout", os.path.join(self.tmp, "push.key"), "-out", os.path.join(self.tmp, "push.pem"),
                        "-subj", f"/UID={topic}/CN=APSP:test"], check=True, capture_output=True)
        self.cfg = {
            "nanomdm_url": f"http://127.0.0.1:{self.ports['nano']}",
            "scep_url": f"http://127.0.0.1:{self.ports['scep']}",
            "api_key": self.api_key,
            "webhook_secret": self.hook_secret,
            "webhook_listen": f"127.0.0.1:{self.ports['hook']}",
            "front_listen": f"127.0.0.1:{self.ports['front']}",
            "public_url": "https://mdm.example.test",
            "scep_challenge": self.challenge,
            "enroll_token": "tok123",
        }
        api = mdm.NanoMDM(self.cfg["nanomdm_url"], self.api_key)
        with open(os.path.join(self.tmp, "push.pem"), "rb") as c, open(os.path.join(self.tmp, "push.key"), "rb") as k:
            pem = c.read() + mdm.unencrypted_key(k.read())
        self.cfg["topic"] = api.upload_push_cert(pem)
        self.assertEqual(self.cfg["topic"], topic)
        self.state = {}
        self.mgr = mdm.MDMManager(self.cfg, self.state, lambda: None)
        self.mgr.start_servers()
        self.phone = FakeIPhone(self.ports["front"], self.tmp)

    def tearDown(self):
        if os.environ.get("FAMILYHUB_MDM_LOG"):
            with open(os.path.join(self.tmp, "nanomdm.log")) as fh:
                print(fh.read()[-4000:])
        self.mgr.stop_servers()
        for p in self.procs:
            p.terminate()
            p.wait(5)
        self._log.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def settle(self, desired, settings=None):
        """One agent cycle, then let the phone fetch and answer everything."""
        self.mgr.reconcile(desired, settings or {}, time.time())
        n = self.phone.poll()
        time.sleep(0.3)  # webhooks are delivered asynchronously
        return n

    def dev(self):
        return self.state["mdm"]["devices"][UDID]

    def test_front_door_only_exposes_mdm_scep_and_enroll(self):
        self.assertEqual(self.phone.http("GET", "/v1/pushcert?topic=x")[0], 404)
        self.assertEqual(self.phone.http("PUT", "/v1/enqueue/abc", b"x")[0], 404)
        self.assertEqual(self.phone.http("POST", "/webhook", b"{}")[0], 404)
        self.assertEqual(self.phone.http("GET", "/enroll/wrong")[0], 404)
        self.assertEqual(self.phone.http("GET", "/enroll/tok123")[0], 200)
        # The webhook rejects unsigned events.
        conn = http.client.HTTPConnection("127.0.0.1", self.ports["hook"], timeout=5)
        conn.request("POST", "/webhook", body=b'{"topic":"mdm.CheckOut"}')
        self.assertEqual(conn.getresponse().status, 401)

    def test_full_lifecycle(self):
        profile = self.phone.enroll("/enroll/tok123")
        mdm_payload = self.phone.mdm_payload
        self.assertEqual(mdm_payload["ServerURL"], "https://mdm.example.test/mdm")
        self.assertTrue(profile["PayloadRemovalDisallowed"])

        self.phone.checkin("Authenticate", SerialNumber="F2LXK0Q9N7", ProductName="iPhone15,4", OSVersion="18.6")
        self.phone.checkin("TokenUpdate", Token=b"\x01" * 32, PushMagic="magic-123")
        time.sleep(0.3)
        self.assertTrue(self.dev()["enrolled"])

        # First cycle: device info + baseline. MAC unknown yet, so nothing kid-specific.
        desired = {WIFI_MAC: (True, False, "ava")}
        self.settle(desired)
        self.assertIn("DeviceInformation", self.phone.received)
        self.assertIn(mdm.BASELINE_ID, self.phone.installed)
        baseline = self.phone.installed[mdm.BASELINE_ID]["PayloadContent"][0]
        self.assertFalse(baseline["allowVPNCreation"])
        self.assertFalse(baseline["allowEraseContentAndSettings"])
        self.assertEqual(self.dev()["wifi_mac"], WIFI_MAC)
        self.assertTrue(self.dev()["supervised"])

        # Second cycle: now matched to Ava, who is blocked -> downtime profile.
        self.settle(desired, {"downtime_apps": ["com.apple.MobileSMS", "com.apple.mobilephone"]})
        self.assertIn(mdm.DOWNTIME_ID, self.phone.installed)
        apps = self.phone.installed[mdm.DOWNTIME_ID]["PayloadContent"][0]["allowListedAppBundleIDs"]
        self.assertEqual(apps, ["com.apple.MobileSMS", "com.apple.Preferences", "com.apple.mobilephone"])
        self.assertTrue(self.mgr.report()["devices"][0]["downtime"])
        types = [e["type"] for e in self.mgr.drain_events()]
        self.assertIn("mdm_downtime_on", types)

        # Steady state: nothing more is sent.
        before = len(self.phone.received)
        self.settle(desired, {"downtime_apps": ["com.apple.MobileSMS", "com.apple.mobilephone"]})
        self.assertEqual(len(self.phone.received), before)

        # Allowed again -> profile removed.
        self.settle({WIFI_MAC: (False, False, "ava")})
        self.assertNotIn(mdm.DOWNTIME_ID, self.phone.installed)
        self.assertFalse(self.mgr.report()["devices"][0]["downtime"])

        # Lock completely -> Lost Mode with message and phone; then unlock.
        self.settle({WIFI_MAC: (False, True, "ava")}, {"lock_message": "Phone time is over.", "lock_phone": "+14045550101"})
        self.assertEqual(self.phone.lost_mode["Message"], "Phone time is over.")
        self.assertEqual(self.phone.lost_mode["PhoneNumber"], "+14045550101")
        self.assertTrue(self.mgr.report()["devices"][0]["locked"])
        self.settle({WIFI_MAC: (False, False, "ava")})
        self.assertFalse(self.phone.lost_mode)

        # Device unassigned while blocked: released, never left locked down.
        self.settle({WIFI_MAC: (True, False, "ava")})
        self.assertIn(mdm.DOWNTIME_ID, self.phone.installed)
        self.settle({})
        self.assertNotIn(mdm.DOWNTIME_ID, self.phone.installed)

        # Profile removal (only possible via MDM on a supervised device) -> CheckOut.
        self.phone.checkin("CheckOut")
        time.sleep(0.3)
        self.assertFalse(self.dev()["enrolled"])

    def test_setup_commands(self):
        import json
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        import familyhub_agent as fa
        cfg_path = os.path.join(self.tmp, "agent.json")
        m = {k: v for k, v in self.cfg.items() if k != "topic"}
        with open(cfg_path, "w") as fh:
            json.dump({"mdm": m}, fh)
        rc = fa.main(["mdm-pushcert", os.path.join(self.tmp, "push.pem"), os.path.join(self.tmp, "push.key"),
                      "-c", cfg_path])
        self.assertEqual(rc, 0)
        with open(cfg_path) as fh:
            saved = json.load(fh)["mdm"]
        self.assertTrue(saved["topic"].startswith("com.apple.mgmt.External."))
        self.assertRegex(saved["push_cert_expires"], r"^\d{4}-\d\d-\d\dT")
        out = os.path.join(self.tmp, "enroll.mobileconfig")
        self.assertEqual(fa.main(["mdm-profile", out, "-c", cfg_path]), 0)
        with open(out, "rb") as fh:
            prof = plistlib.load(fh)
        self.assertEqual(prof["PayloadContent"][1]["Topic"], saved["topic"])

    def test_flip_while_phone_offline(self):
        """Pause then resume while the phone is off: it ends up unrestricted."""
        self.phone.enroll("/enroll/tok123")
        self.phone.checkin("Authenticate")
        self.phone.checkin("TokenUpdate", Token=b"\x02" * 32, PushMagic="m")
        self.settle({})  # info + baseline
        self.mgr.reconcile({WIFI_MAC: (True, False, "ava")}, {}, time.time())   # queued, phone off
        self.mgr.reconcile({WIFI_MAC: (False, False, "ava")}, {}, time.time())  # changed mind
        self.phone.poll()
        time.sleep(0.3)
        self.assertNotIn(mdm.DOWNTIME_ID, self.phone.installed)
        self.assertEqual(self.dev()["pending"], {})
        self.assertFalse(self.dev()["have"]["downtime"])


if __name__ == "__main__":
    unittest.main()
