/* estate-print — the three corners of a printed sheet that a stylesheet cannot know.
 *
 * Contract and reasoning: estate-print.md, beside this file. Published at
 * print/estate-print.js under the CDN's estate/ folder, unversioned. On the browser's beforeprint it reads
 * the page and writes an @page rule whose margin boxes carry, as text: the tenant and the page's title (top
 * left), the page's address (top right), and when and by whom it was printed (bottom left). The bottom
 * right, Page N of M, is estate-print.css's. The rule is removed on afterprint.
 */
(function () {
  'use strict'

  var ID = 'estate-print-corners'
  var BOX = 'font-family: system-ui, sans-serif; font-size: 8pt; color: rgb(71 85 105);'

  function text (sel) {
    var el = document.querySelector(sel)
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''
  }

  // A CSS string: backslash, double quote and line breaks escaped, so nothing on the page can end it.
  function quoted (s) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"'
  }

  function corners () {
    var tenant = text('.estate-bar-context') || text('.estate-bar-app')
    var title = text('h1') || document.title
    var bar = document.querySelector('.estate-bar')
    var who = bar ? (bar.getAttribute('data-estate-print-who') || '').trim() : ''
    var when = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    var left = [tenant, title].filter(Boolean).join(' \u00b7 ')
    var printed = 'Printed ' + when + (who ? ' by ' + who : '')
    return '@page {' +
      ' @top-left { content: ' + quoted(left) + '; ' + BOX + ' }' +
      ' @top-right { content: ' + quoted(location.href) + '; ' + BOX + ' }' +
      ' @bottom-left { content: ' + quoted(printed) + '; ' + BOX + ' } }'
  }

  window.addEventListener('beforeprint', function () {
    var style = document.getElementById(ID)
    if (!style) {
      style = document.createElement('style')
      style.id = ID
      document.head.appendChild(style)
    }
    style.textContent = corners()
  })

  window.addEventListener('afterprint', function () {
    var style = document.getElementById(ID)
    if (style) style.remove()
  })
})()
