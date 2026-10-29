/* estate-tip — the sentence drawn where no frame can clip it.
 *
 * Contract and reasoning: estate-tip.md, beside this file. Published at
 * tip/estate-tip.js under the CDN's estate/ folder, unversioned. Without this file estate-tip.css draws
 * the sentence as the element's own ::after, which any ancestor with overflow hidden or auto clips (a
 * table's scroll box, a scrolling side nav). With it, one bubble at the end of <body>, position fixed,
 * carries the sentence above everything; the ::after is switched off by the class this sets on <html>.
 *
 * WHERE THE BUBBLE GOES IS FLOATING UI'S (MIT, floating-ui.com), not ours: below by preference, flipped
 * above when it does not fit, shifted to stay in the window. The estate serves its own copy at
 * <CDN>/estate/vendor/floating-ui/<version>/, loaded from beside this file. Until it has loaded (or if it
 * cannot), the stylesheet's ::after still draws every sentence. What is ours is the contract and the
 * closing: everything that can end a hover closes the bubble, not only the pointer leaving.
 */
(function () {
  'use strict'

  var FLOATING_UI = '../vendor/floating-ui/1.8.0/'
  var base = document.currentScript && document.currentScript.src

  // One load of Floating UI per page, shared with estate-hover.js.
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

  var fui = null, bubble = null, anchor = null

  function make () {
    bubble = document.createElement('div')
    bubble.className = 'estate-tip-bubble'
    bubble.setAttribute('aria-hidden', 'true')   // the sentence restates the control's aria-label
    document.body.appendChild(bubble)
  }

  function open (el) {
    var text = el.getAttribute('data-estate-tip')
    if (!text || !fui) return
    if (!bubble) make()
    anchor = el
    bubble.textContent = text
    bubble.hidden = false
    var end = el.getAttribute('data-estate-tip-align') === 'end'
    fui.computePosition(el, bubble, {
      strategy: 'fixed',
      placement: end ? 'bottom-end' : 'bottom-start',
      middleware: [fui.offset(6), fui.flip({ padding: 8 }), fui.shift({ padding: 8 })]
    }).then(function (p) {
      if (anchor !== el) return
      bubble.style.left = p.x + 'px'
      bubble.style.top = p.y + 'px'
    })
  }

  function close () {
    if (bubble) bubble.hidden = true
    anchor = null
  }

  function tipped (node) {
    return node && node.closest ? node.closest('[data-estate-tip]') : null
  }

  document.addEventListener('pointerover', function (e) {
    var el = tipped(e.target)
    if (el && el !== anchor) open(el)
  })
  document.addEventListener('focusin', function (e) {
    var el = tipped(e.target)
    if (el && el.matches(':focus-visible')) open(el)
  })
  document.addEventListener('focusout', function (e) { if (tipped(e.target) === anchor) close() })

  // EVERYTHING THAT ENDS A HOVER. A fixed bubble does not travel with the page, and pointerleave can
  // simply never arrive (the window loses focus with the pointer still, a click opens another tab), so
  // any pointer movement off the element closes it, and so do a scroll, a resize, a click, Escape and
  // the page being hidden.
  document.addEventListener('pointermove', function (e) {
    if (anchor && !anchor.contains(e.target)) close()
  })
  document.addEventListener('pointerdown', close)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
  document.addEventListener('visibilitychange', function () { if (document.hidden) close() })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close() })

  floatingUI().then(function (f) {
    fui = f
    document.documentElement.classList.add('estate-tip-js')
  }, function () { /* no Floating UI: the stylesheet's ::after keeps drawing every sentence */ })
})()
