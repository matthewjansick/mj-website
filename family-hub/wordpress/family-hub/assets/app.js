/* Family Hub dashboard. Vanilla JS, no build step. */
(function () {
  'use strict';

  var BOOT = window.FAMILY_HUB || {};
  var app = document.getElementById('app');
  var state = null;
  var loadError = '';
  var fastUntil = 0;
  var pollTimer = null;
  var APPS = [
    ['com.apple.mobilephone', 'Phone'], ['com.apple.MobileSMS', 'Messages'], ['com.apple.facetime', 'FaceTime'],
    ['com.apple.Maps', 'Maps'], ['com.apple.mobiletimer', 'Clock'], ['com.apple.findmy', 'Find My'],
    ['com.apple.MobileAddressBook', 'Contacts'], ['com.apple.camera', 'Camera'], ['com.apple.mobileslideshow', 'Photos'],
    ['com.apple.Music', 'Music'], ['com.apple.iBooks', 'Books'], ['com.apple.mobilenotes', 'Notes'],
    ['com.apple.calculator', 'Calculator'], ['com.apple.weather', 'Weather'], ['com.apple.mobilecal', 'Calendar'],
    ['com.apple.reminders', 'Reminders'], ['com.apple.Health', 'Health']
  ];
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
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    apple: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10 9.5l1.5 1.5 3-3"/>'
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
    return (d && d.label) || (client && (client.name || client.hostname || client.oui)) || (d && d.mdm && (d.mdm.name || d.mdm.model)) || (d && d.mac) || 'Device';
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

  function winding(p) {
    return !p.status.blocked && p.cutoff && (p.cutoff.at - state.now) <= state.window + 5 ? p.cutoff : null;
  }

  function minutesLeft(ts) {
    return Math.max(1, Math.round((ts - state.now) / 60));
  }

  function statusInfo(p) {
    var s = p.status;
    var w = winding(p);
    if (w) {
      var why = w.source === 'bedtime' ? 'Bedtime' : w.source === 'bonus' ? 'Bonus time ending' : 'Winding down';
      return { tone: 'winding', title: why + ' · ' + minutesLeft(w.at) + ' min', sub: 'Screens off at ' + fmtTime(w.at) + (p.extended ? ' · used their +5' : ''), icon: 'clock' };
    }
    switch (s.reason) {
      case 'paused': return { tone: 'blocked', title: 'Paused', sub: s.until ? fmtUntil(s.until) : 'until you resume', icon: 'pause' };
      case 'downtime': return { tone: 'blocked', title: 'Downtime', sub: s.until ? fmtUntil(s.until) : 'scheduled', icon: 'moon' };
      case 'limit': return { tone: 'blocked', title: 'Daily limit reached', sub: fmtMin(p.usage.today) + ' used · resets at midnight', icon: 'clock' };
      case 'bonus': return { tone: 'bonus', title: s.until ? 'Bonus time' : 'Allowed', sub: s.until ? fmtUntil(s.until) : 'schedule is off until you resume', icon: 'clock' };
      case 'disabled': return { tone: 'off', title: 'Not managed', sub: 'Family Hub is leaving these devices alone', icon: 'x' };
      default: return { tone: 'open', title: 'Internet on', sub: s.until ? 'Downtime starts ' + fmtTime(s.until, dayKey(s.until) !== dayKey(state.now)) : 'No downtime scheduled', icon: 'wifi' };
    }
  }

  function fmtMin(m) {
    m = Math.max(0, Math.round(m || 0));
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  }

  function usageLine(p) {
    var u = p.usage;
    if (!u || u.today == null || (!u.limit && !u.today && u.limit !== 0)) return '';
    var pct = u.limit ? Math.min(100, Math.round(u.today / u.limit * 100)) : 0;
    var week = u.week.filter(function (d) { return d.minutes != null; });
    var avg = week.length ? Math.round(week.reduce(function (a, d) { return a + d.minutes; }, 0) / week.length) : null;
    return '<div class="usage" title="Estimated from internet activity on the home network">' +
      '<div class="usage-top"><span>Screen time today</span><strong>' + fmtMin(u.today) + (u.limit != null ? ' of ' + fmtMin(u.limit) : '') + '</strong></div>' +
      (u.limit ? '<div class="meter' + (pct >= 100 ? ' full' : pct >= 80 ? ' near' : '') + '"><span style="width:' + pct + '%"></span></div>' : '') +
      (avg != null && week.length > 1 ? '<small>7-day average ' + fmtMin(avg) + '</small>' : '') + '</div>';
  }

  function mdmTags(m) {
    if (!m) return '';
    if (m.platform === 'macos') {
      return '<span class="tag managed" title="Managed Mac · macOS ' + h(m.os) + '. Cut off by the router at home; app Downtime is iPhone/iPad only.">' + icon('apple') + 'managed Mac</span>' +
        (m.locked ? '<span class="tag blocked" title="Type this PIN on the Mac to unlock it">' + icon('lock') + 'locked · PIN ' + h(m.unlock_pin) + '</span>' : '');
    }
    var out = '<span class="tag managed" title="Managed Apple device · iOS ' + h(m.os) + (m.battery != null ? ' · battery ' + h(m.battery) + '%' : '') + '">' + icon('apple') + 'managed</span>';
    if (m.supervised === false) out += '<span class="tag warn" title="Not supervised: Downtime and Lost Mode need supervision">not supervised</span>';
    if (m.locked) out += '<span class="tag blocked">' + icon('lock') + 'locked</span>';
    else if (m.downtime) out += '<span class="tag blocked" title="Only allowed apps open">apps off</span>';
    if (m.error) out += '<span class="tag warn" title="' + h(m.error) + '">error</span>';
    return out;
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
    var v = (state.agent.version || '').split('.').map(Number);
    if (state.agent.version && (v[0] || 0) === 0 && (v[1] || 0) < 2) {
      html += '<div class="banner bad">' + icon('warn') + '<span>The home agent on the Mac mini is out of date (v' + h(state.agent.version) + '). Re-run <code>install-macos.sh</code> before using Wind down: the old agent cuts internet off immediately instead of after the countdown.</span></div>';
    }
    if (state.mdm && state.agent.online) {
      if (state.mdm.error) html += '<div class="banner bad">' + icon('warn') + '<span>Apple devices: ' + h(state.mdm.error) + '</span></div>';
      var exp = state.mdm.push_cert_expires ? Date.parse(state.mdm.push_cert_expires) / 1000 : 0;
      if (exp && exp - state.now < 30 * 86400) {
        html += '<div class="banner bad">' + icon('warn') + '<span>The Apple push certificate ' + (exp < state.now ? 'has expired' : 'expires ' + new Date(exp * 1000).toLocaleDateString()) +
          '. Renew it at identity.apple.com with the same Apple Account, or phones stop responding (see README).</span></div>';
      }
    }
    if (state.agent.gateway && state.agent.gateway.error && state.agent.online) {
      html += '<div class="banner bad">' + icon('warn') + '<span>Router: ' + h(state.agent.gateway.error) + '</span></div>';
    }
    var steps = setupItems();
    var done = steps.filter(function (x) { return x.state === 'done'; }).length;
    if (done < steps.length) {
      html += '<button class="setup-bar" data-act="setup"><span><strong>Setup ' + done + ' of ' + steps.length + '</strong> · next: ' +
        h((steps.filter(function (x) { return x.state !== 'done'; })[0] || {}).title) + '</span><span class="meter"><span style="width:' +
        Math.round(done / steps.length * 100) + '%"></span></span></button>';
    }

    if (profiles.length) {
      html += '<div class="everyone"><span>Everyone</span><div class="row">' +
        '<button class="btn warnbtn" data-act="winddown-all">' + icon('clock') + 'Wind down everyone</button>' +
        '<button class="btn ghost" data-act="pause-all">' + icon('pause') + 'Pause all now</button>' +
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
    var w = winding(p);
    if (w) {
      html += '<button class="btn ghost big" data-act="postpone" data-id="' + h(p.id) + '">+5 min</button>';
      if (w.source === 'winddown') html += '<button class="btn ghost big" data-act="clear" data-id="' + h(p.id) + '">Cancel</button>';
      else if (w.source === 'bedtime') html += '<button class="btn ghost big" data-act="bonus" data-id="' + h(p.id) + '">Bonus time</button>';
      else html += '<button class="btn ghost big" data-act="clear" data-id="' + h(p.id) + '">End now</button>';
    } else if (r === 'open') {
      html += '<button class="btn warnbtn big" data-act="winddown" data-id="' + h(p.id) + '">' + icon('clock') + 'Wind down</button>';
      html += '<button class="btn ghost" data-act="pause" data-id="' + h(p.id) + '" aria-label="Pause now">' + icon('pause') + 'Pause</button>';
    } else if (r === 'paused') {
      html += '<button class="btn primary big" data-act="clear" data-id="' + h(p.id) + '">' + icon('play') + 'Resume</button>';
      html += '<button class="btn ghost" data-act="pause" data-id="' + h(p.id) + '">Change</button>';
    } else if (r === 'downtime' || r === 'limit') {
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
          mdmTags(d.mdm) +
          '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="hint">No devices yet. <button class="link" data-act="edit" data-id="' + h(p.id) + '">Add devices</button></p>';
    }

    html += usageLine(p);

    var managed = p.devices.filter(function (d) { return d.mdm; });
    if (managed.length) {
      html += '<div class="lockrow">' + (p.lock
        ? '<span class="tag blocked">' + icon('lock') + 'Locked (Lost Mode)</span><button class="btn ghost small" data-act="unlock" data-id="' + h(p.id) + '">Unlock devices</button>'
        : '<span class="hint">' + managed.length + ' Apple device' + (managed.length === 1 ? '' : 's') + ' managed</span><button class="btn ghost small danger-text" data-act="lock" data-id="' + h(p.id) + '">' + icon('lock') + 'Lock completely</button>') + '</div>';
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

  function winddownChoices() {
    var d = +state.settings.winddown_default || 15;
    var marks = (state.settings.warn_minutes || []).join(', ');
    var smsOn = state.settings.sms_enabled && state.sms.key_set;
    var opts = [{ label: 'In ' + d + ' minutes', sub: smsOn ? 'Texts at ' + marks + ' min before' : 'Text alerts are off (Settings)', body: { mode: 'winddown', delay: d } }];
    [5, 15, 30, 60].forEach(function (m) {
      if (m !== d) opts.push({ label: 'In ' + m + ' minutes', body: { mode: 'winddown', delay: m } });
    });
    opts.push({ label: 'Right now', sub: 'No warning', body: { mode: 'winddown', delay: 0 } });
    return opts;
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

  function limitSelect(name, label, value) {
    var opts = [['', 'No limit'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours'],
      [150, '2.5 hours'], [180, '3 hours'], [240, '4 hours'], [300, '5 hours']];
    if (value != null && !opts.some(function (o) { return o[0] === value; })) opts.push([value, fmtMin(value)]);
    return '<label class="field"><span>' + h(label) + '</span><select name="' + name + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + ((value == null ? '' : value) === o[0] ? ' selected' : '') + '>' + h(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }

  function editProfile(id) {
    var p = id ? profileById(id) : null;
    var draft = {
      name: p ? p.name : '',
      color: p ? p.color : BOOT.colors[(state.profiles.length) % BOOT.colors.length],
      enabled: p ? p.enabled : true,
      phone: p ? (p.phone || '') : '',
      devices: p ? p.devices.map(function (d) { return { mac: d.mac, label: d.label }; }) : [],
      schedule: p ? JSON.parse(JSON.stringify(p.schedule)) : [],
      allowance: p && p.allowance ? p.allowance.slice() : [null, null, null, null, null, null, null]
    };
    var filter = '';

    function selected(mac) { return draft.devices.some(function (d) { return d.mac === mac; }); }

    function devicePicker() {
      var clients = (state.clients || []).slice();
      ((state.mdm && state.mdm.devices) || []).forEach(function (m) {
        if (m.enrolled && m.wifi_mac && !clients.some(function (c) { return c.mac === m.wifi_mac; })) {
          clients.push({ mac: m.wifi_mac, name: m.name || m.model, oui: 'Apple · managed', online: false });
        }
      });
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
      '<label class="field"><span>Phone for text alerts <small>(optional)</small></span><input name="phone" type="tel" inputmode="tel" autocomplete="off" value="' + h(draft.phone) + '" placeholder="(555) 123-4567"></label>' +
      '<div class="field"><span>Color</span><div class="swatches">' + BOOT.colors.map(function (c) {
        return '<button type="button" class="swatch' + (c === draft.color ? ' on' : '') + '" data-color="' + c + '" style="--kid: var(--c-' + c + ')" aria-label="' + c + '"></button>';
      }).join('') + '</div></div>' +
      '<label class="switch"><input type="checkbox" name="enabled"' + (draft.enabled ? ' checked' : '') + '><span>Managed by Family Hub</span></label>' +
      '<h4>Devices</h4><p class="hint">Pick everything this kid uses: phone, tablet, laptop, Xbox. Shared devices can go in more than one profile; they’re blocked if any of them is blocked.</p>' +
      '<input type="search" class="filter" placeholder="Search by name, maker, MAC or IP">' +
      '<div class="picker">' + devicePicker() + '</div>' +
      '<details class="manual"><summary>Add a device by MAC address</summary><div class="row"><input class="mac-in" placeholder="aa:bb:cc:dd:ee:ff"><input class="label-in" placeholder="Label (e.g. Xbox)"><button type="button" class="btn ghost" data-add-mac>Add</button></div></details>' +
      '<h4>Daily screen-time limit</h4><p class="hint">Counted while their devices are actually busy on the home network (an estimate; phones on cellular aren’t seen). When it runs out, their internet turns off until midnight, with texts at the warning marks first.</p>' +
      '<div class="two">' + limitSelect('limit_weekday', 'Mon–Fri', draft.allowance[1]) + limitSelect('limit_weekend', 'Sat & Sun', draft.allowance[0]) + '</div>' +
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
        draft.phone = form.phone.value.trim();
        var wd = form.limit_weekday.value === '' ? null : +form.limit_weekday.value;
        var we = form.limit_weekend.value === '' ? null : +form.limit_weekend.value;
        draft.allowance = [we, wd, wd, wd, wd, wd, we];
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
    var sms = state.sms;
    var parents = (s.parents || []).slice();
    while (parents.length < 2) parents.push({ name: '', phone: '' });
    var TEMPLATE_LABELS = {
      warn: 'Warning ({time}, {minutes}, {more})', final: '1-minute warning', more: '“5 more minutes” link ({link})',
      cutoff: 'Screens off', extended: 'After they add 5 min ({time})', moved: 'Cutoff moved ({time})', cancelled: 'Wind-down cancelled',
      parent_cutoff: 'To parents: offline ({names})', parent_extended: 'To parents: +5 used ({name}, {time})',
      parent_unconfirmed: 'To parents: not confirmed ({names})'
    };
    var smsSection = '<h4>Text alerts</h4>' +
      '<form class="sms-form">' +
      '<label class="switch"><input type="checkbox" name="sms_enabled"' + (s.sms_enabled ? ' checked' : '') + '><span>Send texts through Brevo</span></label>' +
      (sms.key_constant
        ? '<p class="hint">Brevo API key is set in wp-config.php.</p>'
        : '<label class="field"><span>Brevo API key</span><input name="brevo_api_key" type="password" autocomplete="off" placeholder="' + (sms.key_set ? 'Saved. Paste a new key to replace it' : 'xkeysib-…') + '"></label>') +
      '<div class="two"><label class="field"><span>Sender <small>(optional)</small></span><input name="sms_sender" maxlength="15" value="' + h(s.sms_sender) + '" placeholder="Brevo default"></label>' +
      '<label class="field"><span>Messages start with</span><input name="sms_prefix" maxlength="30" value="' + h(s.sms_prefix) + '"></label></div>' +
      '<div class="field"><span>Parents (get “offline now” and “+5 used” texts)</span>' + parents.map(function (pp, i) {
        return '<div class="two"><input name="pname' + i + '" placeholder="Name" value="' + h(pp.name) + '"><input name="pphone' + i + '" type="tel" placeholder="Phone" value="' + h(pp.phone) + '"></div>';
      }).join('') + '</div>' +
      '<div class="two"><label class="field"><span>Warn at (minutes before)</span><input name="warn_minutes" value="' + h((s.warn_minutes || []).join(', ')) + '"></label>' +
      '<label class="field"><span>Default wind-down</span><select name="winddown_default">' + [5, 10, 15, 20, 30, 45, 60].map(function (n) {
        return '<option value="' + n + '"' + (+s.winddown_default === n ? ' selected' : '') + '>' + n + ' minutes</option>';
      }).join('') + '</select></label></div>' +
      '<label class="switch"><input type="checkbox" name="winddown_bedtime"' + (s.winddown_bedtime ? ' checked' : '') + '><span>Also warn before scheduled downtime and when bonus time ends</span></label>' +
      '<label class="switch"><input type="checkbox" name="weekly_report"' + (s.weekly_report ? ' checked' : '') + '><span>Text parents a screen-time summary on Sunday evenings</span> <button type="button" class="link" data-weekly>Preview</button></label>' +
      '<details class="templates"><summary>Message wording</summary>' + Object.keys(sms.defaults).map(function (k) {
        var val = (s.templates && s.templates[k]) || sms.defaults[k];
        return '<label class="field"><span>' + h(TEMPLATE_LABELS[k] || k) + '</span><textarea name="tpl_' + h(k) + '" rows="2">' + h(val) + '</textarea></label>';
      }).join('') + '</details>' +
      '<div class="row"><button type="submit" class="btn primary">Save text settings</button></div>' +
      '<div class="row test-row"><input name="test_phone" type="tel" placeholder="Phone for a test text" value="' + h(parents[0].phone) + '"><button type="button" class="btn ghost" data-test-sms>Send test</button></div>' +
      '</form>';
    var m = state.mdm;
    var apps = s.downtime_apps || [];
    var known = APPS.map(function (a) { return a[0]; });
    var mdmSection = '<h4>Apple devices</h4><form class="mdm-form">' +
      (m ? '<dl class="kv"><dt>Status</dt><dd>' + h(m.error ? m.error : 'Working') + '</dd>' +
        '<dt>Push certificate</dt><dd>' + h(m.push_cert_expires ? 'expires ' + new Date(m.push_cert_expires).toLocaleDateString() : 'not uploaded') + '</dd>' +
        '<dt>Enrolled</dt><dd>' + h((m.devices || []).filter(function (d) { return d.enrolled; }).length) + ' devices</dd></dl>' +
        '<ul class="mdm-list">' + (m.devices || []).filter(function (d) { return d.enrolled; }).map(function (d) {
          var owner = d.wifi_mac && state.assigned[d.wifi_mac] ? profileById(state.assigned[d.wifi_mac]) : null;
          return '<li>' + icon('phone', 'muted') + '<span class="dname">' + h(d.name || d.model || d.serial) + ' <small>iOS ' + h(d.os) + '</small></span>' +
            (d.supervised === false ? '<span class="tag warn">not supervised</span>' : '') +
            (owner ? '<span class="tag">' + h(owner.name) + '</span>' : '<span class="tag warn" title="Pick it in a kid’s profile (shows as Apple · managed)">unassigned</span>') + '</li>';
        }).join('') + '</ul>'
        : '<p class="hint">Not set up yet. See “Apple devices” in the README: the Mac mini runs the management server, then each phone is supervised with Apple Configurator.</p>') +
      '<div class="field"><span>Apps that still open during downtime</span><div class="appgrid">' + APPS.map(function (a) {
        return '<label class="chk"><input type="checkbox" name="app" value="' + a[0] + '"' + (apps.indexOf(a[0]) !== -1 ? ' checked' : '') + '>' + h(a[1]) + '</label>';
      }).join('') + '</div></div>' +
      '<label class="field"><span>Other apps <small>(App Store bundle IDs, comma-separated)</small></span><input name="other_apps" value="' + h(apps.filter(function (a) { return known.indexOf(a) === -1; }).join(', ')) + '" placeholder="com.duolingo.DuolingoMobile"></label>' +
      '<label class="field"><span>Lock-screen message for “Lock completely”</span><input name="lock_message" maxlength="160" value="' + h(s.lock_message) + '"></label>' +
      '<p class="hint">The lock screen also shows ' + h((s.parents && s.parents[0] && s.parents[0].phone) || 'the first parent’s phone number') + ' so they can call you.</p>' +
      '<div class="row"><button type="submit" class="btn primary">Save Apple device settings</button></div></form>';
    var inner = '<div class="sheet-head"><h3>Settings</h3><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="sheet-body">' +
      smsSection + mdmSection +
      '<h4>Home agent</h4><dl class="kv">' + rows.map(function (r) { return '<dt>' + h(r[0]) + '</dt><dd>' + h(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="token-box"><p class="hint">The agent on the Mac mini signs in with a token. ' + (a.configured ? 'Generating a new one disconnects the agent until you update its config.' : '') + '</p>' +
      '<button class="btn ' + (a.configured ? 'ghost' : 'primary') + '" data-token>' + (a.configured ? 'Generate new token' : 'Generate agent token') + '</button><div class="token-out"></div></div>' +
      '<h4>How to block</h4>' +
      '<label class="radio"><input type="radio" name="enf" value="client_block"' + (s.enforcement === 'client_block' ? ' checked' : '') + '><span><strong>Block devices</strong><small>Kicks devices off Wi-Fi and stops them rejoining. Works on every UniFi version. Wi-Fi only.</small></span></label>' +
      '<label class="radio"><input type="radio" name="enf" value="traffic_rule"' + (s.enforcement === 'traffic_rule' ? ' checked' : '') + '><span><strong>Traffic rules</strong><small>Cuts internet access but stays on the local network. Also works for wired devices like a cabled Xbox. Needs Network 7.0+ (run <code>probe</code> to check).</small></span></label>' +
      '<label class="field"><span>Count a minute as screen time when a device moves more than</span><select name="usage_kb">' + [100, 250, 500, 1000].map(function (n) {
        return '<option value="' + n + '"' + (+s.usage_threshold_kb === n ? ' selected' : '') + '>' + (n >= 1000 ? n / 1000 + ' MB' : n + ' KB') + (n === 250 ? ' (default)' : '') + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field"><span>Agent check-in interval</span><select name="poll">' + [5, 10, 15, 30, 60].map(function (n) {
        return '<option value="' + n + '"' + (+s.poll_interval === n ? ' selected' : '') + '>Every ' + n + ' seconds</option>';
      }).join('') + '</select></label>' +
      '<p class="hint">Signed in as ' + h(BOOT.user) + '. <a href="' + h(BOOT.logout) + '">Sign out</a></p>' +
      '</div>';
    openDialog(inner, '', function (dlg) {
      var form = dlg.querySelector('.sms-form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var body = {
          sms_enabled: form.sms_enabled.checked,
          sms_sender: form.sms_sender.value.trim(),
          sms_prefix: form.sms_prefix.value.trim(),
          winddown_default: +form.winddown_default.value,
          winddown_bedtime: form.winddown_bedtime.checked,
          weekly_report: form.weekly_report.checked,
          warn_minutes: form.warn_minutes.value.split(/[^0-9]+/).filter(Boolean).map(Number),
          parents: parents.map(function (_, i) { return { name: form['pname' + i].value.trim(), phone: form['pphone' + i].value.trim() }; }),
          templates: {}
        };
        Object.keys(sms.defaults).forEach(function (k) { body.templates[k] = form['tpl_' + k].value.trim(); });
        if (form.brevo_api_key && form.brevo_api_key.value.trim()) body.brevo_api_key = form.brevo_api_key.value.trim();
        mutate('POST', 'settings', body, 'Text settings saved').then(function () {
          if (form.brevo_api_key) { form.brevo_api_key.value = ''; form.brevo_api_key.placeholder = 'Saved. Paste a new key to replace it'; }
        }, function () {});
      });
      var mform = dlg.querySelector('.mdm-form');
      mform.addEventListener('submit', function (e) {
        e.preventDefault();
        var list = [].slice.call(mform.querySelectorAll('input[name=app]:checked')).map(function (i) { return i.value; });
        mform.other_apps.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x) { list.push(x); });
        mutate('POST', 'settings', { downtime_apps: list, lock_message: mform.lock_message.value.trim() }, 'Apple device settings saved');
      });
      dlg.querySelector('[data-weekly]').addEventListener('click', function (e) {
        e.preventDefault();
        api('GET', 'report/weekly').then(function (res) { window.alert(res.text); }).catch(function (err) { toast(err.message, true); });
      });
      dlg.querySelector('[data-test-sms]').addEventListener('click', function () {
        api('POST', 'sms/test', { phone: form.test_phone.value }).then(function () {
          toast('Test text sent');
        }).catch(function (err) { toast(err.message, true); });
      });
      dlg.querySelectorAll('input[name=enf]').forEach(function (r) {
        r.addEventListener('change', function () { mutate('POST', 'settings', { enforcement: r.value }, 'Saved'); });
      });
      dlg.querySelector('select[name=usage_kb]').addEventListener('change', function (e) {
        mutate('POST', 'settings', { usage_threshold_kb: +e.target.value }, 'Saved');
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

  // -- setup checklist

  function setupItems() {
    var a = state.agent, s = state.settings, sms = state.sms, m = state.mdm, profiles = state.profiles || [];
    var kidsWithDevices = profiles.filter(function (p) { return p.devices.length; });
    var privateMacs = [];
    profiles.forEach(function (p) { p.devices.forEach(function (d) { if (d.client && d.client.randomized) privateMacs.push(deviceName(d)); }); });
    var parents = (s.parents || []).filter(function (x) { return x.phone; });
    var enrolled = m ? (m.devices || []).filter(function (d) { return d.enrolled; }) : [];
    var unsupervised = enrolled.filter(function (d) { return d.supervised === false; });
    var unassigned = enrolled.filter(function (d) { return !d.wifi_mac || !state.assigned[d.wifi_mac]; });
    var certLeft = m && m.push_cert_expires ? Date.parse(m.push_cert_expires) / 1000 - state.now : null;
    function item(group, title, ok, how, where, warn) {
      return { group: group, title: title, state: ok ? 'done' : warn ? 'warn' : 'todo', how: how, where: where };
    }
    return [
      item('Home network', 'Generate the agent token', a.configured, 'Settings → Generate agent token. Copy the snippet into the Mac mini’s agent.json.', 'phone'),
      item('Home network', 'Home agent running on the Mac mini', a.online, 'Run install-macos.sh on the Mac mini (README step 3).', 'mac'),
      item('Home network', 'Router connected', a.online && a.gateway && a.gateway.ok, 'Create the local “familyhub” admin in the UniFi app (Admins), put it in agent.json, run probe.', 'phone + mac'),
      item('Home network', 'Kids and their devices added', kidsWithDevices.length > 0, 'Add a kid, tick their devices.', 'phone'),
      item('Home network', 'No private Wi-Fi addresses', kidsWithDevices.length > 0 && !privateMacs.length,
        privateMacs.length ? 'Turn off Private Wi-Fi Address for home Wi-Fi on: ' + privateMacs.join(', ') + '. Supervised devices get this forced.' : 'Checked once devices are added.', 'kid’s device', privateMacs.length > 0),
      item('Text alerts', 'Brevo connected and texts on', s.sms_enabled && sms.key_set, 'Settings → Text alerts: paste the Brevo API key, tick “Send texts”, Send test.', 'phone'),
      item('Text alerts', 'Both parents’ phones added', parents.length >= 2, 'Settings → Text alerts → Parents.', 'phone', parents.length === 1),
      item('Text alerts', 'Kids’ phone numbers', profiles.length > 0 && profiles.every(function (p) { return p.phone; }), 'Edit each kid → Phone for text alerts (kids without a phone just get no texts).', 'phone', profiles.some(function (p) { return p.phone; })),
      item('Apple devices', 'Management server installed', !!m, 'Pick the tunnel address, then run install-mdm-macos.sh on the Mac mini (README 7a–7b).', 'mac'),
      item('Apple devices', 'Apple push certificate', certLeft != null && certLeft > 30 * 86400,
        certLeft == null ? 'mdmcert.download (register now from your phone), then identity.apple.com (README 7c).' : 'Renew at identity.apple.com with the same Apple Account (README 7c).', 'phone + mac', certLeft != null),
      item('Apple devices', 'Kids’ iPhones/iPads supervised', enrolled.length > 0 && !unsupervised.length,
        unsupervised.length ? unsupervised.length + ' enrolled device(s) not supervised: redo with Apple Configurator (README 7e).' : 'Back up, supervise with Apple Configurator, restore, enroll (README 7e).', 'mac', unsupervised.length > 0),
      item('Apple devices', 'Managed devices assigned to kids', enrolled.length > 0 && !unassigned.length, 'Edit the kid and tick the device (shown as “Apple · managed”).', 'phone', unassigned.length > 0)
    ];
  }

  function openSetup() {
    var steps = setupItems();
    var groups = [];
    steps.forEach(function (x) { if (groups.indexOf(x.group) === -1) groups.push(x.group); });
    var inner = '<div class="sheet-head"><h3>Setup checklist</h3><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="sheet-body">' +
      groups.map(function (g) {
        return '<h4>' + h(g) + '</h4><ul class="checklist">' + steps.filter(function (x) { return x.group === g; }).map(function (x) {
          return '<li class="st-' + x.state + '"><span class="mark" aria-hidden="true">' + (x.state === 'done' ? '✓' : x.state === 'warn' ? '!' : '') + '</span>' +
            '<div><strong>' + h(x.title) + '</strong>' + (x.state !== 'done' ? '<small>' + h(x.how) + '</small><span class="where">' + h(x.where) + '</span>' : '') + '</div></li>';
        }).join('') + '</ul>';
      }).join('') + '<p class="hint">Full steps are in the README (family-hub/README.md).</p></div>';
    openDialog(inner);
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
      case 'setup': openSetup(); break;
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
      case 'winddown':
        choiceSheet('Wind down ' + p.name, winddownChoices(), function (body) {
          mutate('POST', 'profiles/' + id + '/override', body, body.delay ? 'Wind-down started' : p.name + ' paused');
        });
        break;
      case 'winddown-all':
        choiceSheet('Wind down everyone', winddownChoices(), function (body) {
          mutate('POST', 'override-all', body, body.delay ? 'Wind-down started for everyone' : 'Everyone paused');
        });
        break;
      case 'postpone':
        mutate('POST', 'profiles/' + id + '/override', { mode: 'postpone', minutes: 5 }, '+5 minutes for ' + p.name);
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
      case 'lock':
        if (!window.confirm('Lock ' + p.name + '’s Apple devices completely?\n\niPhones/iPads show your message and phone number and can’t be used until you tap Unlock (Lost Mode).\n\nMacs lock until someone types the 6-digit PIN shown on the dashboard at the Mac itself. Unlocking a Mac can’t be done remotely.')) break;
        mutate('POST', 'profiles/' + id + '/lock', { locked: true }, p.name + '’s devices are locking');
        break;
      case 'unlock':
        mutate('POST', 'profiles/' + id + '/lock', { locked: false }, p.name + '’s devices are unlocking');
        break;
      case 'resume-all':
        mutate('POST', 'override-all', { mode: 'clear' }, 'Everyone is back on schedule');
        break;
    }
  });

  load().then(schedulePoll);
})();
