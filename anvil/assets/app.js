/* Hold Fast — iOS-style app runtime. Screens come from content.json. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var host = $('screenHost'), tabbar = $('tabbar'), navTitle = $('navTitle');
  var navBack = $('navBack'), navBackLabel = $('navBackLabel');
  var content = window.ANVIL && window.ANVIL.content ? window.ANVIL.content : { app: {}, tabs: [], screens: {} };
  var ASSETS = (window.ANVIL && window.ANVIL.assets) || '';
  var screens = content.screens || {};
  var tabs = content.tabs || [];
  var campuses = (content.app && content.app.campuses) || [];
  var stacks = {};
  var activeTab = null;
  var STORE = 'anvil:v1';
  var state = load();

  var ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
    bed: '<svg viewBox="0 0 24 24"><path d="M3 18V8"/><path d="M3 14h18v4"/><path d="M21 14v-3a2 2 0 0 0-2-2h-8v5"/><circle cx="7" cy="10" r="2"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M12.5 7.5l4 4"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6"/></svg>'
  };

  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ } }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }
  function md(text) {
    var out = [], ul = null;
    String(text || '').split(/\n/).forEach(function (line) {
      line = line.trim();
      if (!line) { if (ul) { out.push(ul + '</ul>'); ul = null; } return; }
      if (/^- /.test(line)) { ul = ul || '<ul>'; ul += '<li>' + inline(line.slice(2)) + '</li>'; return; }
      if (ul) { out.push(ul + '</ul>'); ul = null; }
      if (/^## /.test(line)) out.push('<h2>' + inline(line.slice(3)) + '</h2>');
      else out.push('<p>' + inline(line) + '</p>');
    });
    if (ul) out.push(ul + '</ul>');
    return out.join('');
  }
  function campusTitle(id) { for (var i = 0; i < campuses.length; i++) if (campuses[i].id === id) return campuses[i].title; return ''; }
  function myCampus() { return (content.app && content.app.campus) || state.campus || ''; }

  /* ---------- screens ---------- */
  function renderScreen(id, dir) {
    var s = screens[id];
    var root = el('section', 'screen' + (dir === 'pop' ? ' pop' : ''));
    root.setAttribute('data-screen', id);
    if (!s) { root.appendChild(el('div', 'empty', '<b>Nothing here yet</b>This screen has no content.')); return root; }
    if (s.hero) {
      var h = el('div', 'hero');
      h.innerHTML = (s.hero.eyebrow ? '<div class="eyebrow">' + esc(s.hero.eyebrow) + '</div>' : '') +
        '<div class="hero-row"><div><h2 class="large-title">' + esc(s.title) + '</h2>' +
        (s.hero.sub ? '<p class="lede">' + esc(s.hero.sub) + '</p>' : '') + '</div>' +
        (s.hero.image ? '<img class="hero-img" alt="" src="' + esc(ASSETS + s.hero.image) + '">' : '') + '</div>';
      root.appendChild(h);
    } else if (s.largeTitle !== false) {
      root.appendChild(el('h2', 'large-title', esc(s.title)));
      if (s.lede) root.appendChild(el('p', 'lede', esc(s.lede)));
    }
    if (s.callout) root.appendChild(el('div', 'callout' + (s.calloutTone ? ' ' + s.calloutTone : ''), md(s.callout)));
    if (s.body) root.appendChild(el('div', 'prose', md(s.body)));
    (s.sections || []).forEach(function (sec) { root.appendChild(renderSection(sec, id)); });
    return root;
  }

  function group(sec) {
    var g = el('div', 'group');
    if (sec.header) g.appendChild(el('div', 'group-header', esc(sec.header)));
    return g;
  }
  function finish(g, sec, list) {
    if (list) g.appendChild(list);
    if (sec.footer) g.appendChild(el('div', 'group-footer', esc(sec.footer)));
    return g;
  }

  function renderSection(sec, screenId) {
    switch (sec.type) {
      case 'checklist': return renderChecklist(sec, screenId);
      case 'prose': return finish(group(sec), sec, el('div', 'prose', md(sec.body)));
      case 'campus': return renderCampusPicker(sec);
      case 'weather': return renderWeather(sec);
      case 'contacts': return renderContacts(sec);
      case 'days': return renderDays(sec, screenId);
      case 'roster': return renderRoster(sec);
      case 'roster-search': return renderRosterSearch(sec);
      case 'image': return renderImage(sec);
      case 'notes': return renderNotes(sec, screenId);
      default:
        var g = group(sec), list = el('div', 'list');
        (sec.items || []).forEach(function (it) { list.appendChild(renderRow(it)); });
        return finish(g, sec, list);
    }
  }

  function renderRow(it) {
    var link = !!(it.screen || it.href || it.tel);
    var r = el(link ? 'button' : 'div', 'row' + (it.icon ? ' has-icon' : ''));
    if (link) r.type = 'button';
    var icon = it.icon ? '<span class="row-icon" style="background:' + esc(it.iconColor || 'var(--tint)') + '">' + esc(it.icon) + '</span>' : '<span></span>';
    var trail = '';
    if (it.badge) trail += '<span class="badge ' + esc(it.badgeTone || '') + '">' + esc(it.badge) + '</span>';
    if (it.value) trail += '<span class="val">' + esc(it.value) + '</span>';
    if (it.tel) trail += '<span class="val tint">' + esc(it.tel) + '</span>';
    if (it.screen || it.href) trail += '<span class="chev"></span>';
    r.innerHTML = icon + '<span class="row-body"><span class="row-title">' + esc(it.title) + '</span>' +
      (it.subtitle ? '<span class="row-sub">' + esc(it.subtitle) + '</span>' : '') + '</span>' +
      '<span class="row-trail">' + trail + '</span>';
    if (it.screen) r.addEventListener('click', function () { push(it.screen); });
    else if (it.href) r.addEventListener('click', function () { window.open(it.href, '_blank', 'noopener'); });
    else if (it.tel) r.addEventListener('click', function () { location.href = 'tel:' + it.tel.replace(/[^\d+]/g, ''); });
    return r;
  }

  function renderChecklist(sec, screenId) {
    var g = group(sec), list = el('div', 'list');
    var key = screenId + ':' + (sec.id || sec.header || '');
    var done = state[key] || {};
    var prog = el('div', 'progress', '<i></i>');
    var update = function () {
      var n = (sec.items || []).length, d = 0;
      (sec.items || []).forEach(function (it, i) { if (done[it.id || i]) d++; });
      prog.firstChild.style.width = (n ? (100 * d / n) : 0) + '%';
    };
    (sec.items || []).forEach(function (it, i) {
      var k = it.id || i;
      var b = el('button', 'check');
      b.type = 'button'; b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', done[k] ? 'true' : 'false');
      b.innerHTML = '<span class="box"></span><span class="row-body"><span class="row-title">' + esc(it.title) + '</span>' +
        (it.subtitle ? '<span class="row-sub">' + esc(it.subtitle) + '</span>' : '') + '</span>';
      b.addEventListener('click', function () {
        done[k] = !done[k]; state[key] = done; save();
        b.setAttribute('aria-checked', done[k] ? 'true' : 'false'); update();
      });
      list.appendChild(b);
    });
    g.appendChild(prog); update();
    return finish(g, sec, list);
  }

  function segmented(options, value, onChange) {
    var seg = el('div', 'seg'); seg.setAttribute('role', 'tablist');
    options.forEach(function (o) {
      var b = el('button', 'seg-btn', esc(o.title)); b.type = 'button';
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', o.id === value ? 'true' : 'false');
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(seg.children, function (c) { c.setAttribute('aria-selected', 'false'); });
        b.setAttribute('aria-selected', 'true'); onChange(o.id);
      });
      seg.appendChild(b);
    });
    return seg;
  }

  function renderCampusPicker(sec) {
    var g = group(sec);
    var opts = [{ id: '', title: 'All' }].concat(campuses);
    g.appendChild(segmented(opts, myCampus(), function (id) { state.campus = id; save(); }));
    return finish(g, sec, null);
  }

  function renderWeather(sec) {
    var g = group(sec), list = el('div', 'list weather');
    (sec.days || []).forEach(function (d) {
      list.appendChild(el('div', 'row', '<span></span><span class="row-body"><span class="row-title">' + esc(d.day) + '</span></span>' +
        '<span class="row-trail"><span class="temp hi">' + esc(d.high) + '°</span><span class="temp lo">' + esc(d.low) + '°</span></span>'));
    });
    return finish(g, sec, list);
  }

  function renderContacts(sec) {
    var g = group(sec), list = el('div', 'list');
    var mine = myCampus();
    var items = (sec.items || []).slice().sort(function (a, b) { return (b.campus === mine) - (a.campus === mine); });
    items.forEach(function (it) {
      var row = renderRow(it);
      if (mine && it.campus === mine) row.classList.add('mine');
      list.appendChild(row);
    });
    return finish(g, sec, list);
  }

  /* Schedule: day segmented control, campus-aware rotations, "now" marker during the retreat. */
  function parseTime(dateStr, t) {
    var m = /(\d+):(\d+)\s*(AM|PM)/i.exec(t); if (!m) return null;
    var h = +m[1] % 12 + (/PM/i.test(m[3]) ? 12 : 0);
    var p = dateStr.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], h, +m[2]).getTime();
  }
  function renderDays(sec, screenId) {
    var g = group(sec);
    var days = sec.days || [];
    var now = Date.now();
    var todayIdx = -1;
    days.forEach(function (d, i) { var p = d.date.split('-'); var s = new Date(+p[0], +p[1] - 1, +p[2]).getTime(); if (now >= s && now < s + 864e5) todayIdx = i; });
    var key = 'day:' + screenId;
    var cur = state[key] && days.some(function (d) { return d.id === state[key]; }) ? state[key] : (days[todayIdx > -1 ? todayIdx : 0] || {}).id;
    var body = el('div');
    var draw = function () {
      body.innerHTML = '';
      var d = days.filter(function (x) { return x.id === cur; })[0]; if (!d) return;
      body.appendChild(el('h2', 'day-title', esc(d.title)));
      var mine = myCampus();
      var list = el('div', 'list timeline');
      var nextMarked = false;
      var times = d.items.map(function (it) { return parseTime(d.date, it.time); });
      d.items.forEach(function (it, i) {
        var r = el('div', 'tl' + (it.kind ? ' ' + it.kind : ''));
        var t = times[i], tNext = null;
        for (var j = i + 1; j < times.length; j++) if (times[j] && times[j] > t) { tNext = times[j]; break; }
        if (t && now >= t && (tNext ? now < tNext : now < t + 36e5)) { r.classList.add('now'); nextMarked = true; }
        var meta = [];
        if (it.who) meta.push(esc(it.who));
        if (it.where) meta.push(esc(it.where));
        var html = '<span class="tl-time">' + esc(it.time) + '</span><span class="tl-body"><span class="row-title">' + esc(it.title) + '</span>';
        if (meta.length) html += '<span class="row-sub">' + meta.join(' · ') + '</span>';
        if (it.campus) {
          var shown = mine && it.campus[mine] ? [[mine, it.campus[mine]]] : Object.keys(it.campus).map(function (k) { return [k, it.campus[k]]; });
          html += '<span class="tl-campus">' + shown.map(function (p) { return '<span><b>' + esc(campusTitle(p[0])) + ':</b> ' + esc(p[1]) + '</span>'; }).join('') + '</span>';
        }
        if (it.note) html += '<span class="row-sub note">' + esc(it.note).replace(/\n/g, '<br>') + '</span>';
        r.innerHTML = html + '</span>';
        list.appendChild(r);
      });
      body.appendChild(list);
    };
    g.appendChild(segmented(days.map(function (d) { return { id: d.id, title: d.label }; }), cur, function (id) { cur = id; state[key] = id; save(); draw(); }));
    if (campuses.length) {
      var campusSeg = segmented([{ id: '', title: 'All' }].concat(campuses), myCampus(), function (id) { state.campus = id; save(); draw(); });
      campusSeg.classList.add('seg-small');
      g.appendChild(campusSeg);
    }
    g.appendChild(body); draw();
    return finish(g, sec, null);
  }

  /* Housing */
  function allRooms() {
    var out = [];
    Object.keys(screens).forEach(function (sid) {
      (screens[sid].sections || []).forEach(function (sec) {
        if (sec.type !== 'roster') return;
        sec.rooms.forEach(function (r) { r.names.forEach(function (n) { out.push({ name: n, room: r.room, building: sec.building, campus: sec.campus, screen: sid }); }); });
      });
    });
    return out;
  }
  function renderRoster(sec) {
    var g = group({ header: sec.building + (sec.mapNo ? '  ·  #' + sec.mapNo + ' on map' : '') });
    var list = el('div', 'list');
    sec.rooms.forEach(function (r) {
      var row = el('div', 'room');
      row.innerHTML = '<div class="room-name">' + esc(r.room) + '<span class="count">' + r.names.length + '</span></div><div class="names">' + r.names.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>';
      list.appendChild(row);
    });
    return finish(g, sec, list);
  }
  function renderRosterSearch(sec) {
    var g = el('div', 'group');
    var wrap = el('div', 'search');
    wrap.innerHTML = '<input type="search" placeholder="' + esc(sec.placeholder || 'Search') + '" autocomplete="off" autocorrect="off" autocapitalize="words" aria-label="Search housing">';
    var input = wrap.firstChild;
    var results = el('div', 'list results'); results.hidden = true;
    var people = allRooms();
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      results.innerHTML = ''; results.hidden = !q;
      if (!q) return;
      var hits = people.filter(function (p) { return (p.name + ' ' + p.room + ' ' + p.building).toLowerCase().indexOf(q) > -1; }).slice(0, 30);
      if (!hits.length) { results.appendChild(el('div', 'row', '<span></span><span class="row-body"><span class="row-sub">No matches</span></span>')); return; }
      hits.forEach(function (p) {
        var where = p.room.indexOf(p.building) === 0 ? p.room : p.building + ' ' + p.room;
        results.appendChild(renderRow({ title: p.name, subtitle: where + ' · ' + campusTitle(p.campus), screen: p.screen }));
      });
    });
    g.appendChild(wrap); g.appendChild(results);
    return g;
  }

  /* Notebook pages: autosaved textareas with share/copy */
  function renderNotes(sec, screenId) {
    var g = el('div', 'group');
    var key = 'notes:' + (sec.id || screenId);
    var saved = state[key] || {};
    var list = el('div', 'list notes');
    (sec.fields || []).forEach(function (f) {
      var w = el('label', 'note-field');
      w.innerHTML = '<span class="note-label">' + esc(f.label) + '</span><textarea rows="' + (f.rows || 3) + '" placeholder="\u2026"></textarea>';
      var ta = w.querySelector('textarea');
      ta.value = saved[f.id] || '';
      var grow = function () { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', function () { saved[f.id] = ta.value; state[key] = saved; save(); grow(); });
      list.appendChild(w);
      requestAnimationFrame(grow);
    });
    g.appendChild(list);
    var bar = el('div', 'note-actions');
    var share = el('button', 'note-btn', 'Share notes'); share.type = 'button';
    share.addEventListener('click', function () {
      var title = (screens[screenId] || {}).title || 'Notes';
      var text = title + '\n\n' + (sec.fields || []).map(function (f) { return f.label.toUpperCase() + '\n' + (saved[f.id] || '').trim() + '\n'; }).join('\n');
      if (navigator.share) { navigator.share({ title: title, text: text }).catch(function () {}); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { share.textContent = 'Copied'; setTimeout(function () { share.textContent = 'Share notes'; }, 1500); }); }
    });
    bar.appendChild(share);
    g.appendChild(bar);
    g.appendChild(el('div', 'group-footer', 'Saved automatically on this phone.'));
    return g;
  }

  /* Map image with full-screen pan/zoom viewer */
  function renderImage(sec) {
    var g = el('div', 'group');
    var b = el('button', 'figure'); b.type = 'button';
    b.innerHTML = '<img src="' + esc(ASSETS + sec.src) + '" alt="' + esc(sec.alt || '') + '">' + (sec.caption ? '<span class="caption">' + esc(sec.caption) + '</span>' : '');
    b.addEventListener('click', function () {
      var v = el('div', 'viewer');
      v.innerHTML = '<button type="button" class="viewer-close" aria-label="Close">Done</button><div class="viewer-scroll"><img src="' + esc(ASSETS + sec.src) + '" alt="' + esc(sec.alt || '') + '"></div>';
      v.querySelector('.viewer-close').addEventListener('click', function () { v.remove(); });
      document.body.appendChild(v);
      var sc = v.querySelector('.viewer-scroll'); sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
    });
    g.appendChild(b);
    return g;
  }

  /* ---------- navigation ---------- */
  function show(dir) {
    var stack = stacks[activeTab];
    var id = stack[stack.length - 1];
    host.innerHTML = '';
    host.appendChild(renderScreen(id, dir));
    var s = screens[id] || {};
    navTitle.textContent = stack.length > 1 ? (s.title || '') : (content.app.name || 'Anvil');
    navBack.hidden = stack.length < 2;
    if (stack.length > 1) {
      var prev = screens[stack[stack.length - 2]] || {};
      navBackLabel.textContent = stack.length === 2 ? (tabById(activeTab).title || 'Back') : (prev.title || 'Back');
    }
    window.scrollTo(0, 0);
    history.replaceState(null, '', '#' + activeTab + '/' + stack.slice(1).join('/'));
  }
  function push(id) {
    /* If the target is a tab root, switch tabs instead of stacking. */
    for (var i = 0; i < tabs.length; i++) if (tabs[i].screen === id && tabs[i].id !== activeTab) { stacks[tabs[i].id] = [id]; return selectTab(tabs[i].id); }
    stacks[activeTab].push(id); show('push');
  }
  function pop() { if (stacks[activeTab].length > 1) { stacks[activeTab].pop(); show('pop'); } }
  function tabById(id) { for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i]; return {}; }
  function selectTab(id) {
    if (activeTab === id) stacks[id] = [tabById(id).screen];
    activeTab = id;
    stacks[id] = stacks[id] || [tabById(id).screen];
    Array.prototype.forEach.call(tabbar.children, function (b) { b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'); });
    show('push');
  }

  tabs.forEach(function (t) {
    var b = el('button', 'tab', (ICONS[t.icon] || ICONS.list) + '<span>' + esc(t.title) + '</span>');
    b.type = 'button'; b.dataset.tab = t.id; b.setAttribute('role', 'tab');
    b.addEventListener('click', function () { selectTab(t.id); });
    tabbar.appendChild(b);
  });
  navBack.addEventListener('click', pop);

  var sx = null, sy = null;
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX < 24 ? t.clientX : null; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (sx == null) return;
    var t = e.changedTouches[0];
    if (t.clientX - sx > 70 && Math.abs(t.clientY - sy) < 60) pop();
    sx = null;
  }, { passive: true });

  var h = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  var startTab = tabById(h[0]).id ? h[0] : (tabs[0] && tabs[0].id);
  if (startTab) {
    stacks[startTab] = [tabById(startTab).screen].concat(h.slice(1).filter(function (id) { return screens[id]; }));
    selectTab(startTab);
  } else {
    host.appendChild(el('div', 'empty', '<b>No content yet</b>Add tabs and screens to content.json.'));
  }

  var standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  var isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  var dismissed = false;
  try { dismissed = localStorage.getItem('anvil:a2hs') === '1'; } catch (e) {}
  if (isiOS && !standalone && !dismissed) {
    $('a2hs').hidden = false;
    $('a2hsClose').addEventListener('click', function () { $('a2hs').hidden = true; try { localStorage.setItem('anvil:a2hs', '1'); } catch (e) {} });
  }
})();
