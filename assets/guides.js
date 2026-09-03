/* ============================================================
   Reachable — the Guides index: search box and topic filter.

   Progressive enhancement, on purpose. Every guide is already in the
   page as plain HTML, so with JavaScript turned off the visitor sees
   the complete list and can read every guide. This file only hides
   and shows cards that are already there.

   Nothing here changes the page until the visitor types or presses a
   topic button, and the result is announced to screen readers through
   an aria-live count.
   ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  ready(function () {
    var list = document.querySelector('[data-guide-list]');
    if (!list) { return; }

    var cards = Array.prototype.slice.call(list.querySelectorAll('li[data-topics]'));
    var search = document.querySelector('[data-guide-search]');
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-topic]'));
    var count = document.querySelector('[data-filter-count]');
    var empty = document.querySelector('[data-guide-empty]');
    var clear = document.querySelector('[data-guide-clear]');

    // The controls are useless without JavaScript, so they are hidden in
    // the HTML and revealed here.
    var controls = document.querySelector('[data-guide-controls]');
    if (controls) { controls.hidden = false; }

    var topic = '';       // '' means "all topics"
    var query = '';

    function matches(card) {
      if (topic && (' ' + card.getAttribute('data-topics') + ' ').indexOf(' ' + topic + ' ') === -1) {
        return false;
      }
      if (!query) { return true; }
      // Title, summary and topic labels, plus the guide's own section
      // headings, which the builder copies onto the card as keywords so a
      // search for a word used inside a guide still finds it.
      var haystack = (card.textContent + ' ' + (card.getAttribute('data-keywords') || '')).toLowerCase();
      return haystack.indexOf(query) !== -1;
    }

    function apply() {
      var shown = 0;
      cards.forEach(function (card) {
        var ok = matches(card);
        card.hidden = !ok;
        if (ok) { shown += 1; }
      });

      if (count) {
        if (!topic && !query) {
          count.textContent = 'Showing all ' + cards.length + ' guides.';
        } else if (shown === 1) {
          count.textContent = 'Showing 1 guide of ' + cards.length + '.';
        } else {
          count.textContent = 'Showing ' + shown + ' guides of ' + cards.length + '.';
        }
      }
      if (empty) { empty.hidden = shown !== 0; }
      if (clear) { clear.hidden = !topic && !query; }
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-topic');
        topic = (topic === value) ? '' : value;   // press again to unset
        buttons.forEach(function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-topic') === topic ? 'true' : 'false');
        });
        apply();
      });
    });

    if (search) {
      search.addEventListener('input', function () {
        query = search.value.trim().toLowerCase();
        apply();
      });
      // Enter in a lone text field would submit and reload the page.
      search.form && search.form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    }

    if (clear) {
      clear.addEventListener('click', function () {
        topic = '';
        query = '';
        if (search) { search.value = ''; }
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        apply();
        if (search) { search.focus(); }
      });
    }

    apply();
  });
})();
