/* Python Course app. Plain JS, no build step. */
(function () {
  'use strict';

  const CFG = window.PYCOURSE;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return el;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();

  /* ======================================================================
   * Course index
   * ==================================================================== */
  const LESSONS = [];
  CFG.course.sections.forEach((sec) => sec.lessons.forEach((l) => LESSONS.push(Object.assign({ section: sec.title }, l))));
  const lessonById = (id) => LESSONS.find((l) => l.id === id);
  const lessonIndex = (id) => LESSONS.findIndex((l) => l.id === id);

  /* ======================================================================
   * Progress (local + server)
   * ==================================================================== */
  const Progress = {
    learner: null, // {email, name}
    data: null,    // see PHP header comment for shape
    dirty: false,
    timer: null,
    syncState: 'idle', // idle | saving | saved | offline | error
    listeners: [],

    load() {
      try {
        const l = JSON.parse(localStorage.getItem('pycourse:learner') || 'null');
        if (l && l.email) {
          this.learner = l;
          this.data = JSON.parse(localStorage.getItem('pycourse:progress:' + l.email) || 'null') || this.empty();
        }
      } catch (e) { this.learner = null; }
    },
    empty() { return { lessons: {}, playground: {}, lastActive: now() }; },
    signIn(email, name) {
      email = email.trim().toLowerCase();
      this.learner = { email, name: name.trim() };
      try { localStorage.setItem('pycourse:learner', JSON.stringify(this.learner)); } catch (e) {}
      let local = null;
      try { local = JSON.parse(localStorage.getItem('pycourse:progress:' + email) || 'null'); } catch (e) {}
      this.data = local || this.empty();
      this.data.name = this.learner.name;
      this.persistLocal();
      return this.pull();
    },
    signOut() {
      this.flush();
      this.learner = null;
      this.data = null;
      try { localStorage.removeItem('pycourse:learner'); } catch (e) {}
    },
    persistLocal() {
      if (!this.learner) return;
      try { localStorage.setItem('pycourse:progress:' + this.learner.email, JSON.stringify(this.data)); } catch (e) {}
    },
    lesson(id) {
      const L = this.data.lessons;
      if (!L[id]) L[id] = { exercises: {}, examples: {} };
      if (!L[id].exercises) L[id].exercises = {};
      if (!L[id].examples) L[id].examples = {};
      return L[id];
    },
    exercise(lid, eid) {
      const l = this.lesson(lid);
      if (!l.exercises[eid]) l.exercises[eid] = { passed: false, code: '', attempts: 0, usedSolution: false, updated: 0, passedAt: 0 };
      return l.exercises[eid];
    },
    touch() {
      if (!this.data) return;
      this.data.lastActive = now();
      this.dirty = true;
      this.persistLocal();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 1500);
      this.emit();
    },
    on(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => fn()); },
    setSync(s) { this.syncState = s; this.emit(); },

    async pull() {
      if (!this.learner) return;
      try {
        const r = await fetch(CFG.progressUrl + '?email=' + encodeURIComponent(this.learner.email), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.found && j.progress && j.progress.lessons) {
          this.data = this.merge(this.data, j.progress);
          if (j.progress.name && !this.learner.name) this.learner.name = j.progress.name;
        }
        this.data.name = this.learner.name;
        this.persistLocal();
        // Push the merged result so the server has anything local-only.
        await this.push(true);
        this.setSync('saved');
      } catch (e) {
        this.setSync('offline');
      }
      this.emit();
    },
    async push(force) {
      if (!this.learner || (!this.dirty && !force)) return;
      this.dirty = false;
      this.setSync('saving');
      try {
        const r = await fetch(CFG.progressUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({ email: this.learner.email, progress: Object.assign({}, this.data, { name: this.learner.name }) }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.progress && j.progress.lessons) {
          this.data = this.merge(this.data, j.progress);
          for (const k in this.data.playground) if (this.data.playground[k].deleted) delete this.data.playground[k];
          this.persistLocal();
        }
        this.setSync(this.dirty ? 'saving' : 'saved');
        if (this.dirty) this.push();
      } catch (e) {
        this.dirty = true;
        this.setSync('offline');
      }
    },
    flush() {
      clearTimeout(this.timer);
      if (this.dirty) this.push();
    },
    /* Same rules as the server: newer "updated" wins, passed is sticky. */
    merge(a, b) {
      const out = JSON.parse(JSON.stringify(a || this.empty()));
      out.lessons = out.lessons || {};
      out.playground = out.playground || {};
      for (const lid in (b.lessons || {})) {
        const bl = b.lessons[lid];
        const al = out.lessons[lid] || (out.lessons[lid] = { exercises: {}, examples: {} });
        al.exercises = al.exercises || {}; al.examples = al.examples || {};
        if (bl.visited) al.visited = Math.max(al.visited || 0, bl.visited);
        for (const eid in (bl.exercises || {})) {
          const be = bl.exercises[eid], ae = al.exercises[eid];
          let m = (!ae || (be.updated || 0) >= (ae.updated || 0)) ? Object.assign({}, be) : Object.assign({}, ae);
          m.passed = !!((ae && ae.passed) || be.passed);
          m.usedSolution = !!((ae && ae.usedSolution) || be.usedSolution);
          m.attempts = Math.max(ae ? ae.attempts || 0 : 0, be.attempts || 0);
          const pa = [ae ? ae.passedAt : 0, be.passedAt].filter(Boolean);
          m.passedAt = pa.length ? Math.min.apply(null, pa) : 0;
          al.exercises[eid] = m;
        }
        for (const n in (bl.examples || {})) {
          const be = bl.examples[n], ae = al.examples[n];
          if (!ae || (be.updated || 0) >= (ae.updated || 0)) al.examples[n] = be;
        }
      }
      for (const slot in (b.playground || {})) {
        const bp = b.playground[slot], ap = out.playground[slot];
        if (!ap || (bp.updated || 0) >= (ap.updated || 0)) {
          if (bp.deleted) delete out.playground[slot]; else out.playground[slot] = bp;
        }
      }
      out.lastActive = Math.max(out.lastActive || 0, b.lastActive || 0);
      return out;
    },
    lessonStats(lesson) {
      // lesson: parsed lesson (with exercises) or course entry; uses the parsed exercise count when known.
      const l = this.data && this.data.lessons[lesson.id];
      const exIds = Lessons.exerciseIds(lesson.id);
      const total = exIds ? exIds.length : (lesson.exercises || 0);
      let passed = 0;
      if (l && l.exercises) for (const eid in l.exercises) if (l.exercises[eid].passed && (!exIds || exIds.includes(eid))) passed++;
      return { passed, total, complete: total > 0 && passed >= total, started: !!(l && (l.visited || passed)) };
    },
    overall() {
      let passed = 0, total = 0, lessonsDone = 0;
      LESSONS.forEach((l) => { const s = this.lessonStats(l); passed += s.passed; total += s.total; if (s.complete) lessonsDone++; });
      return { passed, total, lessonsDone, lessons: LESSONS.length };
    },
    nextLesson() {
      for (const l of LESSONS) if (!this.lessonStats(l).complete) return l;
      return LESSONS[LESSONS.length - 1];
    },
  };

  /* ======================================================================
   * Lesson text: fetch + parse
   * ==================================================================== */
  const Lessons = {
    cache: {},
    async get(id) {
      if (this.cache[id]) return this.cache[id];
      const r = await fetch(CFG.lessonBase + id + '?v=' + encodeURIComponent(CFG.version));
      if (!r.ok) throw new Error('Could not load lesson (' + r.status + ')');
      const text = await r.text();
      const parsed = parseLesson(text, id);
      this.cache[id] = parsed;
      return parsed;
    },
    exerciseIds(id) {
      const p = this.cache[id];
      if (p) return p.exercises.map((e) => e.id);
      const entry = lessonById(id);
      return entry && entry.exerciseIds ? entry.exerciseIds : null;
    },
  };

  /*
   * Lesson format: optional front matter, then markdown-lite with:
   *   ```python            editable + runnable example
   *   ```python static     code shown but not runnable
   *   ```text              plain output block
   *   ::: tip / note / warning / challenge  ... :::   callout boxes
   *   ::: exercise id=xx title="..."  ... --- tests ... --- hints ... --- solution ... :::
   */
  function parseLesson(text, id) {
    const lesson = { id, meta: {}, blocks: [], exercises: [] };
    text = text.replace(/\r\n/g, '\n');
    if (text.startsWith('---\n')) {
      const end = text.indexOf('\n---\n', 4);
      if (end > 0) {
        text.slice(4, end).split('\n').forEach((ln) => { const m = ln.match(/^(\w+):\s*(.*)$/); if (m) lesson.meta[m[1]] = m[2]; });
        text = text.slice(end + 5);
      }
    }
    const lines = text.split('\n');
    let i = 0;
    let exampleN = 0;
    const readFence = () => { // at a ``` line; returns {lang, info, code}
      const m = lines[i].match(/^```(\w*)\s*(.*)$/);
      const lang = m[1], info = m[2];
      i++;
      const buf = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      return { lang, info, code: buf.join('\n') };
    };
    const readUntil = (pred) => { const buf = []; while (i < lines.length && !pred(lines[i])) buf.push(lines[i++]); return buf.join('\n'); };

    while (i < lines.length) {
      const ln = lines[i];
      if (/^```/.test(ln)) {
        const f = readFence();
        if (f.lang === 'python' && !/static/.test(f.info)) lesson.blocks.push({ type: 'example', n: exampleN++, code: f.code, hidden: /hidden/.test(f.info) });
        else lesson.blocks.push({ type: 'code', lang: f.lang, code: f.code });
        continue;
      }
      let m = ln.match(/^:::\s*exercise\s+(.*)$/);
      if (m) {
        const attrs = {};
        m[1].replace(/(\w+)=("([^"]*)"|(\S+))/g, (_, k, __, q, u) => { attrs[k] = q !== undefined ? q : u; return ''; });
        i++;
        const body = readUntil((l) => /^:::\s*$/.test(l));
        i++;
        lesson.exercises.push(parseExercise(body, attrs, lesson.exercises.length));
        lesson.blocks.push({ type: 'exercise', index: lesson.exercises.length - 1 });
        continue;
      }
      m = ln.match(/^:::\s*(tip|note|warning|challenge|goal)\s*(.*)$/);
      if (m) {
        i++;
        const body = readUntil((l) => /^:::\s*$/.test(l));
        i++;
        lesson.blocks.push({ type: 'callout', kind: m[1], title: m[2], html: md(body) });
        continue;
      }
      // Markdown paragraph group: read until a fence or ::: block.
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i]) && !/^:::/.test(lines[i])) buf.push(lines[i++]);
      const chunk = buf.join('\n');
      if (chunk.trim()) lesson.blocks.push({ type: 'md', html: md(chunk) });
    }
    return lesson;
  }

  function parseExercise(body, attrs, index) {
    const ex = { id: attrs.id || 'ex' + index, title: attrs.title || 'Exercise ' + (index + 1), descHtml: '', starter: '', tests: [], hints: [], solution: '', setup: '' };
    const parts = body.split(/^---\s*(tests|hints|solution|setup)\s*$/m);
    // parts: [desc, 'tests', text, 'hints', text, ...]
    const desc = parts[0];
    const fm = desc.match(/```python[^\n]*\n([\s\S]*?)\n```/);
    if (fm) { ex.starter = fm[1]; ex.descHtml = md(desc.replace(fm[0], '')); } else ex.descHtml = md(desc);
    for (let k = 1; k < parts.length; k += 2) {
      const key = parts[k], val = parts[k + 1] || '';
      if (key === 'tests') { try { ex.tests = JSON.parse(val); } catch (e) { ex.tests = [{ name: 'Checker', broken: 'Tests for this exercise are malformed: ' + e.message }]; } }
      else if (key === 'hints') ex.hints = val.split('\n').filter((l) => /^\s*-\s/.test(l)).map((l) => l.replace(/^\s*-\s/, ''));
      else if (key === 'solution') { const sm = val.match(/```python[^\n]*\n([\s\S]*?)\n```/); ex.solution = sm ? sm[1] : val.trim(); }
      else if (key === 'setup') { const sm = val.match(/```python[^\n]*\n([\s\S]*?)\n```/); ex.setup = sm ? sm[1] : val.trim(); }
    }
    return ex;
  }

  /* Markdown-lite renderer (headings, lists, quotes, tables, inline). All text is escaped. */
  function md(src) {
    const out = [];
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, (_, c) => '<code>' + c + '</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    while (i < lines.length) {
      const ln = lines[i];
      if (!ln.trim()) { i++; continue; }
      let m;
      if (/^```/.test(ln)) {
        const lang = (ln.match(/^```(\w*)/) || [])[1] || 'text';
        const buf = []; i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre class="static ' + esc(lang) + '"><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
      }
      if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { const lvl = m[1].length + 1; out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>'); i++; continue; }
      if (/^\s*[-*]\s+/.test(ln)) {
        out.push('<ul>');
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { out.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
        out.push('</ul>'); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(ln)) {
        out.push('<ol>');
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { out.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
        out.push('</ol>'); continue;
      }
      if (/^>\s?/.test(ln)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + md(buf.join('\n')) + '</blockquote>'); continue;
      }
      if (/^\|/.test(ln) && i + 1 < lines.length && /^\|\s*:?-+/.test(lines[i + 1])) {
        const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
        out.push('<table><thead><tr>' + cells(ln).map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>');
        i += 2;
        while (i < lines.length && /^\|/.test(lines[i])) { out.push('<tr>' + cells(lines[i]).map((c) => '<td>' + c + '</td>').join('') + '</tr>'); i++; }
        out.push('</tbody></table>'); continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+[.)]\s|>|\||```)/.test(lines[i])) buf.push(lines[i++]);
      out.push('<p>' + inline(buf.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  /* ======================================================================
   * Python engine (worker + SharedArrayBuffer, or inline fallback)
   * ==================================================================== */
  const Engine = {
    worker: null,
    inline: false,
    ready: false,
    starting: false,
    failed: null,
    sab: null, ctl: null, data: null, interrupt: null,
    job: null,       // {id, type, console, resolve, timer, lastLine}
    queue: [],
    nextId: 1,
    mode: 'none',
    listeners: [],
    onState(fn, persistent) { fn._persist = !!persistent; this.listeners.push(fn); },
    clearViewListeners() { this.listeners = this.listeners.filter((f) => f._persist); },
    emit() { this.listeners.forEach((fn) => fn(this)); },

    start() {
      if (this.starting) return;
      this.starting = true;
      this.failed = null;
      this.ready = false;
      this.emit();
      const canShare = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
      if (canShare && window.Worker) {
        this.mode = 'worker';
        this.sab = new SharedArrayBuffer(8 + 64 * 1024);
        this.ctl = new Int32Array(this.sab, 0, 2);
        this.data = new Uint8Array(this.sab, 8);
        this.interrupt = new SharedArrayBuffer(1);
        try {
          this.worker = new Worker(CFG.workerUrl, { type: 'module' });
        } catch (e) {
          this.mode = 'inline';
        }
      } else this.mode = 'inline';

      if (this.mode === 'worker') {
        this.worker.onmessage = (e) => this.onMessage(e.data);
        this.worker.onerror = (e) => { this.fail('The Python worker crashed: ' + (e.message || 'unknown error')); };
        this.worker.postMessage({ type: 'init', pyodideBase: CFG.pyodideBase, sab: this.sab, interrupt: this.interrupt });
      } else {
        // Inline: load worker.js as a module script on the main thread.
        this.inline = true;
        const boot = () => {
          window.PyEngineInline.attach((m) => this.onMessage(m), () => {
            const p = this.job && this.job.console ? this.job.console.lastPartial() : '';
            const v = window.prompt(p || 'Input:');
            if (v !== null && this.job && this.job.console) this.job.console.write('stdout', v + '\n');
            return v;
          });
          window.PyEngineInline.handle({ type: 'init', pyodideBase: CFG.pyodideBase });
        };
        if (window.PyEngineInline) boot();
        else {
          window.addEventListener('pyengine-inline-ready', boot, { once: true });
          const s = document.createElement('script');
          s.type = 'module';
          s.src = CFG.workerUrl;
          s.onerror = () => this.fail('Could not load the Python engine script.');
          document.head.appendChild(s);
        }
      }
    },
    fail(msg) {
      this.failed = msg;
      this.ready = false;
      this.starting = false;
      if (this.job) { this.job.console && this.job.console.write('stderr', msg + '\n'); this.finish({ ok: false, results: [{ name: 'Python', passed: false, message: msg }] }); }
      this.queue.splice(0).forEach((j) => j.resolve({ ok: false, results: [{ name: 'Python', passed: false, message: msg }] }));
      this.emit();
    },
    onMessage(m) {
      switch (m.type) {
        case 'ready': this.ready = true; this.starting = false; this.version = m.version; this.emit(); this.pump(); break;
        case 'error': this.fail(m.message); break;
        case 'out': if (this.job && this.job.console) this.job.console.write(m.stream, m.text); break;
        case 'input': if (this.job && this.job.console) this.job.console.askInput((v) => this.answerInput(v)); break;
        case 'done': if (this.job && this.job.id === m.id) this.finish({ ok: m.ok }); break;
        case 'result': if (this.job && this.job.id === m.id) this.finish({ ok: true, results: m.results }); break;
      }
    },
    answerInput(value) {
      if (!this.ctl) return;
      const bytes = new TextEncoder().encode(value === null ? '' : value);
      const n = Math.min(bytes.length, this.data.length);
      this.data.set(bytes.subarray(0, n));
      Atomics.store(this.ctl, 1, value === null ? -1 : n);
      Atomics.store(this.ctl, 0, 1);
      Atomics.notify(this.ctl, 0);
    },
    run(code, console) { return this.enqueue({ type: 'run', code, console }); },
    test(code, tests, console) { return this.enqueue({ type: 'test', code, tests, console, timeout: 12000 }); },
    enqueue(job) {
      return new Promise((resolve) => {
        job.id = this.nextId++;
        job.resolve = resolve;
        this.queue.push(job);
        if (!this.ready && !this.starting && !this.failed) this.start();
        if (this.failed) { this.start(); }
        this.pump();
        this.emit();
      });
    },
    pump() {
      if (this.job || !this.ready || !this.queue.length) return;
      this.job = this.queue.shift();
      const job = this.job;
      if (job.console) job.console.begin(job.type);
      this.emit();
      const msg = { type: job.type, id: job.id, code: job.code, tests: job.tests };
      if (job.timeout) job.timer = setTimeout(() => this.stop('Your program took too long. Is there an infinite loop?'), job.timeout);
      if (this.inline) {
        // Give the UI one frame to show "running" before blocking the thread.
        setTimeout(() => window.PyEngineInline.handle(msg), 30);
      } else this.worker.postMessage(msg);
    },
    finish(result) {
      const job = this.job;
      if (!job) return;
      clearTimeout(job.timer);
      this.job = null;
      if (job.console) job.console.end(result);
      job.resolve(result);
      this.emit();
      this.pump();
    },
    busy() { return !!this.job || this.queue.length > 0; },
    stop(reason) {
      const job = this.job;
      if (!job) return;
      reason = reason || 'Stopped.';
      if (this.mode === 'worker') {
        // First try a polite KeyboardInterrupt; if Python is blocked on input, release it.
        if (this.ctl && Atomics.load(this.ctl, 0) === 0 && job.console && job.console.waitingInput) {
          this.answerInput(null);
        } else if (this.interrupt) {
          new Uint8Array(this.interrupt)[0] = 2;
        }
        job.console && job.console.write('stderr', '\n' + reason + '\n');
        const id = job.id;
        setTimeout(() => {
          if (this.job && this.job.id === id) {
            // Still stuck: hard restart the worker.
            try { this.worker.terminate(); } catch (e) {}
            this.worker = null; this.ready = false; this.starting = false;
            const j = this.job; this.job = null;
            if (j.console) j.console.end({ ok: false, results: [{ name: 'Checker', passed: false, message: reason }] });
            j.resolve({ ok: false, results: [{ name: 'Checker', passed: false, message: reason }] });
            this.start();
          }
        }, 1500);
      } else {
        job.console && job.console.write('stderr', '\n' + reason + '\n');
      }
    },
  };

  /* ======================================================================
   * Editor + console widgets
   * ==================================================================== */
  function makeEditor(host, code, opts) {
    opts = opts || {};
    const ta = h('textarea');
    host.appendChild(ta);
    const cm = CodeMirror.fromTextArea(ta, {
      mode: 'python', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
      autoCloseBrackets: true, matchBrackets: true, viewportMargin: Infinity, lineWrapping: false,
      readOnly: !!opts.readOnly,
      extraKeys: {
        'Ctrl-Enter': () => opts.onRun && opts.onRun(), 'Cmd-Enter': () => opts.onRun && opts.onRun(),
        'Shift-Ctrl-Enter': () => opts.onCheck && opts.onCheck(), 'Shift-Cmd-Enter': () => opts.onCheck && opts.onCheck(),
        Tab: (cm) => { if (cm.somethingSelected()) cm.indentSelection('add'); else cm.replaceSelection('    ', 'end'); },
        'Shift-Tab': (cm) => cm.indentSelection('subtract'),
        'Ctrl-/': (cm) => cm.toggleComment(), 'Cmd-/': (cm) => cm.toggleComment(),
      },
    });
    cm.setValue(code || '');
    if (opts.onChange) cm.on('change', () => opts.onChange(cm.getValue()));
    return cm;
  }

  function makeConsole() {
    const out = h('pre', { class: 'console-out' });
    const inputRow = h('form', { class: 'console-input', hidden: true });
    const inputField = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Program input' });
    inputRow.append(h('span', { class: 'prompt-arrow', 'aria-hidden': 'true' }, '›'), inputField, h('button', { type: 'submit', class: 'btn btn-small' }, 'Enter'));
    const status = h('div', { class: 'console-status' });
    const el = h('div', { class: 'console' }, h('div', { class: 'console-bar' }, h('span', { class: 'console-title' }, 'Output'), status, h('button', { type: 'button', class: 'btn btn-small btn-stop', hidden: true }, 'Stop')), out, inputRow);
    const stopBtn = $('.btn-stop', el);
    stopBtn.addEventListener('click', () => Engine.stop());
    let partial = '';
    let pendingCb = null;
    const api = {
      el,
      waitingInput: false,
      clear() { out.textContent = ''; partial = ''; },
      write(stream, text) {
        const span = h('span', { class: stream === 'stderr' ? 'err' : 'std' }, text);
        out.appendChild(span);
        partial = (partial + text).split('\n').pop();
        while (out.childNodes.length > 400 || (out.textContent.length > 300000 && out.childNodes.length > 1)) out.removeChild(out.firstChild);
        out.scrollTop = out.scrollHeight;
      },
      lastPartial() { return partial; },
      begin(type) {
        this.clear();
        el.classList.add('running');
        status.textContent = type === 'test' ? 'Checking…' : 'Running…';
        stopBtn.hidden = false;
      },
      end(result) {
        el.classList.remove('running');
        inputRow.hidden = true;
        this.waitingInput = false;
        pendingCb = null;
        stopBtn.hidden = true;
        status.textContent = result && result.ok === false ? 'Finished with an error' : 'Finished';
        if (!out.textContent) out.appendChild(h('span', { class: 'muted' }, '(no output)'));
      },
      askInput(cb) {
        pendingCb = cb;
        this.waitingInput = true;
        inputRow.hidden = false;
        status.textContent = 'Waiting for your input…';
        inputField.value = '';
        inputField.focus();
      },
    };
    inputRow.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!pendingCb) return;
      const v = inputField.value;
      const cb = pendingCb; pendingCb = null;
      api.waitingInput = false;
      inputRow.hidden = true;
      api.write('stdout', v + '\n');
      status.textContent = 'Running…';
      cb(v);
    });
    return api;
  }

  /* A runnable code block: editor + Run/Reset + console. */
  function makeRunner(opts) {
    // opts: {code, original, onChange, extraButtons, label}
    const con = makeConsole();
    const edHost = h('div', { class: 'editor' });
    const runBtn = h('button', { type: 'button', class: 'btn btn-run', onclick: () => run() }, '▶ Run');
    const resetBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { if (confirm('Put the original code back?')) { cm.setValue(opts.original); } } }, 'Reset');
    const bar = h('div', { class: 'runner-bar' }, runBtn, resetBtn, ...(opts.extraButtons || []), h('span', { class: 'kbd-hint' }, 'Ctrl+Enter runs'));
    const el = h('div', { class: 'runner' }, edHost, bar, con.el);
    const cm = makeEditor(edHost, opts.code, { onRun: () => run(), onCheck: opts.onCheck, onChange: opts.onChange });
    async function run() {
      if (Engine.job) { toast('Something is already running. Press Stop first.'); return; }
      await Engine.run(cm.getValue(), con);
    }
    Engine.onState(() => { runBtn.disabled = !!Engine.job; });
    return { el, cm, con, run };
  }

  /* ======================================================================
   * Views
   * ==================================================================== */
  const main = $('#main');
  const sidebar = $('#sidebar');

  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  function modal(content) {
    const m = $('#modal');
    m.innerHTML = '';
    m.appendChild(h('div', { class: 'modal-card' }, content));
    m.hidden = false;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
  }
  function closeModal() { $('#modal').hidden = true; }

  function renderSidebar() {
    sidebar.innerHTML = '';
    const ov = Progress.data ? Progress.overall() : { passed: 0, total: 0, lessonsDone: 0 };
    sidebar.appendChild(h('div', { class: 'side-progress' },
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + (ov.total ? Math.round(100 * ov.passed / ov.total) : 0) + '%' })),
      h('div', { class: 'muted small' }, ov.total ? ov.passed + ' of ' + ov.total + ' exercises done' : 'Pick a lesson to begin')));
    const route = location.hash;
    sidebar.appendChild(h('a', { class: 'side-link' + (route === '' || route === '#/' ? ' active' : ''), href: '#/' }, '🏠 Home'));
    sidebar.appendChild(h('a', { class: 'side-link' + (route === '#/playground' ? ' active' : ''), href: '#/playground' }, '🧪 Playground'));
    CFG.course.sections.forEach((sec) => {
      sidebar.appendChild(h('div', { class: 'side-section' }, sec.title));
      sec.lessons.forEach((l) => {
        const idx = lessonIndex(l.id) + 1;
        const st = Progress.data ? Progress.lessonStats(l) : { complete: false, started: false, passed: 0, total: l.exercises };
        const cls = 'side-link lesson' + (route === '#/lesson/' + l.id ? ' active' : '') + (st.complete ? ' done' : st.started ? ' started' : '');
        sidebar.appendChild(h('a', { class: cls, href: '#/lesson/' + l.id },
          h('span', { class: 'num' }, st.complete ? '✓' : String(idx)),
          h('span', { class: 'ttl' }, l.title)));
      });
    });
    sidebar.appendChild(h('a', { class: 'side-link' + (route === '#/about' ? ' active' : ''), href: '#/about' }, 'ℹ️ About'));
  }

  function renderWho() {
    const b = $('#whoBtn');
    if (Progress.learner) {
      const sync = { idle: '', saving: ' · saving…', saved: ' · saved', offline: ' · offline (saved on this device)', error: ' · not saved' }[Progress.syncState] || '';
      b.textContent = (Progress.learner.name || Progress.learner.email) + sync;
      b.title = 'Signed in as ' + Progress.learner.email + '. Click to switch.';
    } else b.textContent = 'Sign in';
  }

  function renderEngine() {
    const el = $('#engineStatus');
    const txt = $('.engine-text', el);
    el.className = 'engine';
    if (Engine.failed) { el.classList.add('bad'); txt.textContent = 'Python failed to start'; el.title = Engine.failed + ' Click to retry.'; el.onclick = () => Engine.start(); }
    else if (Engine.ready) { el.classList.add('ok'); txt.textContent = Engine.job ? 'Python running' : 'Python ready'; el.title = 'Pyodide ' + (Engine.version || '') + (Engine.inline ? ' (compatibility mode)' : ''); el.onclick = null; }
    else { el.classList.add('wait'); txt.textContent = 'Loading Python…'; el.title = 'Downloading the Python engine (about 10 MB the first time).'; }
  }

  /* ---------- Home ---------- */
  function renderHome() {
    main.innerHTML = '';
    if (!Progress.learner) return renderSignIn();
    const ov = Progress.overall();
    const next = Progress.nextLesson();
    const nextIdx = lessonIndex(next.id) + 1;
    const nextStats = Progress.lessonStats(next);
    main.appendChild(h('section', { class: 'hero' },
      h('h1', null, 'Hi ' + (Progress.learner.name || 'there') + ' 👋'),
      h('p', { class: 'lead' }, CFG.course.tagline),
      h('div', { class: 'hero-cards' },
        h('a', { class: 'card card-cta', href: '#/lesson/' + next.id },
          h('div', { class: 'card-kicker' }, ov.lessonsDone === 0 && !nextStats.started ? 'Start here' : 'Continue'),
          h('div', { class: 'card-title' }, nextIdx + '. ' + next.title),
          h('div', { class: 'muted' }, next.blurb || '')),
        h('div', { class: 'card' },
          h('div', { class: 'card-kicker' }, 'Your progress'),
          h('div', { class: 'big' }, ov.lessonsDone + ' / ' + ov.lessons),
          h('div', { class: 'muted' }, 'lessons complete · ' + ov.passed + ' of ' + ov.total + ' exercises'),
          h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + (ov.total ? Math.round(100 * ov.passed / ov.total) : 0) + '%' }))),
        h('a', { class: 'card', href: '#/playground' },
          h('div', { class: 'card-kicker' }, 'Playground'),
          h('div', { class: 'card-title' }, 'Write anything'),
          h('div', { class: 'muted' }, 'A blank editor for your own ideas. Programs you save show up here.')))));

    const list = h('div', { class: 'lesson-grid' });
    CFG.course.sections.forEach((sec) => {
      list.appendChild(h('h2', { class: 'section-title' }, sec.title));
      sec.lessons.forEach((l) => {
        const st = Progress.lessonStats(l);
        const idx = lessonIndex(l.id) + 1;
        list.appendChild(h('a', { class: 'lesson-card' + (st.complete ? ' done' : ''), href: '#/lesson/' + l.id },
          h('div', { class: 'lesson-num' }, st.complete ? '✓' : String(idx)),
          h('div', null, h('div', { class: 'lesson-title' }, l.title), h('div', { class: 'muted small' }, l.blurb || ''),
            h('div', { class: 'muted small' }, (l.minutes ? '~' + l.minutes + ' min · ' : '') + (st.total ? st.passed + '/' + st.total + ' exercises' : '')))));
      });
    });
    main.appendChild(list);
    main.appendChild(h('section', { class: 'howto' },
      h('h2', null, 'How this works'),
      h('ul', null,
        h('li', null, 'Every lesson has short explanations, code you can change and run right in the page, and exercises that check your answer.'),
        h('li', null, 'Press ', h('b', null, 'Run'), ' to run code (or Ctrl+Enter). Press ', h('b', null, 'Check'), ' on an exercise to test it.'),
        h('li', null, 'Stuck? Use the hints. After three tries you can look at a solution, but try to understand it, then write your own.'),
        h('li', null, 'Your progress saves to this site under your email, so you can pick up on any computer.'))));
  }

  function renderSignIn() {
    const email = h('input', { type: 'email', required: true, placeholder: 'you@example.com', autocomplete: 'email', id: 'si-email' });
    const name = h('input', { type: 'text', placeholder: 'What should we call you?', maxlength: '40', id: 'si-name', autocomplete: 'given-name' });
    const err = h('div', { class: 'form-error', hidden: true });
    const form = h('form', { class: 'signin', onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { err.textContent = 'Please enter a real email address.'; err.hidden = false; return; }
      const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Loading…';
      await Progress.signIn(email.value, name.value || email.value.split('@')[0]);
      toast('Welcome, ' + Progress.learner.name + '!');
      route();
    } },
      h('h1', null, CFG.course.title),
      h('p', { class: 'lead' }, CFG.course.tagline),
      h('p', null, 'Enter an email address to save your progress. Nothing is emailed to you. The address is just the name on your save file, so use the same one each time.'),
      h('label', null, 'Email', email),
      h('label', null, 'Your first name', name),
      err,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Start learning'));
    main.appendChild(h('section', { class: 'signin-wrap' }, form, h('div', { class: 'signin-side' },
      h('h2', null, 'What you will learn'),
      h('ul', null, CFG.course.sections.map((s) => h('li', null, h('b', null, s.title + ': '), s.lessons.map((l) => l.title).join(', ')))),
      h('p', { class: 'muted small' }, 'Real Python runs in your browser. Nothing to install.'))));
    setTimeout(() => email.focus(), 50);
  }

  /* ---------- Lesson ---------- */
  let currentLesson = null;

  async function renderLesson(id) {
    const entry = lessonById(id);
    if (!entry) { location.hash = '#/'; return; }
    if (!Progress.learner) { renderSignIn(); return; }
    main.innerHTML = '';
    main.appendChild(h('div', { class: 'loading' }, 'Loading lesson…'));
    let lesson;
    try { lesson = await Lessons.get(id); } catch (e) { main.innerHTML = ''; main.appendChild(h('p', { class: 'form-error' }, e.message)); return; }
    if (location.hash !== '#/lesson/' + id) return; // navigated away meanwhile
    currentLesson = lesson;
    const lp = Progress.lesson(id);
    if (!lp.visited) { lp.visited = now(); Progress.touch(); }
    main.innerHTML = '';
    const idx = lessonIndex(id);
    const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];

    const head = h('header', { class: 'lesson-head' },
      h('div', { class: 'crumbs' }, entry.section + ' · Lesson ' + (idx + 1) + ' of ' + LESSONS.length),
      h('h1', null, entry.title),
      lesson.meta.goal ? h('p', { class: 'lead' }, lesson.meta.goal) : null,
      h('div', { class: 'lesson-stats', id: 'lessonStats' }));
    main.appendChild(head);

    const body = h('article', { class: 'lesson-body' });
    lesson.blocks.forEach((b) => {
      if (b.type === 'md') body.appendChild(h('div', { class: 'prose', html: b.html }));
      else if (b.type === 'code') body.appendChild(h('pre', { class: 'static ' + (b.lang || 'text') }, h('code', null, b.code)));
      else if (b.type === 'callout') body.appendChild(h('aside', { class: 'callout ' + b.kind }, h('div', { class: 'callout-title' }, b.title || { tip: 'Tip', note: 'Note', warning: 'Watch out', challenge: 'Challenge', goal: 'Goal' }[b.kind]), h('div', { class: 'prose', html: b.html })));
      else if (b.type === 'example') body.appendChild(renderExample(lesson, b));
      else if (b.type === 'exercise') body.appendChild(renderExercise(lesson, lesson.exercises[b.index]));
    });
    main.appendChild(body);

    main.appendChild(h('nav', { class: 'lesson-nav' },
      prev ? h('a', { class: 'btn btn-ghost', href: '#/lesson/' + prev.id }, '← ' + prev.title) : h('span'),
      next ? h('a', { class: 'btn btn-primary', href: '#/lesson/' + next.id, id: 'nextLessonBtn' }, 'Next: ' + next.title + ' →') : h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to home')));
    updateLessonStats();
    refreshEditors();
    window.scrollTo(0, 0);
  }

  /* CodeMirror measures itself when created; editors built before being attached to the page need a refresh. */
  function refreshEditors() {
    requestAnimationFrame(() => document.querySelectorAll('.CodeMirror').forEach((el) => el.CodeMirror && el.CodeMirror.refresh()));
  }

  function updateLessonStats() {
    const el = $('#lessonStats');
    if (!el || !currentLesson) return;
    const st = Progress.lessonStats(currentLesson);
    el.innerHTML = '';
    if (!st.total) { el.appendChild(h('span', { class: 'muted' }, 'No exercises in this lesson, just read and play.')); return; }
    el.appendChild(h('div', { class: 'bar' }, h('div', { class: 'fill', style: 'width:' + Math.round(100 * st.passed / st.total) + '%' })));
    el.appendChild(h('span', { class: st.complete ? 'ok-text' : 'muted' }, st.complete ? '✓ Lesson complete!' : st.passed + ' of ' + st.total + ' exercises done'));
  }

  function renderExample(lesson, b) {
    const saved = Progress.lesson(lesson.id).examples[b.n];
    const code = saved && saved.code ? saved.code : b.code;
    let t;
    const r = makeRunner({
      code, original: b.code,
      onChange: (v) => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (v === b.code) delete Progress.lesson(lesson.id).examples[b.n];
          else Progress.lesson(lesson.id).examples[b.n] = { code: v, updated: now() };
          Progress.touch();
        }, 800);
      },
    });
    r.el.classList.add('example');
    if (saved && saved.code && saved.code !== b.code) r.el.appendChild(h('div', { class: 'muted small pad' }, 'You changed this example earlier. Reset puts the original back.'));
    return r.el;
  }

  function renderExercise(lesson, ex) {
    const ep = Progress.exercise(lesson.id, ex.id);
    const code = ep.code || ex.starter;
    const results = h('div', { class: 'results', hidden: true });
    const hintsBox = h('div', { class: 'hints', hidden: true });
    let hintsShown = 0;
    let saveT;

    const hintBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => {
      if (!ex.hints.length) { toast('No hints for this one. Reread the lesson above.'); return; }
      if (hintsShown < ex.hints.length) {
        hintsShown++;
        hintsBox.hidden = false;
        hintsBox.innerHTML = '';
        ex.hints.slice(0, hintsShown).forEach((hint, i) => hintsBox.appendChild(h('div', { class: 'hint' }, h('b', null, 'Hint ' + (i + 1) + ': '), hint)));
        hintBtn.textContent = hintsShown < ex.hints.length ? 'Another hint (' + (ex.hints.length - hintsShown) + ' left)' : 'No more hints';
      }
    } }, ex.hints.length ? 'Hint' : 'Hint');

    const solBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => {
      if (!ex.solution) { toast('No solution shown for this one.'); return; }
      if (ep.attempts < 3 && !ep.passed) { toast('Try checking at least 3 times before peeking at the solution. (' + ep.attempts + ' so far)'); return; }
      const pre = h('pre', { class: 'static python' }, h('code', null, ex.solution));
      modal(h('div', null,
        h('h3', null, 'One way to solve it'),
        h('p', { class: 'muted' }, 'Read it, close this, and type your own version. Copying teaches your fingers; understanding teaches you.'),
        pre,
        h('div', { class: 'modal-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Close'),
          h('button', { type: 'button', class: 'btn', onclick: () => { r.cm.setValue(ex.solution); closeModal(); } }, 'Put it in my editor'))));
      if (!ep.usedSolution) { ep.usedSolution = true; ep.updated = now(); Progress.touch(); }
    } }, 'Solution');

    const checkBtn = h('button', { type: 'button', class: 'btn btn-check', onclick: () => check() }, '✓ Check');

    const r = makeRunner({
      code, original: ex.starter, extraButtons: [checkBtn, hintBtn, solBtn], onCheck: () => check(),
      onChange: (v) => { clearTimeout(saveT); saveT = setTimeout(() => { ep.code = v; ep.updated = now(); Progress.touch(); }, 800); },
    });
    r.el.classList.add('exercise-runner');
    Engine.onState(() => { checkBtn.disabled = !!Engine.job; });

    const badge = h('span', { class: 'badge' + (ep.passed ? ' pass' : '') }, ep.passed ? '✓ Passed' : 'Not yet');
    const wrap = h('section', { class: 'exercise' + (ep.passed ? ' passed' : ''), id: 'ex-' + ex.id },
      h('div', { class: 'exercise-head' }, h('h3', null, '✏️ ', ex.title), badge),
      h('div', { class: 'prose', html: ex.descHtml }),
      r.el, hintsBox, results);

    async function check() {
      if (Engine.job) { toast('Something is already running. Press Stop first.'); return; }
      if (ex.tests.length && ex.tests[0].broken) { results.hidden = false; results.innerHTML = ''; results.appendChild(h('div', { class: 'result fail' }, ex.tests[0].broken)); return; }
      const src = r.cm.getValue();
      ep.code = src; ep.attempts = (ep.attempts || 0) + 1; ep.updated = now();
      results.hidden = false;
      results.innerHTML = '';
      results.appendChild(h('div', { class: 'muted' }, 'Checking…'));
      const res = await Engine.test(src, ex.tests.map((t) => Object.assign(ex.setup ? { setup: ex.setup } : {}, t)), r.con);
      results.innerHTML = '';
      const list = res.results || [];
      const allPass = list.length > 0 && list.every((t) => t.passed);
      list.forEach((t) => {
        const item = h('div', { class: 'result ' + (t.passed ? 'pass' : 'fail') },
          h('div', { class: 'result-title' }, (t.passed ? '✓ ' : '✗ ') + t.name, t.stdin && t.stdin.length ? h('span', { class: 'muted small' }, '  (typed: ' + t.stdin.map((s) => JSON.stringify(s)).join(', ') + ')') : null));
        if (!t.passed) {
          item.appendChild(h('div', { class: 'result-msg' }, t.message || ''));
          if (t.expected !== null && t.expected !== undefined) item.appendChild(h('div', { class: 'cmp' }, h('div', null, h('div', { class: 'cmp-label' }, 'Expected'), h('pre', null, String(t.expected))), h('div', null, h('div', { class: 'cmp-label' }, 'Your program'), h('pre', null, t.got !== null && t.got !== undefined ? String(t.got) : (t.output || '(no output)')))));
          else if (t.got) item.appendChild(h('pre', { class: 'err-pre' }, String(t.got)));
          else if (t.output) item.appendChild(h('div', { class: 'cmp' }, h('div', null, h('div', { class: 'cmp-label' }, 'Your program printed'), h('pre', null, t.output))));
        }
        results.appendChild(item);
      });
      if (allPass) {
        const first = !ep.passed;
        ep.passed = true;
        if (!ep.passedAt) ep.passedAt = now();
        wrap.classList.add('passed');
        badge.textContent = '✓ Passed'; badge.classList.add('pass');
        results.insertBefore(h('div', { class: 'result-banner' }, first ? '🎉 Nice work! Exercise passed.' : '✓ Still passing.'), results.firstChild);
        Progress.touch();
        updateLessonStats();
        renderSidebar();
        const st = Progress.lessonStats(currentLesson);
        if (first && st.complete) {
          setTimeout(() => {
            modal(h('div', { class: 'center' }, h('div', { class: 'party' }, '🏆'), h('h3', null, 'Lesson complete!'),
              h('p', null, 'You finished every exercise in "' + lessonById(lesson.id).title + '".'),
              h('div', { class: 'modal-actions center' },
                h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Stay here'),
                (LESSONS[lessonIndex(lesson.id) + 1] ? h('a', { class: 'btn btn-primary', href: '#/lesson/' + LESSONS[lessonIndex(lesson.id) + 1].id, onclick: closeModal }, 'Next lesson →') : h('a', { class: 'btn btn-primary', href: '#/', onclick: closeModal }, 'Home')))));
          }, 300);
        } else if (first) toast('🎉 Passed!');
      } else {
        Progress.touch();
        if (ep.attempts >= 3 && ex.hints.length && hintsShown === 0) results.appendChild(h('div', { class: 'muted small' }, 'Stuck? The Hint button is right above.'));
      }
    }
    return wrap;
  }

  /* ---------- Playground ---------- */
  function renderPlayground() {
    if (!Progress.learner) { renderSignIn(); return; }
    main.innerHTML = '';
    const pg = Progress.data.playground;
    let current = sessionStorage.getItem('pycourse:pg:slot') || '';
    if (current && !pg[current]) current = '';
    const title = h('input', { type: 'text', class: 'pg-title', placeholder: 'Program name', maxlength: '60', value: current ? pg[current].title : '' });
    const saveBtn = h('button', { type: 'button', class: 'btn btn-check', onclick: () => save() }, '💾 Save');
    const newBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { current = ''; sessionStorage.removeItem('pycourse:pg:slot'); title.value = ''; r.cm.setValue(STARTER); renderList(); } }, 'New');
    const delBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => {
      if (!current) return;
      if (!confirm('Delete "' + (pg[current].title || 'this program') + '"?')) return;
      // A tombstone tells the server to drop it; push() clears tombstones once the server has them.
      pg[current] = { deleted: true, updated: now(), title: '', code: '' };
      current = ''; sessionStorage.removeItem('pycourse:pg:slot'); title.value = ''; r.cm.setValue(STARTER);
      Progress.touch();
      renderList();
    } }, 'Delete');
    const STARTER = '# Your playground. Write anything!\nname = input("What is your name? ")\nprint("Hello,", name)\n';
    const r = makeRunner({ code: current ? pg[current].code : (sessionStorage.getItem('pycourse:pg:draft') || STARTER), original: STARTER, extraButtons: [saveBtn, newBtn, delBtn], onCheck: () => save(),
      onChange: (v) => { try { sessionStorage.setItem('pycourse:pg:draft', v); } catch (e) {} } });
    function save() {
      const t = title.value.trim() || 'Untitled ' + new Date().toLocaleDateString();
      if (!current) current = 'p' + now().toString(36);
      pg[current] = { title: t, code: r.cm.getValue(), updated: now() };
      title.value = t;
      sessionStorage.setItem('pycourse:pg:slot', current);
      Progress.touch();
      toast('Saved "' + t + '"');
      renderList();
    }
    const list = h('div', { class: 'pg-list' });
    function renderList() {
      list.innerHTML = '';
      const items = Object.keys(pg).filter((k) => !pg[k].deleted).sort((a, b) => (pg[b].updated || 0) - (pg[a].updated || 0));
      list.appendChild(h('h3', null, 'Saved programs'));
      if (!items.length) list.appendChild(h('p', { class: 'muted small' }, 'Nothing saved yet. Write something and press Save.'));
      items.forEach((k) => list.appendChild(h('button', { type: 'button', class: 'pg-item' + (k === current ? ' active' : ''), onclick: () => { current = k; sessionStorage.setItem('pycourse:pg:slot', k); title.value = pg[k].title; r.cm.setValue(pg[k].code); renderList(); } },
        h('span', null, pg[k].title || 'Untitled'), h('span', { class: 'muted small' }, new Date(pg[k].updated).toLocaleDateString()))));
    }
    renderList();
    main.appendChild(h('header', { class: 'lesson-head' }, h('h1', null, 'Playground'), h('p', { class: 'lead' }, 'A blank page for your own programs. Save the good ones.')));
    main.appendChild(h('div', { class: 'pg-wrap' }, h('div', null, h('div', { class: 'pg-bar' }, title), r.el), list));
    refreshEditors();
  }

  /* ---------- About ---------- */
  function renderAbout() {
    main.innerHTML = '';
    main.appendChild(h('header', { class: 'lesson-head' }, h('h1', null, 'About')));
    const ov = Progress.data ? Progress.overall() : null;
    main.appendChild(h('div', { class: 'prose' },
      h('p', null, 'This course runs real Python 3 in your browser using Pyodide, so everything you learn here works the same when you install Python on a computer.'),
      h('h3', null, 'Keyboard shortcuts'),
      h('ul', null, h('li', null, h('code', null, 'Ctrl+Enter'), ' run the code in the editor you are in'), h('li', null, h('code', null, 'Shift+Ctrl+Enter'), ' check an exercise'), h('li', null, h('code', null, 'Tab'), ' indent 4 spaces, ', h('code', null, 'Shift+Tab'), ' un-indent'), h('li', null, h('code', null, 'Ctrl+/'), ' comment or uncomment lines')),
      h('h3', null, 'Your account'),
      Progress.learner ? h('p', null, 'Signed in as ', h('b', null, Progress.learner.name), ' (' + Progress.learner.email + '). ' + (ov ? ov.passed + ' exercises passed across ' + ov.lessonsDone + ' complete lessons.' : '')) : h('p', null, 'Not signed in.'),
      h('p', null, h('button', { type: 'button', class: 'btn btn-ghost', onclick: switchLearner }, 'Switch learner')),
      h('h3', null, 'Engine'),
      h('p', { class: 'muted small' }, 'Mode: ' + (Engine.inline ? 'compatibility (main thread)' : 'worker') + ' · Pyodide ' + (Engine.version || '(not loaded yet)') + ' · cross-origin isolated: ' + String(!!self.crossOriginIsolated)),
      h('p', { class: 'muted small' }, 'If Python will not load, check that the page can reach cdn.jsdelivr.net and cdnjs.cloudflare.com, then reload.')));
  }

  function switchLearner() {
    modal(h('div', null, h('h3', null, 'Switch learner'),
      h('p', null, 'Your progress is saved under ' + (Progress.learner ? Progress.learner.email : 'your email') + '. Sign out to let someone else use this computer, then sign back in with your email any time.'),
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { Progress.signOut(); closeModal(); location.hash = '#/'; route(); } }, 'Sign out'))));
  }

  /* ======================================================================
   * Router + boot
   * ==================================================================== */
  function route() {
    const hsh = location.hash || '#/';
    let m;
    closeModal();
    Engine.clearViewListeners();
    $('#sidebar').classList.remove('open');
    $('#backdrop').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    if ((m = hsh.match(/^#\/lesson\/([a-z0-9\-]+)/))) renderLesson(m[1]);
    else if (hsh === '#/playground') renderPlayground();
    else if (hsh === '#/about') renderAbout();
    else renderHome();
    renderSidebar();
    renderWho();
  }

  window.addEventListener('hashchange', route);
  $('#menuBtn').addEventListener('click', () => {
    const open = !$('#sidebar').classList.contains('open');
    $('#sidebar').classList.toggle('open', open);
    $('#backdrop').hidden = !open;
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  });
  $('#backdrop').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#backdrop').hidden = true; });
  $('#whoBtn').addEventListener('click', () => { if (Progress.learner) switchLearner(); else { location.hash = '#/'; route(); } });
  window.addEventListener('beforeunload', () => Progress.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Progress.flush(); });
  window.addEventListener('online', () => Progress.push(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  Progress.on(() => { renderWho(); });
  Engine.onState(renderEngine, true);

  Progress.load();
  route();
  if (Progress.learner) Progress.pull();
  Engine.start();
  renderEngine();
})();
