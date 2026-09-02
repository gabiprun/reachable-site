/* ============================================================
   Reachable — shared behaviour for every page.

   The site works without this file: every page is readable, the menu
   is fully visible, and the forms are plain HTML that open the
   visitor's email app. This file adds:

   1. "Larger text" toggle, remembered in localStorage.
   2. Collapsible menu on narrow screens.
   3. Phone numbers, email and portal link filled in from site-config.js.
   4. Form submit helper: POST JSON to apiBase + /api/intake/<program>
      when apiBase is set; otherwise build a mailto: link with the
      answers in the body. Honeypot field named "website" is silently
      dropped. Success and error messages are announced via aria-live.
      Field names match reachable/reachable/intake.py. A lone checkbox
      is sent as true/false, a textarea with data-list as an array,
      and a form with data-require-one="phone email" needs one of them.

   Loaded in <head> on purpose (no defer) so the larger-text class is
   applied before the page paints. Keep it small.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var cfg = window.REACHABLE || {};
  var TEXT_KEY = 'reachable.textSize';

  root.classList.add('js');

  /* ---------- 1. Larger text: apply saved choice before paint ---------- */
  function readTextSize() {
    try { return localStorage.getItem(TEXT_KEY); } catch (e) { return null; }
  }
  function saveTextSize(value) {
    try { localStorage.setItem(TEXT_KEY, value); } catch (e) { /* private mode etc. */ }
  }
  if (readTextSize() === 'larger') { root.classList.add('text-larger'); }

  /* ---------- helpers ---------- */
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function telHref(display) {
    var d = digits(display);
    if (d.length === 10) { d = '1' + d; }
    return d ? 'tel:+' + d : '';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function onReady(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  /* ---------- 2. Numbers, email, portal link from site-config.js ---------- */
  function renderNumbers() {
    var nums = cfg.numbers || {};
    var live = !!cfg.numbersReady;

    qsa('[data-number]').forEach(function (el) {
      var key = el.getAttribute('data-number');
      var value = nums[key];
      var row = el.closest('[data-number-row]');
      if (!value) {
        if (row) { row.hidden = true; }
        return;
      }
      if (row) { row.hidden = false; }
      if (live) {
        var href = telHref(value);
        if (el.tagName === 'A') {
          el.href = href;
          el.textContent = value;
        } else {
          el.textContent = '';
          var a = document.createElement('a');
          a.href = href;
          a.className = 'tel-link';
          a.textContent = value;
          el.appendChild(a);
        }
      } else {
        el.textContent = value;
        if (el.tagName === 'A') { el.removeAttribute('href'); }
      }
    });

    // "number coming soon" notes and "until the numbers are live" text.
    qsa('[data-number-status]').forEach(function (el) { el.hidden = live; });
    qsa('[data-not-ready]').forEach(function (el) { el.hidden = live; });
    qsa('[data-when-ready]').forEach(function (el) { el.hidden = !live; });

    if (cfg.email) {
      qsa('[data-email]').forEach(function (el) {
        el.textContent = cfg.email;
        if (el.tagName === 'A') { el.href = 'mailto:' + cfg.email; }
      });
    }

    // Reachable Number web portal: link only when a backend exists.
    qsa('[data-portal]').forEach(function (el) {
      if (cfg.apiBase) {
        var base = String(cfg.apiBase).replace(/\/+$/, '');
        el.innerHTML = '<a href="' + escapeHtml(base) + '/portal">Open the Reachable Number web portal</a>';
      }
    });
  }

  /* ---------- 3. Text-size toggle and menu toggle ---------- */
  function wireToggles() {
    qsa('[data-text-toggle]').forEach(function (btn) {
      var isLarger = root.classList.contains('text-larger');
      btn.setAttribute('aria-pressed', isLarger ? 'true' : 'false');
      btn.addEventListener('click', function () {
        var now = root.classList.toggle('text-larger');
        btn.setAttribute('aria-pressed', now ? 'true' : 'false');
        saveTextSize(now ? 'larger' : 'normal');
      });
    });

    qsa('[data-nav-toggle]').forEach(function (btn) {
      var header = btn.closest('.site-header');
      btn.addEventListener('click', function () {
        var open = header.classList.toggle('nav-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Close menu' : 'Menu';
      });
    });
  }

  /* ---------- 4. Intake forms ---------- */

  // Text of the label that belongs to a field, without the grey hint.
  function labelText(el) {
    var lab = el.labels && el.labels[0];
    var text;
    if (lab) {
      var clone = lab.cloneNode(true);
      qsa('.hint, abbr', clone).forEach(function (n) { n.parentNode.removeChild(n); });
      text = clone.textContent;
    } else {
      text = el.getAttribute('aria-label') || el.name;
    }
    return text.replace(/\s+/g, ' ').replace(/\(optional\)/i, '').replace(/[:*]\s*$/, '').trim();
  }
  function groupText(el) {
    var fs = el.closest('fieldset');
    var lg = fs && fs.querySelector('legend');
    if (!lg) { return el.name; }
    var clone = lg.cloneNode(true);
    qsa('.hint, abbr', clone).forEach(function (n) { n.parentNode.removeChild(n); });
    return clone.textContent.replace(/\s+/g, ' ').replace(/[:*]\s*$/, '').trim();
  }

  // Returns { data: {name: value|[values]}, lines: ["Label: value", ...] }
  function collect(form) {
    var data = {};
    var lines = [];
    var groups = {};   // name -> {label, values[]}
    var order = [];
    qsa('input, select, textarea', form).forEach(function (el) {
      if (!el.name || el.disabled) { return; }
      var type = (el.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'reset') { return; }
      if (el.name === 'website') { data.website = el.value; return; } // honeypot
      if (type === 'checkbox' || type === 'radio') {
        if (!groups[el.name]) {
          groups[el.name] = { label: groupText(el), values: [], labels: [], multi: type === 'checkbox', count: 0 };
          order.push(el.name);
        }
        groups[el.name].count += 1;
        if (el.checked) {
          groups[el.name].values.push(el.value);
          groups[el.name].labels.push(labelText(el));
        }
        return;
      }
      var value = String(el.value || '').trim();
      if (type === 'hidden') { data[el.name] = value; return; }
      // data-list: one item per line (or comma) becomes an array, e.g. benefits "programs".
      if (el.hasAttribute('data-list')) {
        var items = value.split(/[\n,]/).map(function (x) { return x.trim(); }).filter(Boolean);
        data[el.name] = items;
        if (items.length) { lines.push(labelText(el) + ': ' + items.join(', ')); }
        return;
      }
      data[el.name] = value;
      if (value) { lines.push(labelText(el) + ': ' + value); }
    });
    order.forEach(function (name) {
      var g = groups[name];
      if (g.multi && g.count === 1) {
        // A lone checkbox is a yes/no question: send true/false, not a list.
        data[name] = g.values.length > 0;
        if (g.values.length) { lines.push(g.label + ': yes (' + g.labels[0] + ')'); }
        return;
      }
      data[name] = g.multi ? g.values : (g.values[0] || '');
      if (g.labels.length) { lines.push(g.label + ': ' + g.labels.join(', ')); }
    });
    return { data: data, lines: lines };
  }

  function announce(status, kind, html) {
    if (!status) { return; }
    status.className = 'form-status ' + kind;
    status.innerHTML = html;
    status.setAttribute('tabindex', '-1');
    status.focus();
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(form, status) {
    var bad = [];
    function flag(el, ok) {
      el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) { bad.push(el); }
    }
    qsa('[required]', form).forEach(function (el) {
      var ok = true;
      if (el.type === 'checkbox' || el.type === 'radio') {
        ok = qsa('[name="' + el.name + '"]', form).some(function (x) { return x.checked; });
      } else {
        ok = String(el.value || '').trim() !== '';
        if (ok && el.type === 'email') { ok = EMAIL_RE.test(el.value.trim()); }
      }
      flag(el, ok);
    });
    // An optional email that is filled in must still look like an email.
    qsa('input[type="email"]:not([required])', form).forEach(function (el) {
      var v = String(el.value || '').trim();
      flag(el, !v || EMAIL_RE.test(v));
    });
    if (bad.length) {
      var names = [];
      bad.forEach(function (el) {
        var t = (el.type === 'checkbox' || el.type === 'radio') ? groupText(el) : labelText(el);
        if (names.indexOf(t) === -1) { names.push(t); }
      });
      announce(status, 'err', '<p>Please check: <strong>' + escapeHtml(names.join(', ')) + '</strong>.</p>');
      bad[0].focus();
      return false;
    }
    // data-require-one="phone email": at least one of these must be filled in.
    var oneOf = form.getAttribute('data-require-one');
    if (oneOf) {
      var fields = oneOf.split(/\s+/).map(function (n) { return form.querySelector('[name="' + n + '"]'); }).filter(Boolean);
      var any = fields.some(function (el) { return String(el.value || '').trim() !== ''; });
      if (fields.length && !any) {
        fields.forEach(function (el) { el.setAttribute('aria-invalid', 'true'); });
        announce(status, 'err', '<p>Please give us at least one of these so we can reach you: <strong>' + escapeHtml(fields.map(labelText).join(' or ')) + '</strong>.</p>');
        fields[0].focus();
        return false;
      }
      fields.forEach(function (el) { el.setAttribute('aria-invalid', 'false'); });
    }
    return true;
  }

  function mailtoFor(form, subject, lines) {
    var to = cfg.email || '';
    var body = lines.join('\n') + '\n\nSent from ' + location.href;
    return 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function wireForm(form) {
    var program = form.getAttribute('data-intake');
    var subject = form.getAttribute('data-subject') || ('Reachable: ' + program + ' request');
    var status = form.querySelector('[data-status]');
    var submit = form.querySelector('[type="submit"]');
    form.setAttribute('novalidate', 'novalidate');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!validate(form, status)) { return; }

      var got = collect(form);
      var emailLink = '<a data-email href="mailto:' + escapeHtml(cfg.email || '') + '">' + escapeHtml(cfg.email || 'our email') + '</a>';

      // Bots fill the hidden "website" field. People never see it.
      if (got.data.website) {
        announce(status, 'ok', '<p>Thank you.</p>');
        form.reset();
        return;
      }

      if (cfg.apiBase) {
        var url = String(cfg.apiBase).replace(/\/+$/, '') + '/api/intake/' + encodeURIComponent(program);
        var payload = got.data;
        payload.page = location.pathname;
        payload.source = 'website';
        if (submit) { submit.disabled = true; }
        announce(status, 'ok', '<p>Sending…</p>');
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) {
          if (!r.ok) {
            // The backend answers 422/429 with a plain-language "detail" we can show as-is.
            return r.text().then(function (t) {
              var detail = '';
              try { detail = JSON.parse(t).detail; } catch (e) { /* not JSON */ }
              var err = new Error('HTTP ' + r.status);
              err.detail = (r.status === 422 || r.status === 429) && typeof detail === 'string' ? detail : '';
              throw err;
            });
          }
          return r.text();
        }).then(function () {
          form.reset();
          announce(status, 'ok', '<p><strong>Thank you. We got your message.</strong></p><p>A person will get back to you. If you do not hear from us within a few days, please email ' + emailLink + '.</p>');
        }).catch(function (err) {
          if (err && err.detail) {
            announce(status, 'err', '<p><strong>' + escapeHtml(err.detail) + '</strong></p>');
            return;
          }
          var link = mailtoFor(form, subject, got.lines);
          announce(status, 'err', '<p><strong>Sorry, we could not send this.</strong></p><p>Nothing is lost. You can <a href="' + escapeHtml(link) + '">send it by email instead</a>, or copy the text below and email it to ' + emailLink + '.</p>' +
            '<div class="form-copy"><label for="copy-' + program + '">Your message, ready to copy</label><textarea id="copy-' + program + '" readonly>' + escapeHtml(got.lines.join('\n')) + '</textarea></div>');
        }).then(function () {
          if (submit) { submit.disabled = false; }
        });
        return;
      }

      // No backend yet: hand the answers to the visitor's email app.
      var mail = mailtoFor(form, subject, got.lines);
      announce(status, 'ok', '<p><strong>We opened your email app with your answers filled in.</strong> Press <strong>Send</strong> there and you are done.</p>' +
        '<p>If nothing opened, copy the text below and email it to ' + emailLink + '. Or <a href="' + escapeHtml(mail) + '">try opening your email app again</a>.</p>' +
        '<div class="form-copy"><label for="copy-' + program + '">Your message, ready to copy</label><textarea id="copy-' + program + '" readonly>' + escapeHtml(got.lines.join('\n')) + '</textarea></div>');
      window.location.href = mail;
    });
  }

  onReady(function () {
    renderNumbers();
    wireToggles();
    qsa('form[data-intake]').forEach(wireForm);
  });

  // Small public surface for other scripts (benefits.js).
  window.Reachable = {
    config: cfg,
    telHref: telHref,
    digits: digits,
    escapeHtml: escapeHtml,
    numbersReady: function () { return !!cfg.numbersReady; }
  };
})();
