/* ============================================================
   Reachable Benefits — the benefits finder (client-side screener).

   Reads ./benefits.json (DESIGN.md §8b) and renders:
     1. the questions as big radio buttons / checkboxes,
     2. a results list with big "Call" buttons,
     3. a "Help me apply" hand-off that fills the intake form below.

   Everything runs in the visitor's browser. Answers are never sent
   anywhere. If JavaScript is off, or benefits.json cannot be loaded,
   the page shows the "call us" fallback instead.

   Rule evaluation (must match the backend exactly):
     A rule matches when, for every question id in `when`, the
     person's answer (or one of their answers, for multi-select) is
     in that list. Every program from every matching rule is
     suggested, de-duplicated, ordered by number of matching rules
     (most first) then by name. A program with `requires` shows
     "First you need: <name>" for each required program the person
     does not already hold (question id has_<key> answered "yes").
   ============================================================ */
(function () {
  'use strict';

  var app = document.getElementById('screener-app');
  if (!app) { return; }

  var R = window.Reachable || {};
  var esc = R.escapeHtml || function (s) { return String(s); };
  var telHref = R.telHref || function (s) { return 'tel:' + String(s).replace(/[^\d+]/g, ''); };

  var WORDS = {
    jurisdiction: { 'federal': 'Government of Canada', 'bc': 'BC government', 'municipal-victoria': 'City of Victoria' },
    type: { 'tax-credit': 'Tax credit', 'monthly-payment': 'Monthly payment', 'one-time': 'One-time payment', 'service': 'Service', 'discount': 'Discount', 'housing': 'Housing', 'transport': 'Getting around', 'health': 'Health' },
    confidence: {
      high: 'We checked this carefully.',
      medium: 'Mostly right. Please confirm the details by phone.',
      low: 'This may have changed. Check the current amount before you count on it.'
    }
  };

  function fallback(reason) {
    app.innerHTML =
      '<div class="notice" role="status">' +
      '<h3>The benefits finder could not load</h3>' +
      '<p>' + esc(reason) + '</p>' +
      '<p>You do not need it to get help. Use the <a href="#apply">Help me apply</a> form below, or call us using the number at the bottom of this page.</p>' +
      '</div>';
  }

  function load() {
    if (!window.fetch) { fallback('Your browser is too old for this part of the page.'); return; }
    fetch('benefits.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
      .then(function (data) {
        if (!data || !data.programs || !data.screener || !data.screener.questions) { throw new Error('bad file'); }
        build(data);
      })
      .catch(function () { fallback('The list of programs did not download.'); });
  }

  function build(data) {
    var byKey = {};
    data.programs.forEach(function (p) { byKey[p.key] = p; });

    var html = '<form class="screener" id="screener-form">' +
      '<p>Answer what you can. Skip anything you are not sure about. <strong>Your answers stay on this page. We do not send them anywhere.</strong></p>';

    data.screener.questions.forEach(function (q) {
      var multi = q.type === 'multi';
      html += '<fieldset><legend>' + esc(q.text) + (multi ? ' <span class="hint">Choose all that apply.</span>' : '') + '</legend>';
      (q.options || []).forEach(function (o) {
        var id = 'q-' + q.id + '-' + o.value;
        html += '<label class="choice" for="' + esc(id) + '">' +
          '<input type="' + (multi ? 'checkbox' : 'radio') + '" id="' + esc(id) + '" name="' + esc(q.id) + '" value="' + esc(o.value) + '">' +
          '<span>' + esc(o.label) + '</span></label>';
      });
      html += '</fieldset>';
    });

    html += '<div class="actions">' +
      '<button type="submit" class="btn btn-call">Show what I may qualify for</button>' +
      '<button type="reset" class="btn btn-secondary">Start over</button>' +
      '</div></form>' +
      '<section class="results" id="results" aria-live="polite" tabindex="-1"></section>';

    app.innerHTML = html;

    var form = document.getElementById('screener-form');
    var results = document.getElementById('results');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var answers = readAnswers(form, data.screener.questions);
      if (!Object.keys(answers).length) {
        results.innerHTML = '<div class="notice"><p>Please answer at least one question, then press the button again.</p></div>';
        results.focus();
        return;
      }
      render(evaluate(answers, data, byKey), answers, data, byKey);
    });
    form.addEventListener('reset', function () {
      results.innerHTML = '';
      setTimeout(function () { form.querySelector('input') && form.querySelector('input').focus(); }, 0);
    });
  }

  function readAnswers(form, questions) {
    var answers = {};
    questions.forEach(function (q) {
      var chosen = Array.prototype.slice.call(form.querySelectorAll('[name="' + q.id + '"]:checked')).map(function (i) { return i.value; });
      if (!chosen.length) { return; }
      answers[q.id] = q.type === 'multi' ? chosen : chosen[0];
    });
    return answers;
  }

  function evaluate(answers, data, byKey) {
    var hits = {};   // key -> {count, whys[]}
    (data.screener.rules || []).forEach(function (rule) {
      var when = rule.when || {};
      var ok = Object.keys(when).every(function (qid) {
        var mine = answers[qid];
        if (mine === undefined) { return false; }
        var list = when[qid] || [];
        var arr = Array.isArray(mine) ? mine : [mine];
        return arr.some(function (v) { return list.indexOf(v) !== -1; });
      });
      if (!ok) { return; }
      (rule.programs || []).forEach(function (p) {
        if (!hits[p.key]) { hits[p.key] = { count: 0, whys: [] }; }
        hits[p.key].count += 1;
        if (p.why && hits[p.key].whys.indexOf(p.why) === -1) { hits[p.key].whys.push(p.why); }
      });
    });
    var keys = Object.keys(hits);
    keys.sort(function (a, b) {
      if (hits[b].count !== hits[a].count) { return hits[b].count - hits[a].count; }
      var na = (byKey[a] && byKey[a].name) || a;
      var nb = (byKey[b] && byKey[b].name) || b;
      return na.localeCompare(nb);
    });
    return keys.map(function (k) { return { key: k, program: byKey[k], whys: hits[k].whys, count: hits[k].count }; });
  }

  // Programs the person says they already hold: has_<key> = "yes".
  function heldKeys(answers) {
    var held = {};
    Object.keys(answers).forEach(function (qid) {
      if (qid.indexOf('has_') === 0 && answers[qid] === 'yes') { held[qid.slice(4)] = true; }
    });
    return held;
  }

  function nameOf(key, byKey) { return (byKey[key] && byKey[key].name) || key; }

  function paragraphs(text) {
    return String(text || '').split(/\n+/).filter(function (s) { return s.trim(); })
      .map(function (s) { return '<p>' + esc(s.trim()) + '</p>'; }).join('');
  }

  function render(list, answers, data, byKey) {
    var results = document.getElementById('results');
    var held = heldKeys(answers);
    var checked = data.generated ? ' We last checked this information on ' + esc(data.generated) + '.' : '';

    if (!list.length) {
      results.innerHTML = '<h2>Your results</h2>' +
        '<div class="notice"><p><strong>We did not find a match from your answers.</strong> That does not mean there is nothing for you. Rules have exceptions, and we only list a few programs here.</p>' +
        '<p>Call us, or use the <a href="#apply">Help me apply</a> form below, and a person will look with you.</p></div>';
      results.focus();
      return;
    }

    var html = '<h2>Your results</h2>' +
      '<p>From your answers, you may qualify for <strong>' + list.length + '</strong> ' + (list.length === 1 ? 'program' : 'programs') + '. Only the government can decide for sure.' + checked + '</p>';

    var names = [];
    list.forEach(function (item) {
      var p = item.program;
      if (!p) { return; }
      names.push(p.name);
      var missing = (p.requires || []).filter(function (k) { return !held[k]; });
      html += '<article class="result" id="program-' + esc(p.key) + '">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="tags">' +
        (WORDS.jurisdiction[p.jurisdiction] ? '<span class="tag">' + esc(WORDS.jurisdiction[p.jurisdiction]) + '</span>' : '') +
        (WORDS.type[p.type] ? '<span class="tag">' + esc(WORDS.type[p.type]) + '</span>' : '') +
        '</p>';
      if (item.whys.length) { html += '<p><strong>Why we think so:</strong> ' + esc(item.whys.join(' ')) + '</p>'; }
      if (missing.length) {
        html += '<p class="result-first">First you need: ' + missing.map(function (k) { return esc(nameOf(k, byKey)); }).join(', ') + '.</p>';
      }
      if (p.amount) { html += '<p><strong>How much:</strong> ' + esc(p.amount) + '</p>'; }
      if (p.eligibility_summary) { html += '<p><strong>Who qualifies:</strong> ' + esc(p.eligibility_summary) + '</p>'; }
      if (p.how_to_apply) { html += '<h4>How to apply</h4>' + paragraphs(p.how_to_apply); }
      if (p.help_in_victoria) { html += '<p><strong>Help in Victoria:</strong> ' + esc(p.help_in_victoria) + '</p>'; }
      if (p.gateway_for && p.gateway_for.length) {
        html += '<p><strong>Having this can unlock:</strong> ' + p.gateway_for.map(function (k) { return esc(nameOf(k, byKey)); }).join(', ') + '.</p>';
      }
      if (p.confidence && WORDS.confidence[p.confidence]) { html += '<p class="small soft">' + esc(WORDS.confidence[p.confidence]) + '</p>'; }
      html += '<div class="actions">';
      if (p.phone) { html += '<a class="btn btn-call" href="' + esc(telHref(p.phone)) + '">Call ' + esc(p.phone) + '</a>'; }
      if (p.url) { html += '<a class="btn btn-secondary" href="' + esc(p.url) + '">Official website</a>'; }
      html += '</div></article>';
    });

    html += '<div class="btn-row"><button type="button" class="btn" id="apply-fill">Help me apply for these</button></div>' +
      '<p>Not sure? Nothing fits? Call us using the number at the bottom of this page and a person will look with you.</p>';

    results.innerHTML = html;
    results.focus();

    var fill = document.getElementById('apply-fill');
    if (fill) {
      fill.addEventListener('click', function () {
        var field = document.getElementById('apply-programs');
        var section = document.getElementById('apply');
        if (field) { field.value = names.join(', '); }
        if (section) { section.scrollIntoView(); }
        var first = document.getElementById('apply-name');
        if (first) { first.focus(); }
      });
    }
  }

  load();
})();
