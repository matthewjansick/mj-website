"""MDM manager logic with a fake NanoMDM API (no binaries needed)."""
import base64
import time
import os
import plistlib
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import familyhub_mdm as mdm  # noqa: E402

T0 = time.time()
UDID = "00008110-001A2B3C4D5E801E"
MAC = "a4:83:e7:12:34:56"


class FakeAPI:
    def __init__(self):
        self.queue = []
        self.push_error = ""

    def enqueue(self, ids, command):
        cu = f"CU{len(self.queue)}"
        self.queue.append((cu, command))
        return cu

    def push(self, ids):
        return {}


def raw(d):
    return base64.b64encode(plistlib.dumps(d)).decode()


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeAPI()
        self.mgr = mdm.MDMManager({"api_key": "x"}, {}, lambda: None, api=self.api)
        self.hook("mdm.Authenticate", {"MessageType": "Authenticate", "UDID": UDID, "SerialNumber": "S1"})
        self.hook("mdm.TokenUpdate", {"MessageType": "TokenUpdate", "UDID": UDID})

    def hook(self, topic, payload):
        self.mgr.handle_webhook({"topic": topic, "checkin_event": {"udid": UDID, "raw_payload": raw(payload)}})

    def ack(self, cu, status="Acknowledged", **extra):
        payload = dict(UDID=UDID, CommandUUID=cu, Status=status, **extra)
        self.mgr.handle_webhook({"topic": "mdm.Connect", "acknowledge_event": {
            "udid": UDID, "status": status, "command_uuid": cu, "raw_payload": raw(payload)}})

    def answer_all(self, now, fail=None):
        while self.api.queue:
            cu, cmd = self.api.queue.pop(0)
            if fail and cmd["RequestType"] == fail:
                self.ack(cu, "Error", ErrorChain=[{"LocalizedDescription": "Nope"}])
            elif cmd["RequestType"] == "DeviceInformation":
                self.ack(cu, QueryResponses={"WiFiMAC": MAC.upper(), "IsSupervised": True, "DeviceName": "iPhone"})
            else:
                self.ack(cu)

    def kinds(self):
        return [c["RequestType"] for _, c in self.api.queue]

    def test_failed_install_retries_after_wait(self):
        self.mgr.reconcile({MAC: (True, False, "ava")}, {}, T0)
        self.answer_all(T0)
        self.mgr.reconcile({MAC: (True, False, "ava")}, {}, T0 + 1)
        self.assertEqual(self.kinds(), ["InstallProfile"])
        self.answer_all(1001, fail="InstallProfile")
        dev = self.mgr.state["devices"][UDID]
        self.assertIn("Nope", dev["error"])
        self.assertIn("error", [e["type"] for e in self.mgr.drain_events()])
        now = time.time()
        self.mgr.reconcile({MAC: (True, False, "ava")}, {}, now)
        self.assertEqual(self.kinds(), [], "waits before retrying")
        self.mgr.reconcile({MAC: (True, False, "ava")}, {}, now + mdm.RETRY_AFTER_ERROR + 1)
        self.assertEqual(self.kinds(), ["InstallProfile"])

    def test_notnow_keeps_command_pending(self):
        self.mgr.reconcile({}, {}, T0)
        cu, _ = self.api.queue[0]
        self.ack(cu, "NotNow")
        self.assertIn(cu, self.mgr.state["commands"])

    def test_reenrollment_resets_state(self):
        self.mgr.reconcile({MAC: (True, False, "ava")}, {}, T0)
        self.answer_all(T0)
        self.mgr.reconcile({MAC: (True, False, "ava")}, {}, T0 + 1)
        self.answer_all(T0 + 1)
        self.assertTrue(self.mgr.state["devices"][UDID]["have"]["downtime"])
        # Device wiped and enrolled again: nothing of ours is installed any more.
        self.hook("mdm.Authenticate", {"MessageType": "Authenticate", "UDID": UDID})
        dev = self.mgr.state["devices"][UDID]
        self.assertFalse(dev["have"]["downtime"])
        self.assertNotIn("baseline", dev["have"])

    def test_profiles_are_stable(self):
        a = mdm.downtime_profile(["com.apple.MobileSMS"])
        b = mdm.downtime_profile(["com.apple.MobileSMS"])
        self.assertEqual(a, b, "same content -> same UUIDs, so iOS replaces rather than duplicates")
        prof = plistlib.loads(a)
        self.assertTrue(prof["PayloadRemovalDisallowed"])
        self.assertIn("com.apple.Preferences", prof["PayloadContent"][0]["allowListedAppBundleIDs"])
        wifi = plistlib.loads(mdm.baseline_profile({"home_wifi": {"ssid": "Jansick", "password": "pw"}}))
        w = [p for p in wifi["PayloadContent"] if p["PayloadType"] == "com.apple.wifi.managed"][0]
        self.assertTrue(w["DisableAssociationMACRandomization"])


if __name__ == "__main__":
    unittest.main()
