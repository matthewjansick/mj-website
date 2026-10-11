/* Family Hub dashboard. Vanilla JS, no build step. */
(function () {
  'use strict';

  var BOOT = window.FAMILY_HUB || {};
  var app = document.getElementById('app');
  var state = null;
  var loadError = '';
  var fastUntil = 0;
  var pollTimer = null;
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // ------------------------------------------------------------------ utils

  function h(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ICONS = {
    wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>',
    wired: '<rect x="7" y="3" width="10" height="8" rx="1.5"/><path d="M12 11v5M7 21v-3h10v3"/>',
    pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".8" fill="currentColor"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>'
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  }

  function fmtTime(ts, withDay) {
    if (!ts) return '';
    var d = new Date(ts * 1000);
    var opts = { hour: 'numeric', minute: '2-digit' };
    if (withDay) opts.weekday = 'short';
    try {
      return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: state.timezone }, opts)).format(d);
    } catch (e) {
      return new Intl.DateTimeFormat(undefined, opts).format(d);
    }
  }

  function dayKey(ts) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: state.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
    } catch (e) {
      return new Date(ts * 1000).toDateString();
    }
  }

  function fmtUntil(ts) {
    if (!ts) return '';
    return 'until ' + fmtTime(ts, dayKey(ts) !== dayKey(state.now));
  }

  function fmtHM(hm) {
    var p = hm.split(':');
    var d = new Date(2000, 0, 1, +p[0], +p[1]);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  }

  function ago(ts) {
    if (!ts) return 'never';
    var s = Math.max(0, state.now - ts);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + ' days ago';
  }

  function fmtDays(days) {
    days = days.slice().sort();
    if (days.length === 7) return 'Every day';
    var key = days.join(',');
    if (key === '1,2,3,4,5') return 'Weekdays';
    if (key === '0,6') return 'Weekends';
    if (key === '0,1,2,3,4') return 'Sun–Thu nights';
    if (key === '5,6') return 'Fri & Sat';
    var contiguous = days.length > 2 && days.every(function (d, i) { return i === 0 || d === days[i - 1] + 1; });
    if (contiguous) return DAY_SHORT[days[0]] + '–' + DAY_SHORT[days[days.length - 1]];
    return days.map(function (d) { return DAY_SHORT[d]; }).join(', ');
  }

  function ruleText(r) {
    if (r.start === r.end) return fmtDays(r.days) + ' · all day';
    return fmtDays(r.days) + ' · ' + fmtHM(r.start) + ' – ' + fmtHM(r.end);
  }

  function deviceName(d, client) {
    client = client || (d && d.client);
    return (d && d.label) || (client && (client.name || client.hostname || client.oui)) || (d && d.mac) || 'Device';
  }

  function profileById(id) {
    return (state.profiles || []).filter(function (p) { return p.id === id; })[0];
  }

  // ------------------------------------------------------------------ api

  function api(method, path, body) {
    return fetch(BOOT.rest + path, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': BOOT.nonce },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          if (res.status === 401 || (data && data.code === 'rest_cookie_invalid_nonce')) {
            throw new Error('Your login has expired. Reload the page to sign in again.');
          }
          throw new Error((data && data.message) || ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    });
  }

  function load() {
    return api('GET', 'state').then(function (data) {
      state = data;
      loadError = '';
      render();
    }).catch(function (err) {
      loadError = err.message;
      render();
    });
  }

  function mutate(method, path, body, okMessage) {
    return api(method, path, body).then(function (data) {
      if (data && data.profiles) state = data;
      fastUntil = Date.now() + 45000;
      render();
      schedulePoll();
      if (okMessage) toast(okMessage);
      return data;
    }).catch(function (err) {
      toast(err.message, true);
      throw err;
    });
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    var delay = Date.now() < fastUntil ? 2500 : 8000;
    pollTimer = setTimeout(function () {
      if (document.hidden || document.querySelector('dialog[open]')) {
        schedulePoll();
        return;
      }
      load().then(schedulePoll, schedulePoll);
    }, delay);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) load().then(schedulePoll);
  });

  // ------------------------------------------------------------------ toast

  var toastTimer;
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, isError ? 6000 : 2800);
  }

  // ------------------------------------------------------------------ render

  function statusInfo(p) {
    var s = p.status;
    switch (s.reason) {
      case 'paused': return { tone: 'blocked', title: 'Paused', sub: s.until ? fmtUntil(s.until) : 'until you resume', icon: 'pause' };
      case 'downtime': return { tone: 'blocked', title: 'Downtime', sub: s.until ? fmtUntil(s.until) : 'scheduled', icon: 'moon' };
      case 'bonus': return { tone: 'bonus', title: s.until ? 'Bonus time' : 'Allowed', sub: s.until ? fmtUntil(s.until) : 'schedule is off until you resume', icon: 'clock' };
      case 'disabled': return { tone: 'off', title: 'Not managed', sub: 'Family Hub is leaving these devices alone', icon: 'x' };
      default: return { tone: 'open', title: 'Internet on', sub: s.until ? 'Downtime starts ' + fmtTime(s.until, dayKey(s.until) !== dayKey(state.now)) : 'No downtime scheduled', icon: 'wifi' };
    }
  }

  function agentChip() {
    var a = state.agent;
    if (!a.configured) return '<button class="chip warn" data-act="settings">' + icon('warn') + 'Set up home agent</button>';
    if (!a.last_seen) return '<button class="chip warn" data-act="settings">' + icon('warn') + 'Waiting for home agent</button>';
    if (!a.online) return '<button class="chip bad" data-act="settings"><span class="dot"></span>Agent offline · ' + h(ago(a.last_seen)) + '</button>';
    if (a.gateway && a.gateway.ok === false) return '<button class="chip bad" data-act="settings"><span class="dot"></span>Can’t reach router</button>';
    var model = a.gateway && a.gateway.gateway_model ? ' · ' + h(a.gateway.gateway_model) : '';
    return '<button class="chip good" data-act="settings"><span class="dot"></span>Home agent online' + model + '</button>';
  }

  function render() {
    if (!state) {
      app.innerHTML = loadError
        ? '<div class="empty"><h2>Couldn’t load Family Hub</h2><p>' + h(loadError) + '</p><button class="btn" data-act="reload">Try again</button></div>'
        : '<p class="boot">Loading Family Hub…</p>';
      return;
    }
    var profiles = state.profiles || [];
    var html = '';
    html += '<header class="top">' +
      '<div class="brand"><span class="logo" aria-hidden="true">' + icon('wifi') + '</span><div><h1>Family Hub</h1><p>' + h(BOOT.user) + '</p></div></div>' +
      '<div class="top-actions">' + agentChip() +
      '<button class="icon-btn" data-act="activity" aria-label="Activity log" title="Activity">' + icon('list') + '</button>' +
      '<button class="icon-btn" data-act="settings" aria-label="Settings" title="Settings">' + icon('gear') + '</button></div>' +
      '</header>';

    if (loadError) html += '<div class="banner bad">' + icon('warn') + '<span>' + h(loadError) + '</span></div>';
    if (state.agent.gateway && state.agent.gateway.error && state.agent.online) {
      html += '<div class="banner bad">' + icon('warn') + '<span>Router: ' + h(state.agent.gateway.error) + '</span></div>';
    }
    if (!state.agent.configured || !state.agent.last_seen) {
      html += '<section class="setup"><h2>Finish setup</h2><ol>' +
        '<li' + (state.agent.configured ? ' class="done"' : '') + '>Generate an agent token in <button class="link" data-act="settings">Settings</button>.</li>' +
        '<li>Install the home agent on the Mac mini and run <code>probe</code> to identify your UniFi gateway.</li>' +
        '<li' + (profiles.length ? ' class="done"' : '') + '>Add each kid and pick their devices.</li></ol></section>';
    }

    if (profiles.length) {
      html += '<div class="everyone"><span>Everyone</span><div class="row">' +
        '<button class="btn danger" data-act="pause-all">' + icon('pause') + 'Pause all</button>' +
        (profiles.some(function (p) { return p.override; })
          ? '<button class="btn ghost" data-act="resume-all">' + icon('play') + 'Back to schedules</button>' : '') +
        '</div></div>';
    }

    html += '<main class="grid">';
    profiles.forEach(function (p) { html += profileCard(p); });
    html += '<button class="card add" data-act="new">' + icon('plus') + '<span>Add a kid</span></button>';
    html += '</main>';

    var unassigned = (state.clients || []).filter(function (c) { return c.online && !state.assigned[c.mac]; });
    if (unassigned.length && profiles.length) {
      html += '<p class="footnote">' + unassigned.length + ' other device' + (unassigned.length === 1 ? ' is' : 's are') + ' online and not assigned to anyone.</p>';
    }
    app.innerHTML = html;
  }

  function profileCard(p) {
    var st = statusInfo(p);
    var online = p.devices.filter(function (d) { return d.client && d.client.online; }).length;
    var html = '<article class="card kid tone-' + st.tone + '" style="--kid: var(--c-' + h(p.color) + ')">';
    html += '<div class="kid-head"><span class="avatar">' + h(p.name.charAt(0).toUpperCase()) + '</span>' +
      '<div class="kid-title"><h2>' + h(p.name) + '</h2><p>' + p.devices.length + ' device' + (p.devices.length === 1 ? '' : 's') + ' · ' + online + ' online</p></div>' +
      '<button class="icon-btn" data-act="edit" data-id="' + h(p.id) + '" aria-label="Edit ' + h(p.name) + '">' + icon('edit') + '</button></div>';

    html += '<div class="status">' + icon(st.icon) + '<div><strong>' + h(st.title) + '</strong><span>' + h(st.sub) + '</span></div>' +
      (p.pending && state.agent.online ? '<span class="pending" title="Waiting for the home agent to apply this">Applying…</span>' : '') +
      (p.pending && !state.agent.online && state.agent.configured ? '<span class="pending stale" title="The home agent is offline">Not applied</span>' : '') +
      '</div>';

    html += '<div class="actions">';
    var r = p.status.reason;
    if (r === 'open') {
      html += '<button class="btn danger big" data-act="pause" data-id="' + h(p.id) + '">' + icon('pause') + 'Pause internet</button>';
    } else if (r === 'paused') {
      html += '<button class="btn primary big" data-act="clear" data-id="' + h(p.id) + '">' + icon('play') + 'Resume</button>';
      html += '<button class="btn ghost" data-act="pause" data-id="' + h(p.id) + '">Change</button>';
    } else if (r === 'downtime') {
      html += '<button class="btn primary big" data-act="bonus" data-id="' + h(p.id) + '">' + icon('clock') + 'Give bonus time</button>';
    } else if (r === 'bonus') {
      if (p.status.until) html += '<button class="btn ghost" data-act="extend" data-id="' + h(p.id) + '">+15 min</button>';
      html += '<button class="btn danger" data-act="clear" data-id="' + h(p.id) + '">End now</button>';
    } else if (r === 'disabled') {
      html += '<button class="btn ghost big" data-act="edit" data-id="' + h(p.id) + '">Turn on in settings</button>';
    }
    html += '</div>';

    if (p.devices.length) {
      html += '<ul class="devices">';
      p.devices.forEach(function (d) {
        var c = d.client;
        var on = c && c.online;
        html += '<li><span class="dot ' + (on ? 'on' : '') + '" title="' + (on ? 'Online' : 'Offline') + '"></span>' +
          icon(c && c.wired ? 'wired' : 'wifi', 'muted') +
          '<span class="dname">' + h(deviceName(d)) + '</span>' +
          (c && c.randomized ? '<span class="tag warn" title="This device uses a private Wi-Fi address that can change. Turn off Private Wi-Fi Address for your network on the device.">private MAC</span>' : '') +
          (d.applied ? '<span class="tag blocked">' + icon('lock') + 'blocked</span>' : '') +
          '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="hint">No devices yet. <button class="link" data-act="edit" data-id="' + h(p.id) + '">Add devices</button></p>';
    }

    if (p.schedule.length) {
      html += '<div class="sched">' + icon('moon', 'muted') + '<div>' + p.schedule.map(function (rule) { return '<span>' + h(ruleText(rule)) + '</span>'; }).join('') + '</div></div>';
    }
    html += '</article>';
    return html;
  }

  // ------------------------------------------------------------------ dialogs

  function openDialog(inner, cls, onMount) {
    var dlg = document.createElement('dialog');
    dlg.className = 'sheet ' + (cls || '');
    dlg.innerHTML = inner;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); load().then(schedulePoll); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) dlg.close();
      if (e.target.closest('[data-close]')) dlg.close();
    });
    dlg.showModal();
    if (onMount) onMount(dlg);
    return dlg;
  }

  function choiceSheet(title, choices, onPick) {
    var inner = '<div class="sheet-head"><h3>' + h(title) + '</h3><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="choices">' +
      choices.map(function (c, i) { return '<button class="choice" data-i="' + i + '">' + h(c.label) + (c.sub ? '<small>' + h(c.sub) + '</small>' : '') + '</button>'; }).join('') + '</div>';
    openDialog(inner, 'small', function (dlg) {
      dlg.querySelectorAll('.choice').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var c = choices[+btn.getAttribute('data-i')];
          dlg.close();
          onPick(c.body);
        });
      });
    });
  }

  function pauseChoices() {
    return [
      { label: '30 minutes', body: { mode: 'block', minutes: 30 } },
      { label: '1 hour', body: { mode: 'block', minutes: 60 } },
      { label: '2 hours', body: { mode: 'block', minutes: 120 } },
      { label: 'Until 7:00 AM', sub: 'Overnight, e.g. phone off at bedtime', body: { mode: 'block', at: '07:00' } },
      { label: 'Until I resume', body: { mode: 'block' } }
    ];
  }

  function bonusChoices() {
    return [
      { label: '15 minutes', body: { mode: 'allow', minutes: 15 } },
      { label: '30 minutes', body: { mode: 'allow', minutes: 30 } },
      { label: '1 hour', body: { mode: 'allow', minutes: 60 } },
      { label: 'Skip downtime until I resume', sub: 'Schedule is ignored until you turn it back on', body: { mode: 'allow' } }
    ];
  }

  // -- profile editor

  function editProfile(id) {
    var p = id ? profileById(id) : null;
    var draft = {
      name: p ? p.name : '',
      color: p ? p.color : BOOT.colors[(state.profiles.length) % BOOT.colors.length],
      enabled: p ? p.enabled : true,
      devices: p ? p.devices.map(function (d) { return { mac: d.mac, label: d.label }; }) : [],
      schedule: p ? JSON.parse(JSON.stringify(p.schedule)) : []
    };
    var filter = '';

    function selected(mac) { return draft.devices.some(function (d) { return d.mac === mac; }); }

    function devicePicker() {
      var clients = (state.clients || []).slice();
      draft.devices.forEach(function (d) {
        if (!clients.some(function (c) { return c.mac === d.mac; })) clients.push({ mac: d.mac, name: d.label, manual: true });
      });
      clients.sort(function (a, b) {
        var sa = selected(a.mac) ? 0 : 1, sb = selected(b.mac) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        if (!!a.online !== !!b.online) return a.online ? -1 : 1;
        return deviceName(null, a).toLowerCase() < deviceName(null, b).toLowerCase() ? -1 : 1;
      });
      var f = filter.toLowerCase();
      var rows = clients.filter(function (c) {
        if (!f) return true;
        return [c.name, c.hostname, c.oui, c.mac, c.ip].join(' ').toLowerCase().indexOf(f) !== -1;
      }).slice(0, 120).map(function (c) {
        var owner = state.assigned[c.mac] && state.assigned[c.mac] !== id ? profileById(state.assigned[c.mac]) : null;
        var meta = [c.hostname && c.hostname !== c.name ? c.hostname : '', c.oui, c.mac].filter(Boolean).join(' · ');
        return '<label class="pick"><input type="checkbox" data-mac="' + h(c.mac) + '"' + (selected(c.mac) ? ' checked' : '') + '>' +
          '<span class="dot ' + (c.online ? 'on' : '') + '"></span>' +
          '<span class="pick-main"><span>' + h(deviceName(null, c)) + '</span><small>' + h(meta) + '</small></span>' +
          (c.randomized ? '<span class="tag warn">private MAC</span>' : '') +
          (owner ? '<span class="tag">' + h(owner.name) + '</span>' : '') + '</label>';
      }).join('');
      if (!rows) rows = '<p class="hint">' + (state.clients && state.clients.length ? 'No devices match.' : 'No devices reported yet. Once the home agent is running, everything on your network shows up here.') + '</p>';
      return rows;
    }

    function scheduleRows() {
      if (!draft.schedule.length) return '<p class="hint">No downtime. Internet is on unless you pause it.</p>';
      return draft.schedule.map(function (r, i) {
        return '<div class="rule" data-i="' + i + '"><div class="days">' + DAY_LETTER.map(function (l, d) {
          return '<button type="button" class="day' + (r.days.indexOf(d) !== -1 ? ' on' : '') + '" data-day="' + d + '" aria-pressed="' + (r.days.indexOf(d) !== -1) + '" aria-label="' + DAY_SHORT[d] + '">' + l + '</button>';
        }).join('') + '</div><div class="times"><label>From <input type="time" data-k="start" value="' + h(r.start) + '" required></label>' +
          '<label>to <input type="time" data-k="end" value="' + h(r.end) + '" required></label>' +
          '<button type="button" class="icon-btn" data-del aria-label="Remove rule">' + icon('trash') + '</button></div>' +
          (r.end <= r.start && r.start !== r.end ? '<small class="hint">Ends the next morning</small>' : '') + '</div>';
      }).join('');
    }

    var inner = '<form method="dialog" class="editor">' +
      '<div class="sheet-head"><h3>' + (p ? 'Edit ' + h(p.name) : 'Add a kid') + '</h3><button type="button" class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="sheet-body">' +
      '<label class="field"><span>Name</span><input name="name" maxlength="40" required value="' + h(draft.name) + '" placeholder="e.g. Ava"></label>' +
      '<div class="field"><span>Color</span><div class="swatches">' + BOOT.colors.map(function (c) {
        return '<button type="button" class="swatch' + (c === draft.color ? ' on' : '') + '" data-color="' + c + '" style="--kid: var(--c-' + c + ')" aria-label="' + c + '"></button>';
      }).join('') + '</div></div>' +
      '<label class="switch"><input type="checkbox" name="enabled"' + (draft.enabled ? ' checked' : '') + '><span>Managed by Family Hub</span></label>' +
      '<h4>Devices</h4><p class="hint">Pick everything this kid uses: phone, tablet, laptop, Xbox. Shared devices can go in more than one profile; they’re blocked if any of them is blocked.</p>' +
      '<input type="search" class="filter" placeholder="Search by name, maker, MAC or IP">' +
      '<div class="picker">' + devicePicker() + '</div>' +
      '<details class="manual"><summary>Add a device by MAC address</summary><div class="row"><input class="mac-in" placeholder="aa:bb:cc:dd:ee:ff"><input class="label-in" placeholder="Label (e.g. Xbox)"><button type="button" class="btn ghost" data-add-mac>Add</button></div></details>' +
      '<h4>Downtime</h4><p class="hint">Internet is off during these windows. Bonus time and pauses override it.</p>' +
      '<div class="rules">' + scheduleRows() + '</div>' +
      '<div class="presets"><button type="button" class="btn ghost small" data-preset="school">+ School nights 9 PM–7 AM</button><button type="button" class="btn ghost small" data-preset="weekend">+ Weekend nights 10:30 PM–8 AM</button><button type="button" class="btn ghost small" data-preset="custom">+ Custom</button></div>' +
      '</div><div class="sheet-foot">' + (p ? '<button type="button" class="btn ghost danger-text" data-delete>' + icon('trash') + 'Delete</button>' : '<span></span>') +
      '<button type="submit" class="btn primary">Save</button></div></form>';

    openDialog(inner, 'wide', function (dlg) {
      var form = dlg.querySelector('form');
      var picker = dlg.querySelector('.picker');
      var rules = dlg.querySelector('.rules');

      function rerenderRules() { rules.innerHTML = scheduleRows(); }

      form.name.addEventListener('input', function () { draft.name = form.name.value; });
      form.enabled.addEventListener('change', function () { draft.enabled = form.enabled.checked; });
      dlg.querySelector('.filter').addEventListener('input', function (e) { filter = e.target.value; picker.innerHTML = devicePicker(); });
      picker.addEventListener('change', function (e) {
        var mac = e.target.getAttribute('data-mac');
        if (!mac) return;
        if (e.target.checked) draft.devices.push({ mac: mac, label: '' });
        else draft.devices = draft.devices.filter(function (d) { return d.mac !== mac; });
      });
      dlg.querySelector('.swatches').addEventListener('click', function (e) {
        var b = e.target.closest('[data-color]');
        if (!b) return;
        draft.color = b.getAttribute('data-color');
        dlg.querySelectorAll('.swatch').forEach(function (s) { s.classList.toggle('on', s === b); });
      });
      dlg.querySelector('[data-add-mac]').addEventListener('click', function () {
        var mac = dlg.querySelector('.mac-in').value.trim().toLowerCase().replace(/-/g, ':');
        if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) { toast('That doesn’t look like a MAC address (aa:bb:cc:dd:ee:ff).', true); return; }
        if (!selected(mac)) draft.devices.push({ mac: mac, label: dlg.querySelector('.label-in').value.trim() });
        dlg.querySelector('.mac-in').value = '';
        dlg.querySelector('.label-in').value = '';
        picker.innerHTML = devicePicker();
      });
      rules.addEventListener('click', function (e) {
        var row = e.target.closest('.rule');
        if (!row) return;
        var r = draft.schedule[+row.getAttribute('data-i')];
        var dayBtn = e.target.closest('[data-day]');
        if (dayBtn) {
          var d = +dayBtn.getAttribute('data-day');
          var idx = r.days.indexOf(d);
          if (idx === -1) r.days.push(d); else r.days.splice(idx, 1);
          r.days.sort();
          rerenderRules();
        } else if (e.target.closest('[data-del]')) {
          draft.schedule.splice(+row.getAttribute('data-i'), 1);
          rerenderRules();
        }
      });
      rules.addEventListener('change', function (e) {
        var row = e.target.closest('.rule');
        var k = e.target.getAttribute('data-k');
        if (row && k) { draft.schedule[+row.getAttribute('data-i')][k] = e.target.value; rerenderRules(); }
      });
      dlg.querySelector('.presets').addEventListener('click', function (e) {
        var b = e.target.closest('[data-preset]');
        if (!b) return;
        var preset = b.getAttribute('data-preset');
        draft.schedule.push(
          preset === 'school' ? { days: [0, 1, 2, 3, 4], start: '21:00', end: '07:00' } :
          preset === 'weekend' ? { days: [5, 6], start: '22:30', end: '08:00' } :
          { days: [1, 2, 3, 4, 5], start: '08:00', end: '15:00' });
        rerenderRules();
      });
      var del = dlg.querySelector('[data-delete]');
      if (del) del.addEventListener('click', function () {
        if (!window.confirm('Delete ' + p.name + '? Their devices will be unblocked and left alone.')) return;
        mutate('DELETE', 'profiles/' + p.id, null, p.name + ' deleted').then(function () { dlg.close(); });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        for (var i = 0; i < draft.schedule.length; i++) {
          if (!draft.schedule[i].days.length) { toast('Pick at least one day for each downtime rule.', true); return; }
        }
        draft.name = form.name.value.trim();
        mutate(p ? 'PUT' : 'POST', p ? 'profiles/' + p.id : 'profiles', draft, 'Saved').then(function () { dlg.close(); }, function () {});
      });
      if (!p) form.name.focus();
    });
  }

  // -- settings

  function openSettings() {
    var a = state.agent;
    var g = a.gateway || {};
    var rows = [
      ['Status', !a.configured ? 'Not set up' : !a.last_seen ? 'Waiting for first check-in' : a.online ? 'Online' : 'Offline'],
      ['Last check-in', a.last_seen ? ago(a.last_seen) : '—'],
      ['Agent', a.hostname ? a.hostname + ' · v' + a.version : '—'],
      ['Gateway', g.gateway_model ? g.gateway_model + (g.gateway_name ? ' (' + g.gateway_name + ')' : '') : '—'],
      ['Gateway firmware', g.gateway_firmware || '—'],
      ['Network app', g.network_version || '—']
    ];
    if (g.error) rows.push(['Router error', g.error]);
    var s = state.settings;
    var inner = '<div class="sheet-head"><h3>Settings</h3><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="sheet-body">' +
      '<h4>Home agent</h4><dl class="kv">' + rows.map(function (r) { return '<dt>' + h(r[0]) + '</dt><dd>' + h(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="token-box"><p class="hint">The agent on the Mac mini signs in with a token. ' + (a.configured ? 'Generating a new one disconnects the agent until you update its config.' : '') + '</p>' +
      '<button class="btn ' + (a.configured ? 'ghost' : 'primary') + '" data-token>' + (a.configured ? 'Generate new token' : 'Generate agent token') + '</button><div class="token-out"></div></div>' +
      '<h4>How to block</h4>' +
      '<label class="radio"><input type="radio" name="enf" value="client_block"' + (s.enforcement === 'client_block' ? ' checked' : '') + '><span><strong>Block devices</strong><small>Kicks devices off Wi-Fi and stops them rejoining. Works on every UniFi version. Wi-Fi only.</small></span></label>' +
      '<label class="radio"><input type="radio" name="enf" value="traffic_rule"' + (s.enforcement === 'traffic_rule' ? ' checked' : '') + '><span><strong>Traffic rules</strong><small>Cuts internet access but stays on the local network. Also works for wired devices like a cabled Xbox. Needs Network 7.0+ (run <code>probe</code> to check).</small></span></label>' +
      '<label class="field"><span>Agent check-in interval</span><select name="poll">' + [5, 10, 15, 30, 60].map(function (n) {
        return '<option value="' + n + '"' + (+s.poll_interval === n ? ' selected' : '') + '>Every ' + n + ' seconds</option>';
      }).join('') + '</select></label>' +
      '<p class="hint">Signed in as ' + h(BOOT.user) + '. <a href="' + h(BOOT.logout) + '">Sign out</a></p>' +
      '</div>';
    openDialog(inner, '', function (dlg) {
      dlg.querySelectorAll('input[name=enf]').forEach(function (r) {
        r.addEventListener('change', function () { mutate('POST', 'settings', { enforcement: r.value }, 'Saved'); });
      });
      dlg.querySelector('select[name=poll]').addEventListener('change', function (e) {
        mutate('POST', 'settings', { poll_interval: +e.target.value }, 'Saved');
      });
      dlg.querySelector('[data-token]').addEventListener('click', function () {
        if (a.configured && !window.confirm('Generate a new token? The current agent will stop working until you paste the new token into its config.')) return;
        api('POST', 'agent/token').then(function (res) {
          var snippet = JSON.stringify({ hub: { url: res.hub_url, token: res.token } }, null, 2);
          dlg.querySelector('.token-out').innerHTML = '<p class="hint"><strong>Copy this now. It won’t be shown again.</strong> Put it in the agent’s config file:</p><pre>' + h(snippet) + '</pre><button class="btn ghost small" data-copy>Copy</button>';
          dlg.querySelector('[data-copy]').addEventListener('click', function () {
            navigator.clipboard.writeText(snippet).then(function () { toast('Copied'); });
          });
          state.agent.configured = true;
        }).catch(function (err) { toast(err.message, true); });
      });
    });
  }

  // -- activity

  function eventText(e) {
    var p = e.profile_id ? profileById(e.profile_id) : null;
    var dev = '';
    if (e.mac) {
      var found = null;
      (state.profiles || []).forEach(function (pp) { pp.devices.forEach(function (d) { if (d.mac === e.mac) found = d; }); });
      var client = (state.clients || []).filter(function (c) { return c.mac === e.mac; })[0];
      dev = found ? deviceName(found) : deviceName(null, client || { mac: e.mac });
    }
    var who = p ? p.name + ': ' : '';
    switch (e.type) {
      case 'device_blocked': return who + dev + ' blocked';
      case 'device_unblocked': return who + dev + ' unblocked';
      case 'profile_blocked': return who + 'internet blocked' + (e.message ? ' (' + e.message + ')' : '');
      case 'profile_unblocked': return who + 'internet restored' + (e.message ? ' (' + e.message + ')' : '');
      case 'error': return 'Problem: ' + (dev ? dev + ': ' : '') + e.message;
      default: return e.message || e.type;
    }
  }

  function openActivity() {
    var events = state.events || [];
    var inner = '<div class="sheet-head"><h3>Activity</h3><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="sheet-body">' +
      (events.length ? '<ol class="events">' + events.map(function (e) {
        return '<li class="ev-' + h(e.type) + '"><time>' + h(fmtTime(e.ts, true)) + '</time><span>' + h(eventText(e)) + '</span>' +
          (e.actor ? '<small>' + h(e.actor) + '</small>' : e.source === 'agent' ? '<small>agent</small>' : '') + '</li>';
      }).join('') + '</ol>' : '<p class="hint">Nothing yet.</p>') + '</div>';
    openDialog(inner);
  }

  // ------------------------------------------------------------------ events

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    var p = id ? profileById(id) : null;
    switch (act) {
      case 'reload': location.reload(); break;
      case 'settings': openSettings(); break;
      case 'activity': openActivity(); break;
      case 'new': editProfile(null); break;
      case 'edit': editProfile(id); break;
      case 'pause':
        choiceSheet('Pause ' + p.name + '’s internet', pauseChoices(), function (body) {
          mutate('POST', 'profiles/' + id + '/override', body, p.name + ' paused');
        });
        break;
      case 'bonus':
        choiceSheet('Bonus time for ' + p.name, bonusChoices(), function (body) {
          mutate('POST', 'profiles/' + id + '/override', body, 'Bonus time started');
        });
        break;
      case 'extend':
        mutate('POST', 'profiles/' + id + '/override', { mode: 'allow', minutes: 15, extend: true }, '+15 minutes');
        break;
      case 'clear':
        mutate('POST', 'profiles/' + id + '/override', { mode: 'clear' }, p.name + ' is back on schedule');
        break;
      case 'pause-all':
        choiceSheet('Pause everyone', pauseChoices(), function (body) {
          mutate('POST', 'override-all', body, 'Everyone paused');
        });
        break;
      case 'resume-all':
        mutate('POST', 'override-all', { mode: 'clear' }, 'Everyone is back on schedule');
        break;
    }
  });

  load().then(schedulePoll);
})();
