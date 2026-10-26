=== Anvil ===
Contributors: matthewjansick
Tags: pwa, app, ios
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPL-2.0-or-later

Hold Fast: The Anvil Academy Fall Retreat 2026 week-of packet (Woodlands Camp, Cleveland, GA) as an installable, iOS-style app at /anvil.

Tailored for the Jansick family and the Cumming campus. Tabs: Home (Peter's cabin, check-in and pickup, weather, contacts with tap-to-call), Schedule (Wed/Thu/Fri with Cumming rotations and a live Now marker during the retreat), Packing (checklist saved on device), Map (zoomable Woodlands map and Cumming building key).

== Installation ==

1. Zip the `anvil` folder (or run `zip -r anvil.zip anvil`).
2. In WordPress go to Plugins > Add New > Upload Plugin and upload the zip.
3. Activate the plugin. It flushes rewrite rules on activation so /anvil resolves immediately.
4. Open https://jansick.com/anvil on an iPhone in Safari, tap Share, then Add to Home Screen.

If /anvil returns a 404, go to Settings > Permalinks and click Save to flush rewrite rules.

== Editing content ==

All screens, lists, checklists and detail text live in `assets/content.json`.
No PHP changes are needed to add or edit screens.

== Changelog ==

= 0.1.0 =
* Full retreat packet content.
* App shell: tab bar, navigation stack with back and edge swipe, grouped lists, checklists with saved progress, dark mode, Add to Home Screen support.
