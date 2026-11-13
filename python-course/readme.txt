=== Python Course ===
Contributors: matthewjansick
Tags: education, python, course
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later

An introductory Python course at /python. Real Python 3 runs in the browser (Pyodide), lessons have editable examples and auto-checked exercises, and progress saves to the site under the learner's email address.

== What it is ==

18 lessons in 5 sections (Getting started, Decisions and repetition, Organizing data and code, Bigger ideas, Capstone), 78 auto-checked exercises, 120+ runnable examples, a free-form Playground with saved programs, and a parent progress view under Settings > Python Course.

Each exercise has progressive hints and a solution that unlocks after three attempts. A lesson is complete when every exercise passes.

== Installation ==

1. Zip the `python-course` folder (or run `zip -r python-course.zip python-course`).
2. In WordPress go to Plugins > Add New > Upload Plugin and upload the zip.
3. Activate the plugin. It flushes rewrite rules on activation so /python resolves immediately.
4. Open https://jansick.com/python and sign in with an email address.

If /python returns a 404, go to Settings > Permalinks and click Save to flush rewrite rules.

== How saving works ==

The first screen asks for an email address and a first name. The email is only an identifier: nothing is sent to it and there is no password. Progress (passed exercises, code in every editor, playground programs) is autosaved to the browser and, 1.5 seconds after each change, pushed to `/wp-json/pycourse/v1/progress`. On sign-in the server copy and the local copy are merged, so the same email works across computers.

Each learner is one option named `pycourse_learner_<md5 of email>` (not autoloaded) plus an index in `pycourse_learners`. The endpoint is public but rate-limited (120 requests per minute per IP) and bounded (400 KB per learner).

== Parent view ==

Settings > Python Course lists every learner with lessons complete, exercises passed, last active time, and the lesson they are working on. Click a name for the per-lesson breakdown. From there you can delete a learner. The page also has a "Download all progress (JSON)" button and an optional weekly summary email (Sunday evening, to the address you choose or the admin email), with a "Send a summary now" button to test it.

== Python engine ==

Pyodide (CPython compiled to WebAssembly) is loaded from cdn.jsdelivr.net; CodeMirror comes from cdnjs.cloudflare.com. First load is about 10 MB and is cached by the browser afterwards. The versions are pinned in `python-course.php` (PYCOURSE_PYODIDE_VERSION, PYCOURSE_CODEMIRROR_VERSION) and the base URLs can be changed with the `pycourse_pyodide_base` and `pycourse_codemirror_base` filters if you ever want to self-host them.

The /python page sends Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers so Python can run in a Web Worker with a working `input()` and a Stop button for infinite loops. If a host or CDN strips those headers, the app falls back to running Python on the main thread: everything still works, but `input()` uses a browser prompt dialog and infinite loops have to be stopped by closing the tab. The About page inside the app shows which mode is active.

== Editing or adding lessons ==

Lessons are Markdown-ish files in `assets/lessons/`, listed in `assets/course.json`. Inside a lesson:

* A ```python fence is an editable, runnable example. Add the word `static` after `python` to show code without a Run button. A ```text fence is a plain output block.
* `::: tip`, `::: note`, `::: warning`, `::: challenge`, `::: goal` ... `:::` make callout boxes.
* `::: exercise id=some-id title="Title"` ... `:::` defines an exercise. Inside: description, a ```python fence with the starter code, then `--- tests` (a JSON list), `--- hints` (a bulleted list), `--- solution` (a python fence) and optionally `--- setup` (python code the checker runs before its checks, for providing helper classes).

Test objects support: `stdin` (list of lines fed to input()), `seed` (random seed), `output_equals`, `output_contains`, `output_not_contains`, `output_regex`, `output_lines`, `last_line`, `match: "loose"` (ignore case and spacing), `vars` [{name, expect, type}], `must_define`, `must_define_function`, `code_regex` / `code_not_regex` [{pattern, why}], and `calls` [{expr, expect, expect_type, prints, prints_contains, no_print, stdin, raises, message}]. `expect` values are Python literals written as strings, e.g. "'text'", "[1, 2]", "(True, 70)".

Exercise ids must be unique across the whole course. Renaming one orphans any saved progress for it.

== Changelog ==

= 1.0.0 =
* Initial release: 18 lessons, 78 exercises, playground, progress sync by email, parent view, weekly email.
