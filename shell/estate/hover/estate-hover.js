/* estate-hover — what the stylesheet cannot give the card: a place no frame can clip, and Escape.
 *
 * Contract and reasoning: estate-hover.md, beside this file. Published at
 * hover/estate-hover.js under the CDN's estate/ folder, unversioned. Hover, tap and keyboard opening are
 * estate-hover.css's and work without this file.
 *
 * WHERE THE CARD GOES IS FLOATING UI'S (MIT, floating-ui.com), not ours: below the trigger, flipped above
 * when it does not fit, shifted to stay in the window, and kept there while the page scrolls. The estate
 * serves its own copy at <CDN>/estate/vendor/floating-ui/<version>/, loaded from beside this file and
 * shared with estate-tip.js. Until it has loaded (or if it cannot), the card opens in place below its
 * trigger, as the stylesheet draws it.
 */
(function () {
  'use strict'

  var FLOATING_UI = '../vendor/floating-ui/1.8.0/'
  var base = document.currentScript && document.currentScript.src

  // One load of Floating UI per page, shared with estate-tip.js.
  function floatingUI () {
    if (window.FloatingUIDOM) return Promise.resolve(window.FloatingUIDOM)
    if (window.__estateFloatingUI) return window.__estateFloatingUI
    function load (file) {
      return new Promise(function (ok, fail) {
        var s = document.createElement('script')
        s.src = new URL(FLOATING_UI + file, base).href
        s.onload = ok; s.onerror = fail
        document.head.appendChild(s)
      })
    }
    window.__estateFloatingUI = load('floating-ui.core.umd.min.js')
      .then(function () { return load('floating-ui.dom.umd.min.js') })
      .then(function () { return window.FloatingUIDOM })
    return window.__estateFloatingUI
  }

  var fui = null
  var open = []   // [trigger, card, stop] for each card being kept in place

  function trigger (node) {
    return node && node.closest ? node.closest('.estate-hover') : null
  }

  function shown (card) {
    return getComputedStyle(card).display !== 'none'
  }

  // The card opens from the trigger's left edge, or its right with data-estate-hover-align="end" or where
  // the application's stylesheet anchors it right (the title bar's greeting); read once, before this
  // script's own inline left and right replace the stylesheet's.
  function placement (el, card) {
    if (!card.hasAttribute('data-estate-hover-side')) {
      var end = el.getAttribute('data-estate-hover-align') === 'end' || getComputedStyle(card).right !== 'auto'
      card.setAttribute('data-estate-hover-side', end ? 'bottom-end' : 'bottom-start')
    }
    return card.getAttribute('data-estate-hover-side')
  }

  function keep (el) {
    if (!fui) return
    var card = el.querySelector(':scope > .estate-hover-card')
    if (!card || !shown(card)) return
    for (var i = 0; i < open.length; i++) if (open[i][1] === card) return
    var side = placement(el, card)
    card.style.right = 'auto'
    function update () {
      fui.computePosition(el, card, {
        strategy: 'fixed',
        placement: side,
        middleware: [fui.offset(8), fui.flip({ padding: 8 }), fui.shift({ padding: 8 })]
      }).then(function (p) {
        card.style.left = p.x + 'px'
        card.style.top = p.y + 'px'
      })
    }
    open.push([el, card, fui.autoUpdate(el, card, update)])
  }

  // A card the stylesheet has closed (pointer gone, focus gone, Escape) stops being kept in place.
  function sweep () {
    requestAnimationFrame(function () {
      open = open.filter(function (o) {
        if (shown(o[1])) return true
        o[2]()
        return false
      })
    })
  }

  function opened (e) {
    var el = trigger(e.target)
    if (!el) return
    el.removeAttribute('data-estate-hover-closed')
    keep(el)   // the card is display:none until :hover or :focus-within applies, which it now does
  }

  document.addEventListener('pointerover', opened)
  document.addEventListener('focusin', opened)
  document.addEventListener('pointerout', function (e) {
    var el = trigger(e.target)
    if (el && !el.contains(e.relatedTarget)) el.removeAttribute('data-estate-hover-closed')
    sweep()
  })
  document.addEventListener('focusout', sweep)

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return
    var el = trigger(document.activeElement)
    var hovered = document.querySelectorAll('.estate-hover:hover')
    if (el) el.setAttribute('data-estate-hover-closed', '')
    for (var i = 0; i < hovered.length; i++) hovered[i].setAttribute('data-estate-hover-closed', '')
    sweep()
  })

  floatingUI().then(function (f) {
    fui = f
    document.documentElement.classList.add('estate-hover-js')
  }, function () { /* no Floating UI: the card opens in place, as the stylesheet draws it */ })
})()
