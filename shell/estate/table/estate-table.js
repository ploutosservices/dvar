/* THE ESTATE TABLE'S BEHAVIOUR — sort, filter, format, page, copy — for every application that links estate-table.css.
 *
 * Spec: estate-table.md beside this file, §The behaviour. Published byte-for-byte to
 * <CDN base>/estate/table/estate-table.js, as estate-table.css is. Plain JavaScript: no framework, no
 * Bootstrap, no build step.
 *
 * OPT IN BY CLASS ON THE <table>, exactly as the stylesheet is worn. Nothing happens to a table that does not ask:
 *
 *   <table class="estate-table estate-sort">     click a header: ascending, descending, back to the opening order;
 *                                               shift-click adds a column after the ones in force
 *   <table class="estate-table estate-filter">   one box above the table; every word typed must appear in the row
 *   <table class="estate-table estate-copy">     a copy button: text/html (Excel, Gmail) + text/plain (tab-separated)
 *   <table class="… estate-copy-markup">         a button copying the table's HTML as text, for a page's source
 *   <table class="… estate-filter-columns">       a row of boxes under the headers, one per column; f shows or hides it
 *   <table class="… estate-drop-empty">          hides every column whose data cells are all empty
 *   <table class="… estate-page">                a pager in the footer: a page-size choice, "a–b of N", previous, next
 *   <table class="… estate-format">              every number column formatted: grouped thousands, the column's decimals
 *   <table class="… estate-excel">               an Excel button beside the copy button, when a workbook writer is on the page
 *   <table class="… estate-resize">              drag a header's right edge to make the column wider or narrower
 *
 * Per column and per cell, all optional — the specification's tables list every one with its meaning:
 *   <th class="estate-no-sort">      this column is not clickable
 *   <th class="estate-text-filter">   this column's box is always text, even when every value is a number
 *   <th class="estate-as-text">       this column is text for every rule, whatever its values look like
 *   <th class="estate-id">            this column holds identities: by size when every value is digits, never formatted
 *   <th class="estate-sort-abs">     numbers in this column sort by size, sign ignored (or on the <table>: every column)
 *   <th class="estate-keep">         this column stays under estate-drop-empty even when no row fills it
 *   <th class="estate-format">       this column's numbers are formatted (data-decimals on the th or the table says how many)
 *   <th class="estate-pin">          (with the same class on its cells) the column stays in view while the table scrolls
 *   <td data-sort="20260411">        sort this cell by THIS value, not its text
 *   <td data-raw="1234.5">           the plain-text copy carries this value, not the formatted text
 *   <td class="estate-sum">          (in a tr.estate-total) the script writes the column's sum over the rows the filters leave
 *   <td class="estate-link" data-href="…">   the cell opens this address: a click, a middle or Ctrl-click (new tab), Enter
 *   <td data-peek="…">               hovering or focusing the cell shows a card holding what the address answers
 *                                    (any element inside the table may carry it: a header, a span, a div)
 *   <table class="… estate-keep-foot">           the footer's rows stay shown while a filter narrows the rows
 *   <div class="estate-table-box estate-copy-box">  one copy pair on the box's band copies every table in the box
 *   <table data-sort-by="3 desc, 1">  the order the table opens in; the cycle's third click returns to it
 *   <table data-page-size="20" data-page-sizes="5 10 20 50 100" data-store="key">   the pager's sizes and the reader's memory
 *   <table data-filter-row="hidden"> the column boxes open hidden when the reader has made no choice
 *   <table data-total="631">         the rows are part of a larger set on the server; the count and the pager say so
 *   <table data-source="#id">        the copy and the export read that other table
 *   <table data-excel-href="…" data-excel-title="…">   the Excel button is a link to the page's own workbook
 *   <div class="estate-table-box estate-sticky" data-rows="8">   the box shows eight rows under the header, then scrolls
 *   <script src="estate-table.js" data-manual>   decorate nothing on load; the page announces its tables itself
 *
 * With JavaScript off, or if this throws, the reader still has the whole table in the author's order. A table built
 * after load is decorated when the page dispatches `estate:tables-added` (or calls EstateTable.init(root)); a table is
 * never decorated twice.
 *
 * Rows that change after load — a framework re-rendering the body, a reload swapping it — are seen by themselves: the
 * current sort, both filters, the page, the formatting, the sums and the empty-column drop are applied to the new rows,
 * and a control that waited for rows (a table that arrived empty) is built when they come. A page may also say so:
 * dispatch `estate:rows-changed` on the table or a container (or call EstateTable.refresh(root)).
 */
(function () {
  'use strict';

  var ME = document.currentScript, MANUAL = !!(ME && ME.hasAttribute('data-manual'));

  /* ==== core: begin — estate-table-core.js holds this block byte for byte; the release refuses a difference ==== */

  // ---- what a cell holds (one type per column, or text) -------------------------------------------------------------

  var CURRENCY  = /[$£€¥₹]/g;
  var ISO_DATE  = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s?(Z|[+-]\d{2}:?\d{2}))?)?$/i;
  var DMY_NAMED = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4})$/;   // 11 May 2011
  var MDY_NAMED = /^([A-Za-z]{3,9})\.?[ -](\d{1,2}),?[ -]?(\d{4})$/;  // May 11, 2011
  var MONTHS    = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
                     'november', 'december'];
  var TEXT_OPTS = { numeric: true, sensitivity: 'base' };

  // A month is its full name or its three-letter short form (and Sept) — "Mayo" is not May.
  function monthIndex(name) {
    var n = String(name).toLowerCase(), k = n.slice(0, 3);
    if (!Object.prototype.hasOwnProperty.call(MONTHS, k)) return null;
    return n === k || n === MONTH_NAMES[MONTHS[k]] || n === 'sept' ? MONTHS[k] : null;
  }

  // A real calendar day, or null: Date rolls 2011-13-40 over without complaint, so the parts are read back.
  function utcDay(y, mo, d) {
    var t = Date.UTC(y, mo, d), dt = new Date(t);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo && dt.getUTCDate() === d ? t : null;
  }

  // ISO and month-name dates. 05/11/2011 is deliberately NOT a date: it is May 11 in one country and 5 November in
  // another, and guessing is worse than text order.
  function asDate(s) {
    var m = ISO_DATE.exec(s);
    if (m) {
      var day = utcDay(+m[1], +m[2] - 1, +m[3]);
      // A timestamp keeps its time: 15:00 sorts after 09:00 on the same day. One with a zone (Z, -04:00) is read
      // back to UTC, so 10:00-04:00 sorts after 13:00Z; one without a zone is taken as written.
      if (day === null) return null;
      var zone = 0, z = m[7];
      if (z && z.toUpperCase() !== 'Z') {
        var hm = z.replace(':', '');
        zone = (hm.charAt(0) === '-' ? -1 : 1) * (+hm.slice(1, 3) * 60 + +hm.slice(3, 5));
      }
      return day + ((+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0) - zone * 60) * 1000;
    }
    m = DMY_NAMED.exec(s);
    if (m) { var i = monthIndex(m[2]); if (i !== null) return utcDay(+m[3], i, +m[1]); }
    m = MDY_NAMED.exec(s);
    if (m) { var j = monthIndex(m[1]); if (j !== null) return utcDay(+m[3], j, +m[2]); }
    return null;
  }

  // A phone is an IDENTIFIER, compared as a digit string: 07384 232 395 keeps its leading zero and +1 sorts before
  // +44. It needs a marker (a leading +, parentheses, digit-dash-digit, or a space-grouped leading zero) so a
  // space-grouped "1 000 000" stays a number. Tried before numbers: "+44 7384 232 395" is a valid float once stripped.
  function asPhone(s) {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return null;   // an ISO date, even an impossible one, is never a phone
    var digits = s.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    if (/^\(\d{3}\)\s?\d{3}[-. ]\d{4}$/.test(s)) return digits;   // the US form, (305) 555-1212
    if (/^\d{3}\.\d{3}\.\d{4}$/.test(s)) return digits;            // and its dotted form, 305.555.1212
    if (!/^\+?\d[\d ().-]*$/.test(s)) return null;
    if (s.charAt(0) !== '+' && s.indexOf('(') === -1 && !/\d-\d/.test(s)
        && !(s.charAt(0) === '0' && /\d \d/.test(s))) return null;
    return digits;
  }

  // $150.00, -$1,234.50, (1,234.50) as an accounting negative, 12%, plain numbers with , or space thousands.
  function asNumber(s) {
    var t = s.replace(/[\s ]/g, '').replace(CURRENCY, ''), neg = false;
    if (t.length > 2 && t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') { neg = true; t = t.slice(1, -1); }
    if (t.charAt(0) === '+') t = t.slice(1);
    else if (t.charAt(0) === '-') { neg = true; t = t.slice(1); }
    if (t.charAt(t.length - 1) === '%') t = t.slice(0, -1);
    if (!/^\d+(\.\d+)?$/.test(t) && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return null;
    var n = parseFloat(t.replace(/,/g, ''));
    return isFinite(n) ? (neg ? -n : n) : null;
  }

  // kind: null (read the value), 'text' (estate-as-text: text whatever it looks like), 'id' (estate-id: by size when
  // every value is digits, else text; never a number for formatting or export).
  function classify(raw, kind) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (s === '') return { type: 'blank', key: '', text: '' };
    var lower = s.toLowerCase(), v;
    if (kind === 'text') return { type: 'text', key: lower, text: lower };
    if (kind === 'id') return /^\d+$/.test(s) ? { type: 'id', key: s, text: lower } : { type: 'text', key: lower, text: lower };
    if ((v = asDate(s)) !== null) return { type: 'date', key: v, text: lower };
    if ((v = asPhone(s)) !== null) return { type: 'phone', key: v, text: lower };
    if ((v = asNumber(s)) !== null) return { type: 'num', key: v, text: lower };
    return { type: 'text', key: lower, text: lower };
  }

  // One type for the whole column. One "n/a" in a money column makes it text, rather than this code inventing a
  // number for the cell it could not read. Blanks never vote.
  function columnType(values) {
    var found = null;
    for (var i = 0; i < values.length; i++) {
      var t = values[i].type;
      if (t === 'blank') continue;
      if (found === null) found = t;
      else if (found !== t) return 'text';
    }
    return found === null ? 'text' : found;
  }

  // Blanks sink in BOTH directions: an empty cell is missing data, not the smallest value.
  function comparator(colType, dir, abs) {
    var sign = dir === 'desc' ? -1 : 1;
    return function (a, b) {
      if (a.type === 'blank' || b.type === 'blank') return a.type === b.type ? 0 : a.type === 'blank' ? 1 : -1;
      if (colType === 'num') {
        var x = abs ? Math.abs(a.key) : a.key, y = abs ? Math.abs(b.key) : b.key;
        return sign * (x < y ? -1 : x > y ? 1 : 0);
      }
      if (colType === 'id') {   // digit strings by size: the longer is the larger, then digit by digit — no float, every digit kept
        var p = a.key.replace(/^0+(?=\d)/, ''), q = b.key.replace(/^0+(?=\d)/, '');
        return sign * (p.length !== q.length ? (p.length < q.length ? -1 : 1) : p < q ? -1 : p > q ? 1 : 0);
      }
      if (colType === 'date' || colType === 'phone') return sign * (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      return sign * String(a.text).localeCompare(String(b.text), undefined, TEXT_OPTS);
    };
  }

  // "3 desc, 1" → [{ i: 2, d: 'desc' }, { i: 0, d: 'asc' }]: columns counted from 1 in the attribute. An item that is
  // not a column of this table, or not a number, is ignored — a bad attribute opens in the author's order.
  function parseSortBy(str, ncols) {
    var out = [];
    String(str || '').split(',').forEach(function (item) {
      var m = /^\s*(\d+)\s*(asc|desc)?\s*$/i.exec(item);
      if (!m) return;
      var i = +m[1] - 1;
      if (i < 0 || i >= ncols || out.some(function (k) { return k.i === i; })) return;
      out.push({ i: i, d: (m[2] || 'asc').toLowerCase() });
    });
    return out;
  }

  // What one column box means: a predicate over the cell's text, or null when the box is empty. On a number column a
  // box also takes >1000, <=50, =50 and 1000..5000; a comparison a column cannot honour is text to look for — a box
  // that silently matches nothing looks exactly like a table with no data.
  function columnTest(query, numeric) {
    var q = query.trim();
    if (!q) return null;
    if (numeric) {
      var range = q.match(/^(\S+)\s*\.\.\s*(\S+)$/);
      if (range) {
        var lo = asNumber(range[1]), hi = asNumber(range[2]);
        if (lo !== null && hi !== null) return function (t) { var v = asNumber(t); return v !== null && v >= lo && v <= hi; };
      }
      var cmp = q.match(/^(>=|<=|>|<|=)\s*(\S+)$/);
      if (cmp) {
        var n = asNumber(cmp[2]), op = cmp[1];
        if (n !== null) return function (t) {
          var v = asNumber(t);
          if (v === null) return false;
          return op === '>' ? v > n : op === '<' ? v < n : op === '>=' ? v >= n : op === '<=' ? v <= n : v === n;
        };
      }
    }
    var needle = q.toLowerCase();
    return function (t) { return t.toLowerCase().indexOf(needle) !== -1; };
  }

  // A number goes to a spreadsheet unformatted: "1,234.50" with a separator may not read as a number at all.
  // "12.5%" and "USD 672.60" stay as written — the sign and the code carry meaning; so does a code with a leading zero
  // (02134 is an identifier), a phone and a date. Unformatted as TEXT, never through a float: 12345678901234567890
  // keeps every digit, 1,234.50 keeps its cents.
  function unformat(text) {
    text = text.replace(/\s+/g, ' ').trim();
    if (/%$/.test(text) || !/\d/.test(text)) return text;
    if (asPhone(text) !== null || asDate(text) !== null || /^0\d/.test(text) || asNumber(text) === null) return text;
    var t = text.replace(/[\s ]/g, '').replace(CURRENCY, ''), neg = false;
    if (t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') { neg = true; t = t.slice(1, -1); }
    if (t.charAt(0) === '+') t = t.slice(1); else if (t.charAt(0) === '-') { neg = true; t = t.slice(1); }
    return (neg ? '-' : '') + t.replace(/,/g, '');
  }

  // The decimals a written number shows: "1,234.50" → 2, "12" → 0, "(0.125)" → 3.
  function decimalsOf(text) {
    var m = /\.(\d+)/.exec(unformat(text));
    return m ? m[1].length : 0;
  }

  // 1234.5 with 2 decimals → "1,234.50": thousands grouped with a comma and a point for the decimals — the one
  // notation the sort reads back (a locale's "1.234,50" would sort as 1.234).
  // Half away from zero on the DECIMAL value: 0.965 -> 0.97, 1.005 -> 1.01, where Number.toFixed rounds
  // the binary float (0.9649999…) down. Shifting by the exponent reads the number's own shortest decimal text; a value
  // JavaScript already writes in exponent form keeps toFixed.
  function fixedHalfUp(abs, decimals) {
    if (/e/i.test(String(abs))) return abs.toFixed(decimals);
    return Number(Math.round(Number(abs + 'e' + decimals)) + 'e-' + decimals).toFixed(decimals);
  }
  function groupNumber(abs, decimals) {
    var fixed = fixedHalfUp(abs, decimals), parts = fixed.split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts.length > 1 ? '.' + parts[1] : '');
  }

  // A cell's text formatted, or null when the whole of it is not a number the sort would read: a currency sign before
  // it and a % after it are kept; an accounting negative becomes a minus; an identifier (a leading zero, a phone, a
  // date) is never a number here.
  function formatNumber(text, decimals) {
    var s = text.replace(/\s+/g, ' ').trim();
    if (s === '' || asPhone(s) !== null || asDate(s) !== null || /^0\d/.test(s)) return null;
    var n = asNumber(s);
    if (n === null) return null;
    var m = /^([$£€¥₹]?)\s*[^%]*?(%?)$/.exec(s), prefix = m ? m[1] : '', suffix = m ? m[2] : '';
    return prefix + (n < 0 ? '-' : '') + groupNumber(Math.abs(n), decimals) + suffix;
  }

  // ---- the readers of a cell: what the reader sees in it (over a DOM node, no page state) ----------------------------

  // A cell's text as the reader sees it: a form control says what it shows — a select its chosen option, a checkbox
  // or radio ✓ or nothing, a field its value — and everything else is its text content.
  var CONTROLS_SEL = 'select, input, textarea';
  function shown(ctl) {
    if (ctl.tagName === 'SELECT') { var o = ctl.options[ctl.selectedIndex]; return o ? o.textContent : ''; }
    if (ctl.type === 'checkbox' || ctl.type === 'radio') return ctl.checked ? '✓' : '';
    if (ctl.type === 'hidden' || ctl.type === 'button' || ctl.type === 'submit' || ctl.type === 'reset') return '';
    return ctl.value;
  }
  function textOf(cell) {
    if (!cell) return '';
    if (!cell.querySelector(CONTROLS_SEL)) return cell.textContent;
    var out = '';
    (function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) out += n.data;
        else if (n.nodeType === 1) {
          if (n.matches(CONTROLS_SEL)) out += ' ' + shown(n) + ' ';
          else walk(n);
        }
      }
    })(cell);
    return out;
  }

  // Any element in a cell is content: an icon column stays (estate-drop-empty).
  var CONTENT = 'img,i,svg,button,a,input,select,textarea,video,audio,object';

  function filled(cell) { return !!cell && (cell.textContent.trim() !== '' || cell.querySelector(CONTENT) !== null); }

  // ---- the table's parts, and the copy and the export built from them (over DOM nodes; the rows they carry are named) ----

  function kids(parent, tags) {
    var out = [];
    if (!parent) return out;
    for (var i = 0; i < parent.children.length; i++) if (tags.indexOf(parent.children[i].tagName) !== -1) out.push(parent.children[i]);
    return out;
  }
  // The last header row is the one that labels the columns.
  function headerCells(table) {
    var rows = kids(table.tHead, ['TR']).filter(function (tr) { return !tr.classList.contains('estate-table-filter-row'); });
    return rows.length ? kids(rows[rows.length - 1], ['TH', 'TD']) : [];
  }
  function cells(tr) { return kids(tr, ['TD', 'TH']); }
  // The rows of this table alone — thead, the bodies, tfoot — never a nested table's.
  function ownRows(table) {
    return Array.prototype.filter.call(table.rows, function (tr) { return tr.parentNode.parentNode === table; });
  }

  // A group band (estate-row-section, or one cell spanning the row) heads the rows under it. Sorting happens WITHIN
  // each group and never moves the groups: tearing a heading off its rows makes the table assert something false.
  function isGroupRow(tr) {
    if (tr.classList.contains('estate-row-section')) return true;
    var c = cells(tr);
    return c.length === 1 && c[0].colSpan > 1;
  }
  // A totals row in the body stays where the author put it, after the rows it sums.
  function isTotalRow(tr) { return tr.classList.contains('estate-total'); }
  function tidy(s) { return s.replace(/\s+/g, ' ').trim(); }
  // What the author said the column is: 'text' (estate-as-text), 'id' (estate-id), or null (read the values).
  function kindOf(th) { return th.classList.contains('estate-id') ? 'id' : th.classList.contains('estate-as-text') ? 'text' : null; }
  // Where a bar of the table's own goes: inside the estate box between its title band (or toolbar) and the scroller,
  // else just before the table.
  // The estate box that is this table's own — not an outer one a nested table happens to sit in.
  function boxOf(table) {
    var box = table.closest('.estate-table-box');
    return box && box.querySelector('table') === table ? box : null;
  }

  // The table the copy and the export read: data-source names another (usually hidden, with more columns or rows).
  function sourceOf(table) {
    var sel = table.getAttribute('data-source'), src = null;
    if (sel) { try { src = document.querySelector(sel); } catch (e) { src = null; } }
    return src && src.tagName === 'TABLE' ? src : table;
  }

  // The table as the author wrote it: our own parts go; the rows the filters hid go (across every page: a sheet of one
  // page is not what anyone means by export); so do the cells estate-drop-empty hid and (estate-copy-body) the footer.
  // A form control is replaced by what it shows, since a cloned control carries no live value. Answers the clone and
  // the live cells it kept, in the same order, so the html flavour can read each one's alignment. ROWS are the data rows
  // the copy carries, as the renderer that draws the table knows them (the plain script's filter pass, the React
  // renderer's press pass); none named, a data row goes unless it is hidden.
  function bare(table, rows) {
    var src = sourceOf(table), copy = src.cloneNode(true);
    var own = function (t) { return function (c) { return c.closest('table') === t; }; };
    var liveCells = Array.prototype.filter.call(src.querySelectorAll('th, td'), own(src));
    var copyCells = Array.prototype.filter.call(copy.querySelectorAll('th, td'), own(copy));
    liveCells.forEach(function (c, i) { if (c.querySelector(CONTROLS_SEL)) copyCells[i].textContent = tidy(textOf(c)); });
    var keep = null;
    if (rows) { keep = {}; rows.forEach(function (tr) { keep[tr.getAttribute('data-estate-row')] = true; }); }
    var liveRows = ownRows(src), copyRows = ownRows(copy), kept = [];
    liveRows.forEach(function (tr, i) {
      var inBody = tr.parentNode === src.tBodies[0], data = inBody && !isGroupRow(tr) && !isTotalRow(tr);
      var drop = tr.classList.contains('estate-table-filter-row')
              || (data && keep ? !keep[tr.getAttribute('data-estate-row')] : tr.hidden)
              || (table.classList.contains('estate-copy-body') && tr.parentNode === src.tFoot);
      if (drop) copyRows[i].remove(); else kept.push(tr);
    });
    copy.querySelectorAll('.estate-sort-mark, .estate-table-copy, .estate-table-markup, .estate-table-excel, .estate-table-resize-handle').forEach(function (el) { el.remove(); });
    var live = [];
    kept.forEach(function (tr) { cells(tr).forEach(function (c) { if (!c.hidden) live.push(c); }); });
    copy.querySelectorAll('th[hidden], td[hidden]').forEach(function (el) { el.remove(); });
    if (table.classList.contains('estate-copy-body') && copy.tFoot) copy.tFoot.remove();
    return { copy: copy, live: live, kinds: headerCells(src).map(kindOf) };
  }

  // data-raw wins; otherwise a cell that is an amount and nothing else is unformatted — unless its column is text or
  // an identity column, which goes as written.
  function plainCell(cell, kind) {
    var raw = cell.getAttribute('data-raw');
    var text = tidy(raw !== null && raw.trim() !== '' ? raw : cell.textContent);
    if (text === '' && cell.tagName === 'TH') text = tidy(cell.getAttribute('aria-label') || '');   // an icon-only header travels as its label
    return (kind ? text : unformat(text)).replace(/\t/g, ' ');
  }

  // The copy as a grid of plain values: a colspan expands into empty columns so the cells after it stay in their
  // columns, and a rowspan reserves its column in the rows beneath, which get an empty field there. Each value says
  // whether it is a header and which column kind it fell in.
  function gridOf(b) {
    var pending = [];
    return Array.prototype.map.call(b.copy.rows, function (row) {
      var out = [], col = 0;
      var place = function () { while (pending[col] > 0) { out.push({ v: '', head: false, kind: b.kinds[col] }); pending[col]--; col++; } };
      Array.prototype.forEach.call(row.cells, function (c) {
        place();
        var span = c.colSpan || 1, rows = c.rowSpan || 1, head = c.tagName === 'TH' || !!c.closest('tfoot'), th = c.tagName === 'TH';
        out.push({ v: plainCell(c, b.kinds[col]), head: head, th: th, kind: b.kinds[col] });
        for (var i = 1; i < span; i++) out.push({ v: '', head: head, th: th, kind: b.kinds[col + i] });
        if (rows > 1) for (var k = 0; k < span; k++) pending[col + k] = (pending[col + k] || 0) + rows - 1;
        col += span;
      });
      place();
      return out;
    });
  }
  // Tab-separated.
  function tsv(b) {
    return gridOf(b).map(function (row) { return row.map(function (c) { return c.v; }).join('\t'); }).join('\n');
  }

  // Styles INLINED into the html flavour: Gmail keeps inline styles and drops classes, so a classed table pastes as
  // bare text in a grid with no lines. Each cell carries its border, padding and alignment.
  function styledHtml(b) {
    var copy = b.copy;
    // Nothing of ours or of the page's stylesheet travels: classes, our state attributes, focus order.
    [copy].concat(Array.prototype.slice.call(copy.querySelectorAll('*'))).forEach(function (el) {
      ['class', 'id', 'tabindex', 'aria-sort', 'data-estate-on', 'data-estate-row', 'data-estate-dir', 'data-estate-sort', 'data-estate-page',
       'data-estate-span', 'data-estate-title', 'data-sort', 'data-raw', 'data-href', 'data-peek', 'hidden', 'list', 'style']
        .forEach(function (a) { el.removeAttribute(a); });
    });
    copy.setAttribute('style', 'border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px');
    var dst = Array.prototype.filter.call(copy.querySelectorAll('th, td'), function (c) { return c.closest('table') === copy; });
    for (var i = 0; i < dst.length; i++) {
      var cs = window.getComputedStyle(b.live[i]);
      var align = cs.textAlign === 'end' || cs.textAlign === 'right' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left';
      var head = dst[i].tagName === 'TH' || dst[i].closest('tfoot');
      dst[i].removeAttribute('title');
      dst[i].setAttribute('style', 'border:1px solid #c8ced6;padding:4px 8px;text-align:' + align
        + (head ? ';font-weight:bold;background:#f2f4f7' : ''));
    }
    return copy.outerHTML;
  }

  // Both flavours at once; each application takes the richest it understands. navigator.clipboard needs a secure
  // context and some estate pages are served over plain http, so the fallback selects an off-screen copy and lets the
  // browser serialise both flavours itself.
  function toClipboard(html, text) {
    if (window.isSecureContext && navigator.clipboard && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html':  new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
    }
    var holder = document.createElement('div');
    holder.innerHTML = html;
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(holder);
    var range = document.createRange(), sel = window.getSelection();
    range.selectNodeContents(holder);
    sel.removeAllRanges(); sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges(); holder.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy refused'));
  }

  // THE HTML COPY (estate-copy-markup: an optional button copying the table as plain HTML, its text content only, to
  // paste into a page of one's own): the table the copy carries, written again
  // as bare markup — table, thead/tbody/tfoot, tr, th/td and each cell's text, escaped; a spanning cell keeps its
  // colspan/rowspan, since the rows would not line up without it. Nothing else: no class, no link, no attribute.
  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function markupOf(b) {
    var out = ['<table>'];
    [b.copy.tHead].concat(Array.prototype.slice.call(b.copy.tBodies), [b.copy.tFoot]).forEach(function (sec) {
      if (!sec || !sec.rows.length) return;
      var tag = sec.tagName.toLowerCase();
      out.push('  <' + tag + '>');
      Array.prototype.forEach.call(sec.rows, function (tr) {
        out.push('    <tr>' + Array.prototype.map.call(tr.cells, function (c) {
          var t = c.tagName.toLowerCase(), span = '';
          if (c.colSpan > 1) span += ' colspan="' + c.colSpan + '"';
          if (c.rowSpan > 1) span += ' rowspan="' + c.rowSpan + '"';
          return '<' + t + span + '>' + esc(tidy(textOf(c))) + '</' + t + '>';
        }).join('') + '</tr>');
      });
      out.push('  </' + tag + '>');
    });
    out.push('</table>');
    return out.join('\n');
  }

  // Text alone on the clipboard (the HTML copy is source, not a drawn table); off a secure context, an off-screen
  // textarea and the browser's own copy.
  function textToClipboard(text) {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy refused'));
  }

  // The capability: a workbook writer of one shape, found at window.ExcelJS — the standard names no package and looks
  // for the shape: a Workbook whose instances add a worksheet. Nothing is made without it (rule 8).
  function writerOf() {
    var E = window.ExcelJS;
    return E && typeof E.Workbook === 'function' && E.Workbook.prototype && typeof E.Workbook.prototype.addWorksheet === 'function' ? E : null;
  }
  // The table's name: the band's own text (not its buttons' words), else the caption's, else "Table".
  function tableName(table) {
    var box = boxOf(table), band = box && box.querySelector(':scope > .estate-table-title'), t = '';
    if (band) { for (var n = band.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) t += n.data; }
    else if (table.caption) t = table.caption.textContent;
    return tidy(t) || 'Table';
  }
  function sheetName(name) { return name.replace(/[\[\]:*?\/\\]/g, '').slice(0, 31) || 'Table'; }
  function fileName(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table'; }
  // A plain value that is a number for the workbook: what the sort reads as one, in a column that is not text or an
  // identity; a header cell is always text, a footer's total is a number.
  function workbookNumber(c) {
    if (c.th || c.kind || c.v === '' || asPhone(c.v) !== null || asDate(c.v) !== null || /^0\d/.test(c.v)) return null;
    return asNumber(c.v);
  }
  function writeWorkbook(table, b, rows) {
    var E = writerOf();
    if (!E) return Promise.reject(new Error('no writer'));
    var name = tableName(table), wb = new E.Workbook(), ws = wb.addWorksheet(sheetName(name));
    var grid = gridOf(bare(table, rows)), cols = grid.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    // One number format per column: with decimals when any value in it shows some, else none; columns sized to their content.
    var fmt = [], widths = [];
    for (var c = 0; c < cols; c++) {
      var dec = false, w = 0;
      grid.forEach(function (r) { var x = r[c]; if (!x) return; w = Math.max(w, x.v.length); if (workbookNumber(x) !== null && decimalsOf(x.v) > 0) dec = true; });
      fmt[c] = dec ? '#,##0.00' : '#,##0';
      widths[c] = Math.min(Math.max(w + 2, 10), 60);
    }
    ws.columns = widths.map(function (w) { return { width: w }; });
    grid.forEach(function (r) {
      var row = ws.addRow(r.map(function (x) { var n = workbookNumber(x); return n !== null ? n : x.v === '' ? null : x.v; }));
      r.forEach(function (x, i) {
        var cell = row.getCell(i + 1);
        if (workbookNumber(x) !== null) { cell.numFmt = fmt[i]; cell.alignment = { horizontal: 'right' }; }
        if (x.head) cell.font = { bold: true };
      });
    });
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = fileName(name) + '.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /* ==== core: end ==== */

  // ---- the table's parts ---------------------------------------------------------------------------------------------

  // kids, headerCells, cells, ownRows, isGroupRow, isTotalRow, tidy and kindOf are in the core (above).
  // Direct rows of the first tbody only, so a nested table is never touched.
  function bodyRows(table) { return kids(table.tBodies[0], ['TR']); }
  function dataRows(table) { return bodyRows(table).filter(function (tr) { return !isGroupRow(tr) && !isTotalRow(tr); }); }

  function segments(rows) {
    var segs = [], cur = { head: null, rows: [], tail: [] };
    rows.forEach(function (tr) {
      if (isGroupRow(tr)) {
        if (cur.head || cur.rows.length || cur.tail.length) segs.push(cur);
        cur = { head: tr, rows: [], tail: [] };
      } else if (isTotalRow(tr)) cur.tail.push(tr);
      else cur.rows.push(tr);
    });
    if (cur.head || cur.rows.length || cur.tail.length) segs.push(cur);
    return segs;
  }


  // A labelled column is one whose header has text, or an aria-label when it shows only an icon.
  function labelOf(th) { return tidy(th.textContent) || tidy(th.getAttribute('aria-label') || ''); }

  function cellValue(tr, idx) {
    var td = cells(tr)[idx];
    if (!td) return '';
    var o = td.getAttribute('data-sort');
    return o !== null ? o : textOf(td);
  }

  // The column each cell of a row starts in, spans counted — so a totals row written "Total | sum" with a colspan is
  // read right. Rows under a rowspan are not reconciled here (the copy's grid does that).
  function columnStarts(tr) {
    var at = 0;
    return cells(tr).map(function (c) { var s = at; at += c.colSpan || 1; return s; });
  }
  function cellAt(tr, col) {
    var cs = cells(tr), starts = columnStarts(tr);
    for (var i = 0; i < cs.length; i++) if (starts[i] === col && (cs[i].colSpan || 1) === 1) return cs[i];
    return null;
  }

  // Every tooltip the script sets goes through here, so a page may draw tooltips its own way (EstateTable.tooltip).
  function tip(node, text) { (window.EstateTable && window.EstateTable.tooltip || setTitle)(node, text); }
  function setTitle(node, text) { node.title = text; }

  // One state record per table, on the element so the inspector finds it.
  function state(table) {
    return table.__estateFilter || (table.__estateFilter = { words: [], cols: [], count: null, pass: null, page: null, opened: false });
  }

  // ---- the reader's choices, remembered (data-store) -------------------------------------------------------------------

  function storeOf(table) {
    var st = state(table);
    if (st.store !== undefined) return st.store;
    var key = table.getAttribute('data-store');
    st.store = null;
    if (key) {
      st.store = {};
      // A stored value that is not a record (a bare number another table code left under the same key) is read as no record:
      // the script assigns properties on it, which throws on a number under 'use strict'.
      try { var v = localStorage.getItem(key), r = v ? JSON.parse(v) : null; if (r && typeof r === 'object' && !Array.isArray(r)) st.store = r; } catch (e) { /* the record is kept for the page's life */ }
    }
    return st.store;
  }
  function saveStore(table) {
    var key = table.getAttribute('data-store'), st = state(table);
    if (!key || !st.store) return;
    try { localStorage.setItem(key, JSON.stringify(st.store)); } catch (e) { /* refused: the choice still holds on the page */ }
  }

  // ---- sort ----------------------------------------------------------------------------------------------------------

  var SORT_TIP = { none: 'Sort — shift-click to add this column after the ones in force', asc: 'Sorted ascending — click for descending', desc: 'Sorted descending — click for the opening order' };
  function headTip(th, d) { var own = th.getAttribute('data-estate-title'); return (own ? own + ' — ' : '') + SORT_TIP[d]; }

  // The reader's list: data-estate-sort holds "col:dir,col:dir" (columns from 0), or nothing for the opening order.
  function sortList(table) {
    var out = [];
    (table.getAttribute('data-estate-sort') || '').split(',').forEach(function (item) {
      var p = item.split(':');
      if (p.length === 2 && p[0] !== '' && (p[1] === 'asc' || p[1] === 'desc')) out.push({ i: +p[0], d: p[1] });
    });
    return out;
  }
  function serialize(list) { return list.map(function (k) { return k.i + ':' + k.d; }).join(','); }
  // The order the table opens in: data-sort-by, else the author's.
  function openingList(table) {
    var st = state(table);
    if (!st.opening) st.opening = parseSortBy(table.getAttribute('data-sort-by'), headerCells(table).length);
    return st.opening;
  }

  function applySort(table, list) {
    var tbody = table.tBodies[0], rows = bodyRows(table), st = state(table);
    // A row added after load has no place yet: it takes the next one, as if the author had appended it.
    var next = rows.reduce(function (m, tr) { var v = tr.getAttribute('data-estate-row'); return v === null ? m : Math.max(m, +v + 1); }, 0);
    rows.forEach(function (tr) { if (!tr.hasAttribute('data-estate-row')) tr.setAttribute('data-estate-row', next++); });
    var effective = list.length ? list : openingList(table), segs = segments(rows), heads = headerCells(table);
    if (!effective.length) {
      segs.forEach(function (s) { s.rows.sort(function (x, y) { return x.getAttribute('data-estate-row') - y.getAttribute('data-estate-row'); }); });
    } else {
      // Each column's type is resolved over EVERY data row, so separate groups are compared by one rule; the first
      // column decides, the next breaks a tie.
      var keys = effective.map(function (k) {
        var th = heads[k.i], kind = th ? kindOf(th) : null, all = [];
        segs.forEach(function (s) { s.rows.forEach(function (tr) { all.push(classify(cellValue(tr, k.i), kind)); }); });
        var abs = table.classList.contains('estate-sort-abs') || (th && th.classList.contains('estate-sort-abs'));
        return { i: k.i, kind: kind, cmp: comparator(columnType(all), k.d, abs) };
      });
      segs.forEach(function (s) {
        var pairs = s.rows.map(function (tr) { return { tr: tr, v: keys.map(function (k) { return classify(cellValue(tr, k.i), k.kind); }) }; });
        pairs.sort(function (x, y) {   // stable (ES2019): equal rows keep their order
          for (var k = 0; k < keys.length; k++) { var c = keys[k].cmp(x.v[k], y.v[k]); if (c) return c; }
          return 0;
        });
        s.rows = pairs.map(function (p) { return p.tr; });
      });
    }
    // appendChild MOVES a node: this re-orders and keeps every heading above its own rows, every total below them.
    segs.forEach(function (s) {
      if (s.head) tbody.appendChild(s.head);
      s.rows.forEach(function (tr) { tbody.appendChild(tr); });
      s.tail.forEach(function (tr) { tbody.appendChild(tr); });
    });
    // State lives on the elements, so what the table is doing is visible in the inspector. The headers the opening
    // order names are marked too — they are sorted — while data-estate-sort stays empty, which means "the opening order".
    heads.forEach(function (h, i) {
      if (!h.classList.contains('estate-sortable')) return;
      var on = null;
      effective.forEach(function (k) { if (k.i === i) on = k.d; });
      h.setAttribute('aria-sort', on ? (on === 'asc' ? 'ascending' : 'descending') : 'none');
      h.setAttribute('data-estate-dir', on || 'none');
      tip(h, headTip(h, on || 'none'));
    });
    table.setAttribute('data-estate-sort', serialize(list));
    st.opened = true;
    // The page shows a slice of the new order.
    if (st.page) refilter(table);
  }

  // A plain click replaces the list with one column and cycles it: ascending, descending, the opening order. On the
  // column the opening order names first, the cycle is the other direction, then the opening order — never the same
  // order twice under two names.
  function nextPlain(table, list, idx) {
    var opening = openingList(table), first = opening.length && opening[0].i === idx ? opening[0].d : null;
    if (first) return list.length === 1 && list[0].i === idx ? [] : [{ i: idx, d: first === 'asc' ? 'desc' : 'asc' }];
    if (list.length === 1 && list[0].i === idx) return list[0].d === 'asc' ? [{ i: idx, d: 'desc' }] : [];
    return [{ i: idx, d: 'asc' }];
  }
  // A shift-click adds the column after the ones in force — the reader's list, else the opening order's columns — turns
  // it, then removes it.
  function nextShift(list, idx) {
    var out = [], found = false;
    list.forEach(function (k) {
      if (k.i !== idx) { out.push(k); return; }
      found = true;
      if (k.d === 'asc') out.push({ i: idx, d: 'desc' });
    });
    if (!found) out.push({ i: idx, d: 'asc' });
    return out;
  }

  // Each enable* answers whether it built its control; one that did not (no rows yet) is asked again when rows come.
  function enableSort(table) {
    var ths = headerCells(table);
    if (!ths.length || !bodyRows(table).length) return false;
    // A header spanning columns makes header-to-column mapping ambiguous; guessing would sort the wrong column.
    for (var i = 0; i < ths.length; i++) if (ths[i].colSpan > 1) return true;   // never buildable: not asked again
    ths.forEach(function (th, idx) {
      if (th.classList.contains('estate-no-sort') || !labelOf(th)) return;
      th.classList.add('estate-sortable');
      th.setAttribute('tabindex', '0');
      th.setAttribute('aria-sort', 'none');
      th.setAttribute('data-estate-dir', 'none');
      th.setAttribute('data-estate-title', th.title || '');   // the author's own tooltip, kept
      tip(th, headTip(th, 'none'));
      // The mark is the estate icon (sort / sort-up / sort-down, estate-icons.md), drawn by estate-table.css from
      // data-estate-dir — never a character (estate-icons.md rule 5).
      var mark = document.createElement('span');
      mark.className = 'estate-sort-mark';
      mark.setAttribute('aria-hidden', 'true');
      th.appendChild(mark);
      var go = function (shift) {
        quiet(table, function () {
          var list = sortList(table);
          applySort(table, shift ? nextShift(list.length ? list : openingList(table), idx) : nextPlain(table, list, idx));
        });
      };
      // A drag's release lands a click on the header (the pointer left the handle); a drag never sorts.
      th.addEventListener('click', function (e) { if (e.target.closest('.estate-table-resize-handle') || state(table).dragging) return; go(e.shiftKey); });
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e.shiftKey); } });
    });
    return true;
  }

  // ---- filter, sum, page: one pass after any change --------------------------------------------------------------------

  function setVisible(tr, on) { if (on) tr.removeAttribute('hidden'); else tr.setAttribute('hidden', ''); }
  function hasSum(tr) { return !!tr.querySelector(':scope > td.estate-sum, :scope > th.estate-sum'); }

  // Both filters narrow the same rows, so one function applies them together: a row passes when it holds every word in
  // the estate-filter box AND passes every box of the estate-filter-columns row. Then the sums are written over the rows
  // that pass, the page shows its slice of them, the counts are said, the empty columns are re-judged, and the page is told.
  function refilter(table) {
    var st = state(table), total = 0, pass = [];
    var live = st.words.length > 0 || st.cols.some(Boolean);
    var segs = segments(bodyRows(table));
    segs.forEach(function (s) {
      s.hits = [];
      s.rows.forEach(function (tr) {
        var c = cells(tr), text = c.map(textOf).join(' ').toLowerCase();
        var hit = st.words.every(function (t) { return text.indexOf(t) !== -1; })
               && st.cols.every(function (test, i) { return !test || test(tidy(textOf(c[i]))); });
        total++;
        if (hit) { pass.push(tr); s.hits.push(tr); }
        else setVisible(tr, false);
      });
    });
    st.pass = pass;
    sumTable(table, pass);
    // The page: a slice of the rows that pass, in the body's order.
    var at = 0, pages = 1, size = 0;
    if (st.page) {
      size = st.page.size;
      pages = Math.max(1, Math.ceil(pass.length / size));
      if (st.page.at >= pages) st.page.at = 0;
      at = st.page.at;
    }
    var onPage = {};
    pass.forEach(function (tr, i) { var on = !st.page || (i >= at * size && i < (at + 1) * size); setVisible(tr, on); if (on) onPage[tr.getAttribute('data-estate-row')] = true; });
    segs.forEach(function (s) {
      var any = s.hits.some(function (tr) { return onPage[tr.getAttribute('data-estate-row')]; });
      // A heading with nothing left under it is a lie; it hides with its rows. A total no longer sums what is shown —
      // unless the script sums it (estate-sum), which is true again.
      if (s.head) setVisible(s.head, any);
      s.tail.forEach(function (tr) { setVisible(tr, (!live || hasSum(tr)) && (!st.page || any)); });
    });
    // The footer's totals no longer sum what is shown either — unless the author keeps the footer (estate-keep-foot:
    // its rows say something a filter does not change, a "Displaying N of M" among them).
    var keepFoot = table.classList.contains('estate-keep-foot');
    kids(table.tFoot, ['TR']).forEach(function (tr) { setVisible(tr, !live || keepFoot || hasSum(tr)); });
    var loaded = table.getAttribute('data-total'), ofLoaded = loaded ? total + ' loaded of ' + loaded : '';
    if (st.count) st.count.textContent = live ? pass.length + ' of ' + total + ' shown' + (loaded ? ' · ' + ofLoaded : '') : ofLoaded;
    if (st.page) {
      var a = pass.length ? at * size + 1 : 0, b = Math.min(pass.length, (at + 1) * size);
      st.page.count.textContent = pass.length ? a + '–' + b + ' of ' + (loaded ? ofLoaded : pass.length) + ' · page ' + (at + 1) + ' of ' + pages : '0 rows';
      st.page.prev.disabled = at === 0;
      st.page.next.disabled = at >= pages - 1;
      table.setAttribute('data-estate-page', (at + 1) + '/' + pages);
    }
    if (table.classList.contains('estate-drop-empty')) dropEmpty(table);
    placePins(table);   // the rows shown changed, so the columns' widths may have
    table.dispatchEvent(new CustomEvent('estate:filtered', { bubbles: true, detail: { shown: pass.length, total: total } }));
    if (st.page) table.dispatchEvent(new CustomEvent('estate:paged', { bubbles: true, detail: { page: at + 1, pages: pages, size: size } }));
  }

  function placeBar(table, bar) {
    var box = boxOf(table), scroll = box && box.querySelector(':scope > .estate-table-scroll');
    if (scroll) box.insertBefore(bar, scroll);
    else table.parentNode.insertBefore(bar, table);
  }

  // The table's bar, made once, with its "N of M shown".
  function barOf(table) {
    var st = state(table);
    if (st.bar) return st.bar;
    st.bar = document.createElement('div');
    st.bar.className = 'estate-table-filter';
    st.count = document.createElement('span');
    st.count.className = 'estate-table-filter-count';
    st.bar.appendChild(st.count);
    placeBar(table, st.bar);
    return st.bar;
  }

  function enableFilter(table) {
    if (!bodyRows(table).length || !table.parentNode) return false;
    var bar = barOf(table);
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'estate-table-filter-box';
    input.placeholder = 'Filter…';
    input.setAttribute('aria-label', 'Filter the rows of this table');
    tip(input, 'Every word typed must appear somewhere in the row');
    bar.insertBefore(input, bar.firstChild);
    var run = function () { var st = state(table); st.words = input.value.toLowerCase().split(/\s+/).filter(Boolean); if (st.page) st.page.at = 0; refilter(table); };
    input.addEventListener('input', run);
    input.addEventListener('search', run);
    return true;
  }

  // ---- filter by column (estate-filter-columns) ----------------------------------------------------------------------

  // Shown unless this reader hid it: a table that names data-store reads its own choice there and never the browser-wide
  // key; any other reads the browser-wide key; then the author's data-filter-row; else shown.
  var COLS_PREF = 'estate-table.filter-columns', colsMemory = null;   // memory too: a browser may refuse storage
  function globalCols() {
    if (colsMemory !== null) return colsMemory;
    try { var v = localStorage.getItem(COLS_PREF); return v === null ? null : v !== 'hidden'; } catch (e) { return null; }
  }
  function colsShown(table) {
    var store = storeOf(table);
    if (store) { if (store.cols) return store.cols !== 'hidden'; }
    else { var g = globalCols(); if (g !== null) return g; }
    return table.getAttribute('data-filter-row') !== 'hidden';
  }

  function enableFilterColumns(table) {
    var ths = headerCells(table), rows = bodyRows(table);
    if (!ths.length || !rows.length) return false;
    if (table.tHead.querySelector('.estate-table-filter-row')) return true;
    for (var i = 0; i < ths.length; i++) if (ths[i].colSpan > 1) return true;   // as for sorting: no guessing a column
    barOf(table);
    var st = state(table);
    var data = dataRows(table);
    var row = table.tHead.insertRow(-1);
    row.className = 'estate-table-filter-row';
    ths.forEach(function (th, c) {
      var cell = document.createElement('td');
      if (th.classList.contains('estate-pin')) cell.classList.add('estate-pin');   // the box rides with its pinned column
      row.appendChild(cell);
      st.cols[c] = null;
      // A column with no heading (an actions column) has no value to look for, so it gets no box.
      var label = labelOf(th);
      if (!label) return;
      var kind = kindOf(th);
      var values = data.map(function (tr) { return tidy(textOf(cells(tr)[c])); });
      var numeric = !kind && !th.classList.contains('estate-text-filter')
                    && columnType(values.map(function (v) { return classify(v); })) === 'num';
      var input = document.createElement('input');
      input.type = 'text';
      input.size = 1;   // no intrinsic width: the box never widens its column
      input.className = 'estate-filter-col-box';
      input.placeholder = label;
      input.setAttribute('aria-label', 'Filter by ' + label);
      tip(input, numeric ? 'Filter — text, or >100, <=50, =50, 100..500' : 'Filter — any part of the value');
      // The values the column actually holds, offered as you type: text columns only, and only while the list helps.
      if (!numeric) {
        var list = document.createElement('datalist');
        list.id = 'estate-filter-' + Math.random().toString(36).slice(2) + '-' + c;
        cell.appendChild(list);
        // Read when the box is entered, so rows added since load are offered too.
        var offer = function () {
          var vals = dataRows(table).map(function (tr) { return tidy(textOf(cells(tr)[c])); })
            .filter(Boolean).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort();
          list.textContent = '';
          if (vals.length > 1 && vals.length <= 100) {
            vals.forEach(function (v) { var o = document.createElement('option'); o.value = v; list.appendChild(o); });
            input.setAttribute('list', list.id);
          } else input.removeAttribute('list');
        };
        offer();
        input.addEventListener('focus', offer);
      }
      input.addEventListener('input', function () {
        st.cols[c] = columnTest(input.value, numeric);
        // A filtering column says so on its header, so a table narrowed while the row is hidden still shows where.
        th.classList.toggle('estate-filtered', !!st.cols[c]);
        if (st.page) st.page.at = 0;
        refilter(table);
      });
      cell.appendChild(input);
    });
    setVisible(row, colsShown(table));
    var tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'estate-table-cols-toggle';
    tip(tog, 'Show or hide the filter box under each column (f while in the table)');
    tog.setAttribute('aria-label', 'Show or hide the filter box under each column (f while in the table)');
    tog.addEventListener('click', function () { toggleColumns(table); });
    var bar = barOf(table);
    bar.insertBefore(tog, st.count);
    return true;
  }

  // A table that remembers its own choice (data-store) toggles alone; any other toggles every such table, browser-wide.
  function toggleColumns(table) {
    var show = !colsShown(table), store = storeOf(table);
    if (store) {
      store.cols = show ? 'shown' : 'hidden';
      saveStore(table);
      var own = table.tHead.querySelector('tr.estate-table-filter-row');
      if (own) setVisible(own, show);
      return;
    }
    colsMemory = show;
    try { localStorage.setItem(COLS_PREF, show ? 'shown' : 'hidden'); } catch (err) { /* the toggle still works */ }
    document.querySelectorAll('table.estate-filter-columns[data-estate-on=""]:not([data-store]) tr.estate-table-filter-row').forEach(function (r) { setVisible(r, show); });
  }

  // f shows or hides the column-filter rows — only while the reader is IN such a table (focus inside its box: a sorted
  // header, the bar), never as a page-wide key (WCAG 2.1.4), and never while a field has the keystroke. The button in
  // the bar does the same for a pointer.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'f') return;
    var t = e.target;
    if (!t || !t.closest || t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(t.tagName) !== -1) return;
    var host = t.closest('.estate-table-box, table');
    var table = host && (host.tagName === 'TABLE' ? host : host.querySelector('table'));
    // Only a table this script decorated (another renderer answers the key for its own).
    if (!table || !table.classList.contains('estate-filter-columns') || table.getAttribute('data-estate-on') !== '') return;
    toggleColumns(table);
    e.preventDefault();
  });

  // ---- format the numbers (estate-format, data-decimals) and sum the totals (estate-sum) ----------------------------------

  // What the script wrote into a cell — the text as it arrived and the text it put there — kept off the element, so a
  // producer's rewrite is told from the script's own text and an author's data-raw is never touched.
  var wrote = typeof WeakMap === 'function' ? new WeakMap() : null;

  // The one text node a cell's content is, possibly inside one element (a link around a number); null for anything else.
  function textNodeOf(cell) {
    var n = cell;
    while (n && n.childNodes.length === 1 && n.firstChild.nodeType === 1 && !n.firstChild.matches(CONTROLS_SEL)) n = n.firstChild;
    return n && n.childNodes.length === 1 && n.firstChild.nodeType === 3 ? n.firstChild : n && n.childNodes.length === 0 && n === cell ? null : null;
  }
  // Written so a framework that owns the cell's text node keeps owning it: its next rewrite changes the node the reader
  // sees, and the watcher re-formats.
  function writeText(cell, text) {
    var node = textNodeOf(cell);
    if (node) node.nodeValue = text; else cell.textContent = text;
  }

  // The columns estate-format names: each th wearing it, or — on the table — every column whose body values are numbers.
  function formatColumns(table) {
    var heads = headerCells(table), out = [];
    if (!heads.length || !wrote) return out;
    var all = table.classList.contains('estate-format'), data = dataRows(table);
    heads.forEach(function (th, c) {
      if (kindOf(th)) return;
      if (th.classList.contains('estate-format')) { out.push(c); return; }
      if (!all) return;
      var values = data.map(function (tr) { var x = cellAt(tr, c); return classify(x ? textOf(x) : ''); });
      if (columnType(values) === 'num') out.push(c);
    });
    return out;
  }
  // The decimals a column shows: data-decimals on the th, else on the table, else the most any of its values shows.
  function decimalsFor(table, c) {
    var th = headerCells(table)[c], d = th.getAttribute('data-decimals');
    if (d === null) d = table.getAttribute('data-decimals');
    if (d !== null && /^\d+$/.test(d)) return +d;
    var most = 0;
    bodyRows(table).concat(kids(table.tFoot, ['TR'])).forEach(function (tr) {
      var x = cellAt(tr, c);
      if (x && !(wrote.get(x) || {}).sum) most = Math.max(most, decimalsOf(textOf(x)));
    });
    return most;
  }
  function formatTable(table) {
    var cols = formatColumns(table);
    if (!cols.length) return;
    var rows = bodyRows(table).concat(kids(table.tFoot, ['TR']));
    cols.forEach(function (c) {
      var decimals = decimalsFor(table, c);
      rows.forEach(function (tr) {
        if (isGroupRow(tr)) return;
        var cell = cellAt(tr, c);
        if (!cell || cell.querySelector(CONTROLS_SEL)) return;
        var rec = wrote.get(cell), text = textOf(cell), raw;
        if (rec && rec.sum) return;                     // a sum is written by the sum step, formatted as the column is
        if (rec) { if (tidy(text) === rec.text) return; raw = tidy(text); }   // the producer rewrote it: read it again
        else { if (cell.hasAttribute('data-raw')) return; raw = tidy(text); }  // the author's data-raw is never touched
        var formatted = formatNumber(raw, decimals);
        if (formatted === null) return;
        cell.setAttribute('data-raw', raw);
        if (formatted !== raw) writeText(cell, formatted);
        wrote.set(cell, { raw: raw, text: formatted });
      });
    });
  }

  // Each td.estate-sum in a totals row (body or tfoot) takes the sum of its column over the rows that pass the filters,
  // across every page; written as the column is formatted, with data-raw holding the plain sum for the copy and the export.
  function sumTable(table, pass) {
    var sums = Array.prototype.filter.call(table.querySelectorAll('tr.estate-total > td.estate-sum, tr.estate-total > th.estate-sum'), function (td) { return td.closest('table') === table; });
    if (!sums.length || !wrote) return;
    var formatted = formatColumns(table);
    sums.forEach(function (td) {
      var tr = td.parentNode, col = columnStarts(tr)[cells(tr).indexOf(td)];
      var values = [], most = 0;
      pass.forEach(function (row) {
        var x = cellAt(row, col); if (!x) return;
        var t = tidy(textOf(x)), n = t === '' || asPhone(t) !== null || asDate(t) !== null || /^0\d/.test(t) ? null : asNumber(t);
        if (n === null) return;
        values.push(n); most = Math.max(most, decimalsOf(t));
      });
      var decimals = formatted.indexOf(col) !== -1 ? decimalsFor(table, col) : most, scale = Math.pow(10, decimals);
      var sum = values.reduce(function (acc, n) { return acc + Math.round(n * scale); }, 0) / scale;
      var text = (sum < 0 ? '-' : '') + groupNumber(Math.abs(sum), decimals), raw = (sum < 0 ? '-' : '') + fixedHalfUp(Math.abs(sum), decimals);
      td.setAttribute('data-raw', raw);
      var rec = wrote.get(td);
      if (!rec || rec.text !== text || tidy(textOf(td)) !== text) writeText(td, text);
      wrote.set(td, { raw: raw, text: text, sum: true });
    });
  }

  // ---- page (estate-page, data-page-size, data-page-sizes, data-store) -----------------------------------------------------

  function footerOf(table) {
    var box = boxOf(table), f;
    if (box) {
      f = box.querySelector(':scope > .estate-table-footer');
      if (!f) { f = document.createElement('div'); f.className = 'estate-table-footer'; box.appendChild(f); }
      return f;
    }
    f = table.nextElementSibling;
    if (f && f.classList.contains('estate-table-note')) return f;
    f = document.createElement('div'); f.className = 'estate-table-note';
    table.parentNode.insertBefore(f, table.nextSibling);
    return f;
  }

  // The pager is built even with no rows ("0 rows"), and its parts are never built twice.
  function enablePage(table) {
    var st = state(table);
    if (st.page || !table.parentNode) return true;
    var sizes = (table.getAttribute('data-page-sizes') || '5 10 20 50 100').split(/\s+/).map(Number).filter(function (n) { return n > 0; });
    if (!sizes.length) sizes = [20];
    var store = storeOf(table), size = store && store.size > 0 ? +store.size : +(table.getAttribute('data-page-size') || sizes[0]);
    if (!(size > 0)) size = sizes[0];
    if (sizes.indexOf(size) === -1) sizes.push(size), sizes.sort(function (a, b) { return a - b; });
    var pager = document.createElement('span');
    pager.className = 'estate-table-pager';
    var select = document.createElement('select');
    select.className = 'estate-table-page-size';
    select.setAttribute('aria-label', 'Rows per page');
    tip(select, 'Rows per page');
    sizes.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; if (n === size) o.selected = true; select.appendChild(o); });
    var prev = document.createElement('button'), next = document.createElement('button'), count = document.createElement('span');
    prev.type = next.type = 'button';
    prev.className = 'estate-table-page-prev'; next.className = 'estate-table-page-next'; count.className = 'estate-table-page-count';
    prev.setAttribute('aria-label', 'Previous page'); next.setAttribute('aria-label', 'Next page');
    tip(prev, 'Previous page'); tip(next, 'Next page');
    pager.appendChild(select); pager.appendChild(prev); pager.appendChild(count); pager.appendChild(next);
    footerOf(table).appendChild(pager);
    st.page = { size: size, at: 0, pager: pager, count: count, prev: prev, next: next };
    select.addEventListener('change', function () {
      st.page.size = +select.value; st.page.at = 0;
      if (store) { store.size = st.page.size; saveStore(table); }
      quiet(table, function () { refilter(table); });
    });
    prev.addEventListener('click', function () { if (st.page.at > 0) { st.page.at--; quiet(table, function () { refilter(table); }); } });
    next.addEventListener('click', function () { st.page.at++; quiet(table, function () { refilter(table); }); });
    return true;
  }

  // ---- drop the columns that hold nothing (estate-drop-empty) -------------------------------------------------------

  // A column whose every data cell is empty is
  // hidden — never deleted, so sorting, filtering and copying keep their column numbers. Only DATA rows are evidence:
  // a total (tfoot, or tr.estate-total) shows 0.00 under a blank column, and a group band spans the table. Any element
  // in a cell is content (an icon column stays). It leaves alone a table with no data rows, a data row with a colspan
  // (a cell cannot be pinned to one column), and never hides every column. A row that spans columns (total, band) loses
  // one from a span for each hidden column it covers. Every pass starts from the original table, and the rows judged are
  // the ones the filters leave (across every page) — so a column a filter empties goes, and comes back when the filter
  // lets a filled row back in. A column whose header wears estate-keep stays whatever its cells hold.
  // CONTENT and filled() are in the core (above): the React renderer reads a cell the same way.
  function width(tr) { return cells(tr).reduce(function (n, c) { return n + (c.colSpan || 1); }, 0); }

  function dropEmpty(table) {
    var heads = kids(table.tHead, ['TR']), body = bodyRows(table), foot = kids(table.tFoot, ['TR']);
    var all = heads.concat(body, foot);
    // Back to the author's table first, spans included (remembered on the cell the first time it is touched).
    all.forEach(function (tr) {
      cells(tr).forEach(function (c) {
        if (!c.hasAttribute('data-estate-span')) c.setAttribute('data-estate-span', String(c.colSpan || 1));
        c.hidden = false;
        c.colSpan = parseInt(c.getAttribute('data-estate-span'), 10) || 1;
      });
    });
    var head = headerCells(table), cols = head.length;
    if (!cols || head.some(function (c) { return (c.colSpan || 1) !== 1; })) return;
    var data = dataRows(table);
    if (!data.length) return;
    var straight = data.every(function (tr) { var c = cells(tr); return c.length === cols && c.every(function (x) { return (x.colSpan || 1) === 1; }); });
    if (!straight) return;
    var st = table.__estateFilter, showing = st && st.pass ? st.pass : data.filter(function (tr) { return !tr.hidden; });
    var judged = showing.length ? showing : data;   // a filter that matched nothing is no evidence of an empty column
    var gone = [];
    for (var c = 0; c < cols; c++) {
      if (head[c].classList.contains('estate-keep')) continue;
      if (!judged.some(function (tr) { return filled(cells(tr)[c]); })) gone.push(c);
    }
    if (!gone.length || gone.length >= cols) return;
    all.forEach(function (tr) {
      var cs = cells(tr);
      if (cs.length === cols && cs.every(function (x) { return (x.colSpan || 1) === 1; })) {
        gone.forEach(function (g) { cs[g].hidden = true; });   // header rows, the filter row, data rows
        return;
      }
      if (width(tr) !== cols) return;   // a row of another width describes another table
      // One pass over the row's original layout: each cell loses one per hidden column it covers.
      var at = 0;
      cs.forEach(function (cell) {
        var span = cell.colSpan || 1, lost = 0;
        for (var k = at; k < at + span; k++) if (gone.indexOf(k) !== -1) lost++;
        if (lost === span) cell.hidden = true; else if (lost) cell.colSpan = span - lost;
        at += span;
      });
    });
  }

  // ---- copy ----------------------------------------------------------------------------------------------------------

  // The rows a copy and an export carry: the filters' pass of the table they read (data-source's own when it names one);
  // nothing filtered, none are named and the copy keeps every row that is not hidden.
  function carried(table) { var st = sourceOf(table).__estateFilter; return st && st.pass ? st.pass : null; }

  // The button copies the whole table, so it rides what names the whole table: the estate title band's actions
  // (made if absent), else a <caption>, else the table's own bar (the filter's, or one made for it).
  function placeButton(table, b, after) {
    var box = boxOf(table);
    var band = box && box.querySelector(':scope > .estate-table-title');
    if (band) {
      var actions = band.querySelector(':scope > .estate-table-actions');
      if (!actions) { actions = document.createElement('div'); actions.className = 'estate-table-actions'; band.appendChild(actions); }
      // The band's order: New first, then the table's verbs (copy, Excel, the author's) — after a leading estate-new, else first.
      var lead = actions.firstElementChild;
      if (after && after.parentNode === actions) actions.insertBefore(b, after.nextSibling);
      else actions.insertBefore(b, lead && lead.classList.contains('estate-new') ? lead.nextSibling : actions.firstChild);
    } else if (table.caption) {
      table.caption.appendChild(b);
    } else {
      var bar = box ? box.querySelector(':scope > .estate-table-filter') : table.previousElementSibling;
      if (!bar || !bar.classList.contains('estate-table-filter')) { bar = document.createElement('div'); bar.className = 'estate-table-filter'; placeBar(table, bar); }
      bar.appendChild(b);
    }
  }

  // The press's outcome on a button: copied (or written) for a moment, or failed — then the button is itself again.
  function outcome(b, ok, text, restore) {
    b.classList.add(ok ? 'estate-copied' : 'estate-copy-failed'); tip(b, text);
    setTimeout(function () { b.classList.remove('estate-copied', 'estate-copy-failed'); tip(b, restore); }, 1200);
  }

  var COPY_TIP = 'Copy the table — paste into a spreadsheet or an email';
  var COPY_ALL_TIP = 'Copy every table here — paste into a spreadsheet or an email';

  // estate-copy-box (one set of copy icons for a box of several tables, not one per table): on an .estate-table-box, ONE copy button and ONE HTML copy button on the box's band copy every table in the
  // box that asks for them, in order, and no table in it draws its own. The box's button is made once, by the first
  // such table that has rows; a press reads the tables as they are then.
  function copyBox(table) { var box = table.closest('.estate-table-box'); return box && box.classList.contains('estate-copy-box') ? box : null; }
  function boxTables(box, cls) {
    return Array.prototype.filter.call(box.querySelectorAll('table.' + cls), function (t) { return t.closest('.estate-table-box') === box && bodyRows(t).length; });
  }
  // The box's button for one kind: made on the band (the box's first table places it there), or the one already made.
  function boxButton(table, box, key, cls, tipText, press) {
    if (box[key]) return true;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    tip(b, tipText);
    b.setAttribute('aria-label', tipText);
    b.addEventListener('click', function () {
      press().then(function () { outcome(b, true, 'Copied', tipText); }, function () { outcome(b, false, 'Copy failed — the browser refused the clipboard', tipText); });
    });
    placeButton(box.querySelector('table'), b, key === '__estateMarkupAll' ? box.__estateCopyAll : null);
    box[key] = b;
    return true;
  }

  function enableCopy(table) {
    if (!bodyRows(table).length) return false;
    var box = copyBox(table);
    if (box) return boxButton(table, box, '__estateCopyAll', 'estate-table-copy', COPY_ALL_TIP, function () {
      var all = boxTables(box, 'estate-copy');
      return toClipboard(all.map(function (t) { return styledHtml(bare(t, carried(t))); }).join('\n'),
                         all.map(function (t) { return tsv(bare(t, carried(t))); }).join('\n\n'));
    });
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'estate-table-copy';
    tip(b, COPY_TIP);
    b.setAttribute('aria-label', COPY_TIP);
    b.addEventListener('click', function () {
      var rows = carried(table), bb = bare(table, rows);
      toClipboard(styledHtml(bb), tsv(bare(table, rows))).then(function () {
        outcome(b, true, 'Copied', COPY_TIP);
      }, function () {
        outcome(b, false, 'Copy failed — the browser refused the clipboard', COPY_TIP);
      });
    });
    placeButton(table, b);
    state(table).copyButton = b;
    return true;
  }

  var MARKUP_TIP = 'Copy as HTML — paste into a page\'s source as tags';
  var MARKUP_ALL_TIP = 'Copy every table here as HTML — paste into a page\'s source as tags';

  // estate-copy-markup: the table the copy carries, as its HTML, as text (markupOf) — after the copy button.
  function enableMarkup(table) {
    if (!bodyRows(table).length) return false;
    var box = copyBox(table);
    if (box) return boxButton(table, box, '__estateMarkupAll', 'estate-table-markup', MARKUP_ALL_TIP, function () {
      return textToClipboard(boxTables(box, 'estate-copy-markup').map(function (t) { return markupOf(bare(t, carried(t))); }).join('\n\n'));
    });
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'estate-table-markup';
    tip(b, MARKUP_TIP);
    b.setAttribute('aria-label', MARKUP_TIP);
    b.addEventListener('click', function () {
      textToClipboard(markupOf(bare(table, carried(table)))).then(function () {
        outcome(b, true, 'Copied', MARKUP_TIP);
      }, function () {
        outcome(b, false, 'Copy failed — the browser refused the clipboard', MARKUP_TIP);
      });
    });
    var st = state(table);
    placeButton(table, b, st.copyButton);
    st.markupButton = b;
    return true;
  }

  // ---- the workbook (estate-excel; data-excel-href) -------------------------------------------------------------------------

  var EXCEL_TIP = 'Download the table as an Excel workbook';

  // Built where the copy button goes, after it when there is one; asked again when rows come, or a writer does.
  function enableExcel(table) {
    var st = state(table);
    if (st.excel) return true;
    if (!bodyRows(table).length) return false;
    var href = table.getAttribute('data-excel-href'), el;
    if (href) {
      el = document.createElement('a');
      el.href = href;
      var title = table.getAttribute('data-excel-title') || 'Download the workbook';
      tip(el, title); el.setAttribute('aria-label', title);
    } else {
      if (!writerOf()) return false;
      el = document.createElement('button');
      el.type = 'button';
      tip(el, EXCEL_TIP); el.setAttribute('aria-label', EXCEL_TIP);
      el.addEventListener('click', function () {
        el.classList.add('estate-busy');
        writeWorkbook(table, el, carried(table)).then(function () { outcome(el, true, 'Written', EXCEL_TIP); }, function () { outcome(el, false, 'The workbook could not be written', EXCEL_TIP); })
          .then(function () { el.classList.remove('estate-busy'); });
      });
    }
    el.className = 'estate-table-excel';
    placeButton(table, el, st.markupButton || st.copyButton);
    st.excel = el;
    return true;
  }

  // ---- the peek card (data-peek) -----------------------------------------------------------------------------------------

  // One card per page; each address fetched once as the page itself would, and kept for the page's life.
  var peekCard = null, peekCache = {}, peekShown = null;
  function cardOf() {
    if (peekCard) return peekCard;
    peekCard = document.createElement('div');
    peekCard.className = 'estate-table-peek';
    peekCard.hidden = true;
    document.body.appendChild(peekCard);
    return peekCard;
  }
  function fetchPeek(url) {
    if (!peekCache[url]) {
      peekCache[url] = fetch(url, { credentials: 'same-origin' }).then(function (r) {
        return r.text().then(function (t) { return { status: r.status, ok: r.ok, html: /text\/html/i.test(r.headers.get('content-type') || ''), body: t }; });
      }, function () { return { status: 0 }; });
    }
    return peekCache[url];
  }
  function placeCard(card, td) {
    var r = td.getBoundingClientRect(), gap = 4, w = card.offsetWidth, h = card.offsetHeight;
    var left = r.right + gap, top = r.top;
    if (left + w > window.innerWidth) { left = r.left - gap - w; }
    if (left < 0) { left = Math.max(0, r.left); top = r.bottom + gap; }
    if (top + h > window.innerHeight) top = Math.max(0, window.innerHeight - h);
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }
  function showPeek(td) {
    var url = td.getAttribute('data-peek');
    peekShown = td;
    fetchPeek(url).then(function (r) {
      if (peekShown !== td) return;
      var card = cardOf();
      if (r.status === 0) card.textContent = 'the door did not answer';
      else if (!r.ok) card.textContent = 'the door answered ' + r.status;
      else if (r.html) card.innerHTML = r.body;
      else card.textContent = r.body;
      card.hidden = false;
      placeCard(card, td);
    });
  }
  function hidePeek() { peekShown = null; if (peekCard) peekCard.hidden = true; }
  function enablePeek(table) {
    var st = state(table);
    if (st.peek) return;
    st.peek = true;
    // Any element carrying data-peek inside the table — a cell, a header, a span or a div in a cell.
    var cellOf = function (e) { var el = e.target.closest && e.target.closest('[data-peek]'); return el && el.closest('table') === table ? el : null; };
    table.addEventListener('pointerover', function (e) { var td = cellOf(e); if (td && td !== peekShown) showPeek(td); });
    table.addEventListener('pointerout', function (e) { var td = cellOf(e); if (td && !(e.relatedTarget && td.contains(e.relatedTarget))) hidePeek(); });
    table.addEventListener('focusin', function (e) { var td = cellOf(e); if (td) showPeek(td); });
    table.addEventListener('focusout', function (e) { if (cellOf(e)) hidePeek(); });
  }
  document.addEventListener('scroll', hidePeek, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hidePeek(); });
  // Every data-peek element is in the focus order, so a keyboard reaches the card — on the rows there are now; one a
  // keyboard already reaches (a link, a button, a field) is left as it is.
  function prepPeek(table) {
    var any = false;
    Array.prototype.forEach.call(table.querySelectorAll('[data-peek]'), function (el) {
      if (el.closest('table') !== table) return;
      any = true;
      if (!el.hasAttribute('tabindex') && !el.matches('a[href], button, input, select, textarea')) el.setAttribute('tabindex', '0');
    });
    if (any) enablePeek(table);
  }

  // ---- the reader's column widths (estate-resize) --------------------------------------------------------------------------

  // A handle at the right edge of each labelled header; a drag sets the header's width inline (never below 2em), the
  // browser's own layout giving the column that width as far as its content allows. Remembered under data-store, by
  // column counted from 0; restored at decoration. A click on the handle does not sort.
  function enableResize(table) {
    var ths = headerCells(table), st = state(table);
    if (!ths.length) return false;
    if (st.resize) return true;
    st.resize = true;
    var store = storeOf(table), widths = store && store.widths ? store.widths : {};
    ths.forEach(function (th, c) {
      if (!labelOf(th)) return;
      if (widths[c] > 0) th.style.width = widths[c] + 'px';
      var handle = document.createElement('span');
      handle.className = 'estate-table-resize-handle';
      handle.setAttribute('aria-hidden', 'true');
      tip(handle, 'Drag to make the column wider or narrower');
      th.appendChild(handle);
      handle.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        st.dragging = true;
        var startX = e.clientX, startW = th.getBoundingClientRect().width, min = parseFloat(getComputedStyle(th).fontSize) * 2 || 16;
        var move = function (ev) { th.style.width = Math.max(min, startW + ev.clientX - startX) + 'px'; };
        var up = function () {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          if (store) { store.widths = store.widths || {}; store.widths[c] = Math.round(parseFloat(th.style.width)); saveStore(table); }
          quiet(table, function () { placePins(table); });
          setTimeout(function () { st.dragging = false; }, 0);   // the release's click comes first
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    });
    return true;
  }

  // ---- a cell that goes somewhere (data-href) --------------------------------------------------------------------------

  function enableHref(table) {
    var st = state(table);
    if (st.href) return;
    st.href = true;
    var cellOf = function (e) {
      var td = e.target.closest && e.target.closest('td[data-href]');
      if (!td || td.closest('table') !== table) return null;
      if (e.target.closest('a, button, input, select, textarea, label')) return null;   // a control in the cell is its own
      return td;
    };
    var open = function (td, newTab) {
      var href = td.getAttribute('data-href');
      if (newTab) window.open(href, '_blank'); else window.location.assign(href);
    };
    table.addEventListener('click', function (e) { var td = cellOf(e); if (td) { e.preventDefault(); open(td, e.ctrlKey || e.metaKey); } });
    table.addEventListener('auxclick', function (e) { var td = cellOf(e); if (td && e.button === 1) { e.preventDefault(); open(td, true); } });
    table.addEventListener('keydown', function (e) { if (e.key !== 'Enter') return; var td = e.target.closest && e.target.closest('td[data-href]'); if (td && td === e.target && td.closest('table') === table) { e.preventDefault(); open(td, false); } });
  }
  // Every data-href cell is in the focus order, so Enter can open it — on the rows there are now.
  function prepHref(table) {
    var any = false;
    Array.prototype.forEach.call(table.querySelectorAll('td[data-href]'), function (td) {
      if (td.closest('table') !== table) return;
      any = true;
      if (!td.hasAttribute('tabindex')) td.setAttribute('tabindex', '0');
    });
    if (any) enableHref(table);
  }

  // ---- the box's height (estate-sticky with data-rows or data-height) ------------------------------------------------------

  function applySticky(table) {
    var box = boxOf(table);
    if (!box || !box.classList.contains('estate-sticky')) return;
    var h = box.getAttribute('data-height'), n = box.getAttribute('data-rows');
    if (h) box.style.setProperty('--estate-table-sticky-h', h);
    else if (n && /^\d+$/.test(n)) box.style.setProperty('--estate-table-sticky-h', 'calc((' + n + ' + 1) * var(--estate-table-row-h))');
  }

  // ---- more than one pinned column (estate-pin) ----------------------------------------------------------------------------

  // The first pinned column keeps the stylesheet's offset 0; each later one is placed after the measured widths of the
  // pinned columns before it, on every cell of the column. Measured again whenever a width can change.
  function placePins(table) {
    var heads = headerCells(table), pinned = [];
    heads.forEach(function (th, i) { if (th.classList.contains('estate-pin')) pinned.push(i); });
    if (pinned.length < 2) return;
    var left = 0;
    pinned.forEach(function (col, k) {
      if (k > 0) {
        var px = left + 'px';
        ownRows(table).forEach(function (tr) { var c = cellAt(tr, col); if (c && c.classList.contains('estate-pin') && c.style.left !== px) c.style.left = px; });
      }
      left += heads[col].getBoundingClientRect().width;
    });
  }
  var pinnedTables = [];
  function watchPins(table) {
    var heads = headerCells(table);
    if (heads.filter(function (th) { return th.classList.contains('estate-pin'); }).length < 2) return;
    if (pinnedTables.indexOf(table) === -1) pinnedTables.push(table);
    if (window.ResizeObserver && !table.__estatePinWatch) {
      table.__estatePinWatch = new ResizeObserver(function () { quiet(table, function () { placePins(table); }); });
      table.__estatePinWatch.observe(table);
    }
  }
  window.addEventListener('resize', function () { pinnedTables.forEach(function (t) { if (t.isConnected) quiet(t, function () { placePins(t); }); }); });

  // ---- wiring --------------------------------------------------------------------------------------------------------

  // The controls, in the order they are built. A control that found no rows is built when rows come (an async page
  // draws its table empty and fills it later); one that was built is never built twice.
  var CONTROLS = [['estate-sort', enableSort], ['estate-filter', enableFilter],
                  ['estate-filter-columns', enableFilterColumns], ['estate-copy', enableCopy], ['estate-copy-markup', enableMarkup], ['estate-excel', enableExcel],
                  ['estate-page', enablePage], ['estate-resize', enableResize]];

  function build(table) {
    var built = table.__estateBuilt || (table.__estateBuilt = {});
    CONTROLS.forEach(function (c) {
      if (!built[c[0]] && table.classList.contains(c[0])) built[c[0]] = c[1](table) !== false;
    });
    if (table.hasAttribute('data-total')) barOf(table);
  }

  // The table's own changes — a sort moving rows, a number formatted — are not news: they are taken off the watcher's
  // queue as they are made, so the watcher answers only what the page did.
  function quiet(table, fn) {
    try { fn(); } finally { if (table.__estateWatch) table.__estateWatch.takeRecords(); }
  }

  // The whole state applied to the rows there are now: the opening order or the reader's sort, the formatting, the sums,
  // both filters, the page, the empty-column judgment, the pins (refilter places them, after every pass).
  function settle(table) {
    formatTable(table);
    var list = sortList(table);
    if ((list.length || openingList(table).length) && table.__estateBuilt['estate-sort']) applySort(table, list);
    prepHref(table);
    prepPeek(table);
    refilter(table);
  }

  // New rows meet the table's current state: their place in the author's order, the sort the reader chose, both
  // filters as typed, the empty-column judgement. Unsorted and with no opening order, the body's order IS the author's,
  // so every row is numbered afresh; otherwise a row the page added takes the next number, as if appended (applySort
  // does it), and a row the page kept keeps its number.
  function refresh(table) {
    // Only a table this script decorated: its mark is the empty value. Another renderer's table (the React renderer
    // writes data-estate-on="react") is that renderer's, and this script never builds on it.
    if (table.getAttribute('data-estate-on') !== '') return;
    quiet(table, function () {
      if (!sortList(table).length && !openingList(table).length) bodyRows(table).forEach(function (tr, i) { tr.setAttribute('data-estate-row', i); });
      build(table);
      settle(table);
    });
  }

  // A change is the body's when a tbody was added or removed, or the change is inside this table's own tbody — not a
  // nested table's, not the header (the filter row, its value lists) and not the caption (the copy button).
  function bodyChanged(table, rec) {
    if (rec.type === 'attributes') return false;
    if (rec.target === table) {
      return Array.prototype.some.call(rec.addedNodes, isTbody) || Array.prototype.some.call(rec.removedNodes, isTbody);
    }
    var el = rec.target.nodeType === 1 ? rec.target : rec.target.parentNode;
    var tb = el && el.closest('tbody');
    return !!tb && tb.parentNode === table;
  }
  function isTbody(n) { return n.nodeName === 'TBODY'; }

  // A producer that rewrites a header's class (a framework setting className) takes the script's state class with it;
  // the script puts it back.
  function restoreHeader(table, th) {
    if (!table.__estateBuilt || !table.__estateBuilt['estate-sort'] || headerCells(table).indexOf(th) === -1) return;
    var i = headerCells(table).indexOf(th), st = table.__estateFilter;
    if (!th.classList.contains('estate-no-sort') && labelOf(th) && th.querySelector('.estate-sort-mark') && !th.classList.contains('estate-sortable')) th.classList.add('estate-sortable');
    if (st && st.cols[i] && !th.classList.contains('estate-filtered')) th.classList.add('estate-filtered');
  }

  function watch(table) {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (recs) {
      try {
        recs.forEach(function (r) { if (r.type === 'attributes' && r.target.tagName === 'TH') restoreHeader(table, r.target); });
        if (recs.some(function (r) { return bodyChanged(table, r); })) refresh(table);
        else mo.takeRecords();
      } catch (e) { if (window.console) console.error('estate-table:', e); }
    });
    // Rows added, removed or replaced, a cell's text rewritten in place (a framework that reuses its rows), a header's
    // class rewritten.
    mo.observe(table, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    table.__estateWatch = mo;
  }

  function decorate(table) {
    if (table.hasAttribute('data-estate-on')) return;   // decorated already, by this script or another renderer
    table.setAttribute('data-estate-on', '');
    bodyRows(table).forEach(function (tr, i) { tr.setAttribute('data-estate-row', i); });
    build(table);
    settle(table);
    applySticky(table);
    watchPins(table);
    watch(table);
  }

  var SEL = 'table.estate-sort, table.estate-filter, table.estate-filter-columns, table.estate-drop-empty, table.estate-copy, table.estate-copy-markup, table.estate-excel, table.estate-page, table.estate-format, table.estate-resize, table[data-total]';
  // Declarations on a header, a cell or the box ask for the script too; :has() is not in every browser, so it is tried.
  var SEL_HAS = SEL + ', table.estate-table:has(th.estate-format, th.estate-pin, td.estate-sum, td[data-href], [data-peek]), .estate-table-box.estate-sticky:is([data-rows], [data-height]) table.estate-table';
  try { document.querySelector(SEL_HAS); SEL = SEL_HAS; } catch (e) { /* no :has(): those declarations wait for a table that also wears a class */ }

  // The tables under root (or root itself: an event may be dispatched on the table).
  function tablesIn(root) {
    var scope = root || document;
    var tables = Array.prototype.slice.call(scope.querySelectorAll(SEL));
    if (scope.matches && scope.matches(SEL)) tables.unshift(scope);
    return tables;
  }

  // One bad table never takes the rest of the page down with it.
  function each(tables, fn) {
    for (var i = 0; i < tables.length; i++) {
      try { fn(tables[i]); } catch (e) { if (window.console) console.error('estate-table:', e); }
    }
  }

  function init(root) { each(tablesIn(root), decorate); }

  // A page's own word that rows changed: decorates what is new, refreshes what was there.
  function refreshAll(root) { each(tablesIn(root), function (t) { if (t.hasAttribute('data-estate-on')) refresh(t); else decorate(t); }); }

  function scopeOf(e) { return e.target && e.target.querySelectorAll ? e.target : document; }

  window.EstateTable = { init: init, refresh: refreshAll, classify: classify, columnType: columnType, tooltip: setTitle };
  if (!MANUAL) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
    else init();
  }
  document.addEventListener('estate:tables-added', function (e) { init(scopeOf(e)); });
  document.addEventListener('estate:rows-changed', function (e) { refreshAll(scopeOf(e)); });
  // A workbook writer put on window.ExcelJS after the tables were drawn: every table is refreshed, so an estate-excel
  // table gains its button (the React renderer answers the same event for its own tables).
  window.addEventListener('estate:writer', function () { refreshAll(document); });
})();
