/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Ploutos Services LLC */
/* The estate title bar's weather slot — one control, every application that opts in.
 *
 * Published to titlebar/titlebar.js under the CDN's estate/ folder — unversioned, like the stylesheet.
 *
 * AN APPLICATION OPTS IN WITH ONE ELEMENT inside `.estate-bar-actions`:
 *
 *     <a class="estate-bar-weather" href="<its weather page, from its own configuration>"></a>
 *
 * and loads this file. The script fills the element (icon, temperature, what it means on hover);
 * the application carries no weather code of its own. Nothing here names a page of ours: where
 * the click goes is the href the application rendered.
 *
 * LOCATION IS ASKED FOR ONLY ON A CLICK, never on load. A browser keeps the location grant per
 * site, so an application that has never been granted it shows the icon and says, on hover, that
 * a click will ask; the first click asks instead of leaving. Once the answer is known the click
 * goes to the weather page. Every state names itself — a control that shows nothing is the
 * silence the bar forbids.
 */
(function () {
  'use strict'

  var COORDS_KEY = 'estate_wx_coords'   // this site's last fix, however old
  var TEMP_KEY = 'estate_wx_temp'       // the last reading, so a page load is not a forecast call
  var COORDS_FRESH = 24 * 60 * 60 * 1000
  var TEMP_FRESH = 30 * 60 * 1000

  var SUN = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" ' +
    'stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 ' +
    '1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 ' +
    '3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>'

  // What each state MEANS, said on hover. The temperature beside the icon is the state's face.
  // Non-ASCII is written as escapes, so the file reads the same whatever charset it is served with.
  var STATES = {
    loading:     { face: '',   tip: 'weather \u2014 reading the temperature' },
    shown:       { face: null, tip: 'weather \u2014 current conditions, tides and forecast' },
    ask:         { face: '',   tip: 'weather \u2014 click to show the temperature here (your browser will ask for your location)' },
    refused:     { face: '\u2014\u00b0', tip: 'no temperature \u2014 location was refused for this site; click for the weather page' },
    unavailable: { face: '\u2014\u00b0', tip: 'no temperature \u2014 the location or the forecast did not answer; click for the weather page' },
    unsupported: { face: '\u2014\u00b0', tip: 'no temperature \u2014 this browser gives no location; click for the weather page' },
  }

  function read(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch (e) { return null }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { /* no storage: the slot still works, uncached */ }
  }

  function paint(el, state, temp) {
    var s = STATES[state]
    el.setAttribute('data-state', state)
    el.setAttribute('data-estate-tip', s.tip)
    el.setAttribute('aria-label', s.tip)
    var face = s.face === null ? temp : s.face
    var span = el.querySelector('.estate-bar-weather-temp')
    span.textContent = face
    span.hidden = !face
  }

  function locate() {
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() }
          write(COORDS_KEY, fix)
          resolve(fix)
        },
        function (err) { reject(err && err.code === 1 ? 'refused' : 'unavailable') },
        { maximumAge: COORDS_FRESH, timeout: 15000 }
      )
    })
  }

  function temperature(fix) {
    var cached = read(TEMP_KEY)
    if (cached && Date.now() - cached.ts < TEMP_FRESH &&
        Math.abs(cached.lat - fix.lat) < 0.05 && Math.abs(cached.lon - fix.lon) < 0.05) {
      return Promise.resolve(cached.value)
    }
    return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + fix.lat + '&longitude=' + fix.lon +
                 '&current=temperature_2m&temperature_unit=fahrenheit')
      .then(function (r) { if (!r.ok) throw 'unavailable'; return r.json() })
      .then(function (d) {
        var t = d && d.current && d.current.temperature_2m
        if (typeof t !== 'number') throw 'unavailable'
        var value = Math.round(t) + '\u00b0F'
        write(TEMP_KEY, { value: value, ts: Date.now(), lat: fix.lat, lon: fix.lon })
        return value
      })
  }

  function show(el, fixPromise) {
    paint(el, 'loading')
    return fixPromise
      .then(temperature)
      .then(function (value) { paint(el, 'shown', value) })
      .catch(function (why) { paint(el, why === 'refused' ? 'refused' : 'unavailable') })
  }

  function permission() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('unknown')
    return navigator.permissions.query({ name: 'geolocation' })
      .then(function (p) { return p.state }, function () { return 'unknown' })
  }

  function start(el) {
    if (el.getAttribute('data-estate-weather') === 'on') return
    el.setAttribute('data-estate-weather', 'on')
    el.innerHTML = SUN + '<span class="estate-bar-weather-temp" hidden></span>'

    if (!navigator.geolocation) { paint(el, 'unsupported'); return }

    permission().then(function (state) {
      var fix = read(COORDS_KEY)
      if (state === 'denied') { paint(el, 'refused'); return }
      if (state === 'granted') {
        // A stale fix is refreshed quietly; the grant is already there, nobody is asked.
        show(el, fix && Date.now() - fix.ts < COORDS_FRESH ? Promise.resolve(fix) : locate())
        return
      }
      if (fix) { show(el, Promise.resolve(fix)); return }
      // Never granted on this site: the first click asks, and does not leave the page.
      paint(el, 'ask')
      el.addEventListener('click', function ask(e) {
        if (el.getAttribute('data-state') !== 'ask') return
        e.preventDefault()
        el.removeEventListener('click', ask)
        show(el, locate())
      })
    })
  }

  // THE GREETING: the time of day is the reader's clock, which only the browser
  // knows, so the application renders the first name and this says good morning, afternoon or evening. Only
  // the element's own text changes; its estate-hover card, a child element, is left as rendered.
  function greet(el) {
    var name = el.getAttribute('data-estate-first-name')
    var h = new Date().getHours()
    var text = (h < 12 ? 'Good morning, ' : h < 17 ? 'Good afternoon, ' : 'Good evening, ') + name
    var own = el.querySelector(':scope > .estate-bar-who-text')
    if (own) { own.textContent = text; return }
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) { n.nodeValue = text; return }
    }
    el.insertBefore(document.createTextNode(text), el.firstChild)
  }

  function startAll() {
    var els = document.querySelectorAll('a.estate-bar-weather')
    for (var i = 0; i < els.length; i++) start(els[i])
    var who = document.querySelectorAll('.estate-bar-who[data-estate-first-name]')
    for (var j = 0; j < who.length; j++) greet(who[j])
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAll)
  else startAll()
})()
