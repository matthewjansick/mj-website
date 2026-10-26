/* Anvil — iOS-style app runtime. Screens come from content.json. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var host = $('screenHost'), tabbar = $('tabbar'), navTitle = $('navTitle');
  var navBack = $('navBack'), navBackLabel = $('navBackLabel');
  var content = window.ANVIL && window.ANVIL.content ? window.ANVIL.content : { app: {}, tabs: [], screens: {} };
  var screens = content.screens || {};
  var tabs = content.tabs || [];
  var stacks = {};       // tabId -> [screenId, ...]
  var activeTab = null;
  var STORE = 'anvil:v1';
  var state = load();

  var ICONS = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h8"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6"/></svg>',
    hammer: '<svg viewBox="0 0 24 24"><path d="m14 7 6 6-2 2-6-6z"/><path d="M4 20l8-8"/><path d="M9 4h6l2 3-3 3-5-1z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* Tiny inline markup: **bold**, newlines -> paragraphs, "- " -> bullets, "## " -> heading. */
  function md(text) {
    var out = [], ul = null;
    String(text || '').split(/\n/).forEach(function (line) {
      line = line.trim();
      if (!line) { if (ul) { out.push(ul); ul = null; } return; }
      var h = esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^- /.test(line)) { ul = ul || '<ul>'; ul += '<li>' + h.slice(2) + '</li>'; return; }
      if (ul) { out.push(ul + '</ul>'); ul = null; }
      if (/^## /.test(line)) out.push('<h2>' + h.slice(3) + '</h2>');
      else out.push('<p>' + h + '</p>');
    });
    if (ul) out.push(ul + '</ul>');
    return out.join('');
  }

  /* ---------- rendering ---------- */
  function renderScreen(id, dir) {
    var s = screens[id];
    var root = el('section', 'screen' + (dir === 'pop' ? ' pop' : ''));
    root.setAttribute('data-screen', id);
    if (!s) {
      root.appendChild(el('div', 'empty', '<b>Nothing here yet</b>This screen has no content.'));
      return root;
    }
    if (s.largeTitle !== false) root.appendChild(el('h2', 'large-title', esc(s.title)));
    if (s.lede) root.appendChild(el('p', 'lede', esc(s.lede)));
    if (s.callout) root.appendChild(el('div', 'callout' + (s.calloutTone ? ' ' + s.calloutTone : ''), md(s.callout)));
    if (s.body) root.appendChild(el('div', 'prose', md(s.body)));
    (s.sections || []).forEach(function (sec) { root.appendChild(renderSection(sec, id)); });
    if (!s.body && !(s.sections || []).length) {
      root.appendChild(el('div', 'empty', '<b>Nothing here yet</b>Content for this screen hasn’t been added.'));
    }
    return root;
  }

  function renderSection(sec, screenId) {
    var g = el('div', 'group');
    if (sec.header) g.appendChild(el('div', 'group-header', esc(sec.header)));
    var list = el('div', 'list');
    list.setAttribute('role', sec.type === 'checklist' ? 'group' : 'list');
    if (sec.type === 'checklist') {
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
        b.type = 'button';
        b.setAttribute('role', 'checkbox');
        b.setAttribute('aria-checked', done[k] ? 'true' : 'false');
        b.innerHTML = '<span class="box"></span><span class="row-body"><span class="row-title">' + esc(it.title) + '</span>' +
          (it.subtitle ? '<span class="row-sub">' + esc(it.subtitle) + '</span>' : '') + '</span>';
        b.addEventListener('click', function () {
          done[k] = !done[k];
          state[key] = done; save();
          b.setAttribute('aria-checked', done[k] ? 'true' : 'false');
          update();
        });
        list.appendChild(b);
      });
      g.appendChild(prog);
      update();
    } else {
      (sec.items || []).forEach(function (it) { list.appendChild(renderRow(it)); });
    }
    g.appendChild(list);
    if (sec.footer) g.appendChild(el('div', 'group-footer', esc(sec.footer)));
    return g;
  }

  function renderRow(it) {
    var link = !!(it.screen || it.href);
    var r = el(link ? 'button' : 'div', 'row' + (it.icon ? ' has-icon' : ''));
    if (link) { r.type = 'button'; r.setAttribute('role', 'listitem'); }
    var icon = it.icon ? '<span class="row-icon" style="background:' + esc(it.iconColor || 'var(--tint)') + '">' + esc(it.icon) + '</span>' : '<span></span>';
    var trail = '';
    if (it.badge) trail += '<span class="badge ' + esc(it.badgeTone || '') + '">' + esc(it.badge) + '</span>';
    if (it.value) trail += '<span>' + esc(it.value) + '</span>';
    if (link) trail += '<span class="chev"></span>';
    r.innerHTML = icon + '<span class="row-body"><span class="row-title">' + esc(it.title) + '</span>' +
      (it.subtitle ? '<span class="row-sub">' + esc(it.subtitle) + '</span>' : '') + '</span>' +
      '<span class="row-trail">' + trail + '</span>';
    if (it.screen) r.addEventListener('click', function () { push(it.screen); });
    else if (it.href) r.addEventListener('click', function () { window.open(it.href, '_blank', 'noopener'); });
    return r;
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
    history.replaceState({ tab: activeTab, stack: stack.slice() }, '', '#' + activeTab + '/' + stack.slice(1).join('/'));
  }
  function push(id) { stacks[activeTab].push(id); show('push'); }
  function pop() { if (stacks[activeTab].length > 1) { stacks[activeTab].pop(); show('pop'); } }
  function tabById(id) { for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i]; return {}; }
  function selectTab(id) {
    if (activeTab === id) { stacks[id] = [tabById(id).screen]; }  // tap again = pop to root
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

  /* Edge-swipe back (iOS gesture) */
  var sx = null, sy = null;
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX < 24 ? t.clientX : null; sy = t.clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (sx == null) return;
    var t = e.changedTouches[0];
    if (t.clientX - sx > 70 && Math.abs(t.clientY - sy) < 60) pop();
    sx = null;
  }, { passive: true });

  /* Restore from hash */
  var h = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  var startTab = tabById(h[0]).id ? h[0] : (tabs[0] && tabs[0].id);
  if (startTab) {
    stacks[startTab] = [tabById(startTab).screen].concat(h.slice(1).filter(function (id) { return screens[id]; }));
    selectTab(startTab);
  } else {
    host.appendChild(el('div', 'empty', '<b>No content yet</b>Add tabs and screens to content.json.'));
  }

  /* Add-to-Home-Screen hint for Safari on iPhone when not yet installed */
  var standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  var isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  var dismissed = false;
  try { dismissed = localStorage.getItem('anvil:a2hs') === '1'; } catch (e) {}
  if (isiOS && !standalone && !dismissed) {
    $('a2hs').hidden = false;
    $('a2hsClose').addEventListener('click', function () {
      $('a2hs').hidden = true;
      try { localStorage.setItem('anvil:a2hs', '1'); } catch (e) {}
    });
  }
})();
