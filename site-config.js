/* ============================================================
   Reachable — site configuration.
   THIS IS THE ONE PLACE PHONE NUMBERS AND ADDRESSES LIVE.

   Every page reads this file (assets/site.js fills in the numbers).
   Edit here, save, commit, push — the whole site updates.

   Rules (from DESIGN.md §3):
   - Never invent a real-looking number. Until a number is live it
     stays "(250) 000-0000" and numbersReady stays false, which makes
     every page show "number coming soon" instead of a phone link.
   - When the real numbers are assigned in the BulkVS portal, put them
     here in the display format you want people to read, then set
     numbersReady to true.
   - Browsers with JavaScript turned off cannot read this file, so the
     HTML pages carry a copy of the placeholder text. After you change
     the numbers here, run:  python3 tools/sync_numbers.py
     to copy them into the HTML as well.
   ============================================================ */
window.REACHABLE = {
  numbers: {
    // The Reachable Line: the free help line anyone can call.
    line: '(250) 000-0000',
    // The Reachable Number access line: check messages, change forwarding.
    access: '(250) 000-0000',
    // Office / admin number. Leave empty ('') to hide it everywhere.
    office: ''
  },

  // false = the numbers above are placeholders. Pages say "coming soon"
  // and do NOT turn them into tap-to-call links.
  // true  = the numbers are live. Pages show tap-to-call links.
  numbersReady: false,

  // Base URL of the Reachable backend (DESIGN.md §5), for example
  // 'https://reachable-api.prundaru.ca'. No trailing slash.
  // Empty = no backend yet: forms open the visitor's email app instead
  // (a mailto: link addressed to the email below, with the answers in the body).
  apiBase: '',

  // Where the email fallback goes. Also shown in the footer and on the
  // Call us block. Only works once the reachablesociety.ca mailbox exists.
  email: 'hello@reachablesociety.ca',

  // What a Reachable Number costs (DESIGN.md §11.1, owner-set 2026-09-02).
  // THIS IS THE ONE PLACE THE PRICES LIVE. Pages carry the same words in
  // plain HTML so they are still correct with JavaScript turned off; if you
  // change a price here, change it in number.html and index.html too.
  //
  // Sponsored accounts pay nothing. That is not a discount code or a
  // hardship program with forms — a person says the price is out of reach
  // and we cover it. Never add a field here that asks for proof.
  pricing: {
    caYear: '$12',      // one Canadian number, per year, CAD
    usYear: '$5',       // one US number, per year, CAD
    currency: 'CAD'
  },

  // false = there is no web account / self-serve ordering yet. Pages show
  // "ask us and we will set it up" instead of a sign-up link.
  // true  = the account pages are live (apiBase must be set as well).
  orderingReady: false
};
