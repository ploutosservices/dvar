/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Ploutos Services LLC */
/* The estate weather — one script, rendered inside whichever application's shell asks for it
 * so every application can use the same one and keep its own menu to go back home.
 *
 *     import { mount } from '<CDN>/estate/weather/weather.js'
 *     mount(element)          // fills the element; call it once, when the element is first shown
 *
 * or put `data-estate-weather="now"` on an element and load this module: it mounts on load. That is
 * how estate/weather/index.html, the stand-alone page, uses it — one copy, two hosts.
 *
 * It holds no estate data: the reader's location, then three public services, and the moon and sun
 * times computed here with SunCalc 2.0.2, vendored beside the estate folder (../../suncalc/2.0.2/,
 * relative to this file, so the files work wherever they are hosted).
 *
 * IT CARRIES ITS OWN STYLING: a dozen
 * rules, injected once and scoped under .estate-weather, so it looks the same in any application —
 * Bootstrap, Tailwind or none — and touches nothing outside its own box. Fonts are inherited.
 */
import * as SunCalc from '../../suncalc/2.0.2/index.js'

const COORDS_KEY = 'estate_wx_coords'          // the title bar's key, so one fix serves both
const COORDS_TTL = 24 * 60 * 60 * 1000

function windDir(deg) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8] }

function weatherDesc(code) {
  if (code === 0)  return 'Clear sky'
  if (code === 1)  return 'Mainly clear'
  if (code === 2)  return 'Partly cloudy'
  if (code === 3)  return 'Overcast'
  if (code <= 48)  return 'Foggy'
  if (code <= 55)  return 'Drizzle'
  if (code === 61) return 'Light rain'
  if (code === 63) return 'Rain'
  if (code === 65) return 'Heavy rain'
  if (code <= 75)  return 'Snow'
  if (code <= 82)  return 'Rain showers'
  if (code <= 86)  return 'Snow showers'
  if (code <= 99)  return 'Thunderstorm'
  return ''
}

const hm = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function fmtTideTime(t) {
  const [datePart, timePart] = t.split(' ')
  const [h, m] = timePart.split(':').map(Number)
  const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  const today = new Date().toLocaleDateString('en-CA')
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA')
  if (datePart === today) return timeStr
  if (datePart === tomorrow) return `${timeStr} tomorrow`
  return `${timeStr} ${new Date(datePart + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

// A FULL MOON, not the new-moon epoch that looks like one — an earlier copy carried that bug until
// a reader saw it from the sky. 2000-01-21T04:41Z: SunCalc illumination 1.000.
const KNOWN_FULL_MOON = new Date('2000-01-21T04:41:00Z').getTime()
const CYCLE_MS = 29.530588 * 24 * 60 * 60 * 1000

// SunCalc scans the UTC day; the table means the reader's own day, which straddles two.
function moonsetOnLocalDay(date, lat, lon) {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end = start.getTime() + 24 * 3600 * 1000
  return [start, new Date(end - 1)]
    .map(d => SunCalc.getMoonTimes(d, lat, lon).set)
    .find(t => t !== undefined && t.getTime() >= start.getTime() && t.getTime() < end)
}

function getCoords() {
  try {
    const c = JSON.parse(localStorage.getItem(COORDS_KEY) || 'null')
    if (c && Date.now() - c.ts < COORDS_TTL) return Promise.resolve(c)
  } catch (e) { /* no storage: ask every time */ }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('this browser gives no location'))
    navigator.geolocation.getCurrentPosition(pos => {
      const c = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() }
      try { localStorage.setItem(COORDS_KEY, JSON.stringify(c)) } catch (e) { /* uncached */ }
      resolve(c)
    }, err => reject(new Error(err && err.code === 1
      ? 'location was refused for this site — allow it in the browser and try again'
      : 'the browser could not find your location')), { timeout: 15000 })
  })
}

async function json(url, opts) {
  const r = await fetch(url, opts)
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
  return r.json()
}

async function fetchWeather({ lat, lon }) {
  const q = unit => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto` + unit
  const geo = await json(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
                         { headers: { 'Accept-Language': 'en' } })
  const us = geo.address && geo.address.country_code === 'us'
  const wx = await json(q(us ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '&temperature_unit=celsius&wind_speed_unit=kmh'))
  const a = geo.address || {}
  return {
    place: [a.city || a.town || a.village || a.county || '', a.state || ''].filter(Boolean).join(', '),
    u: us ? '°F' : '°C', windUnit: us ? 'mph' : 'km/h',
    cur: wx.current, day: wx.daily,
  }
}

async function fetchTides({ lat, lon }) {
  const st = await json(`https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/tidepredstations.json?units=english&radius=50&lat=${lat}&lon=${lon}`)
  if (!st.stationList || !st.stationList.length) return null
  const station = st.stationList[0]
  const fmt = d => d.toISOString().split('T')[0].replace(/-/g, '')
  const today = new Date(), end = new Date(today); end.setDate(today.getDate() + 35)
  const p = await json(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${fmt(today)}&end_date=${fmt(end)}` +
    `&station=${station.stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=estate&format=json`)
  return p.predictions ? { name: station.stationName, preds: p.predictions } : null
}

// ── rendering: plain elements, its own classes, text set as text (nothing fetched is HTML) ──
const STYLE = `
.estate-weather { color: rgb(33 37 41); }
.estate-weather table { border-collapse: collapse; margin: 0 0 1rem; font-size: .875rem; }
.estate-weather th, .estate-weather td { border: 1px solid #dee2e6; padding: .25rem .5rem; text-align: left; vertical-align: top; }
.estate-weather th { font-weight: 600; }
.estate-weather .ew-dark th { background: rgb(33 37 41); color: #fff; border-color: rgb(55 59 62); }
.estate-weather .ew-head th { background: #e2e3e5; }
.estate-weather .ew-num { text-align: right; font-variant-numeric: tabular-nums; }
.estate-weather .ew-light { font-weight: 400; }
.estate-weather .ew-muted { color: #6c757d; }
.estate-weather .ew-small { font-size: .8125rem; }
.estate-weather .ew-pair { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; }
.estate-weather ul { margin: 0; padding-left: 1.25rem; }
`

function styleOnce() {
  if (document.getElementById('estate-weather-style')) return
  const s = document.createElement('style')
  s.id = 'estate-weather-style'
  s.textContent = STYLE
  document.head.appendChild(s)
}


function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
function tr(cells) { const r = el('tr'); cells.forEach(c => r.appendChild(c)); return r }
function td(text, cls) { return el('td', cls, text) }
function th(text, cls, span) { const c = el('th', cls, text); if (span) c.colSpan = span; return c }

function table(title, cols, rows, headCls) {
  const t = el('table')
  const head = el('thead', headCls)
  head.appendChild(tr([th(title, '', cols.length)]))
  if (cols.some(Boolean)) head.appendChild(tr(cols.map(c => th(c.text, c.cls))))
  const body = el('tbody')
  rows.forEach(r => body.appendChild(r))
  t.append(head, body)
  return t
}

export async function mount(root) {
  if (root.getAttribute('data-estate-weather-mounted')) return
  styleOnce()
  root.classList.add('estate-weather')
  root.setAttribute('data-estate-weather-mounted', '1')
  const status = el('p', 'ew-muted', 'Asking your browser for your location…')
  root.replaceChildren(status)
  try {
    const c = await getCoords()
    status.textContent = 'Reading the forecast…'
    const [wx, tides] = await Promise.all([fetchWeather(c), fetchTides(c).catch(() => null)])
    const { u, cur, day } = wx
    const muted = 'ew-muted'

    const summary = el('table')
    const sh = el('thead', 'ew-dark')
    sh.appendChild(tr([th(wx.place, '', 2), th(hm(new Date()), 'ew-num ew-light')]))
    const sb = el('tbody')
    ;[
      ['Conditions', `${Math.round(cur.temperature_2m)}${u} — ${weatherDesc(cur.weather_code)}`, `feels ${Math.round(cur.apparent_temperature)}${u}`],
      ['High / Low', `${Math.round(day.temperature_2m_max[0])}${u} / ${Math.round(day.temperature_2m_min[0])}${u}`, `humidity ${cur.relative_humidity_2m}%`],
      ['Wind', `${Math.round(cur.wind_speed_10m)} ${wx.windUnit} ${windDir(cur.wind_direction_10m)}`, ''],
      ['Sunrise', hm(new Date(day.sunrise[0])), `sunset ${hm(new Date(day.sunset[0]))}`],
    ].forEach(([a, b, x]) => sb.appendChild(tr([td(a), td(b), td(x, muted)])))
    summary.append(sh, sb)

    const moons = []
    const now = Date.now()
    let next = KNOWN_FULL_MOON + (Math.floor((now - KNOWN_FULL_MOON) / CYCLE_MS) + 1) * CYCLE_MS
    if (next - now < 12 * 3600 * 1000) next += CYCLE_MS
    for (let i = 0; i < 12; i++, next += CYCLE_MS) {
      const date = new Date(next)
      const dist = Math.round(SunCalc.getMoonPosition(date, c.lat, c.lon).distance)
      const set = moonsetOnLocalDay(date, c.lat, c.lon)
      const rise = SunCalc.getTimes(date, c.lat, c.lon).sunrise
      const tag = dist < 363000 ? ' super' : dist > 405000 ? ' micro' : ''
      moons.push(tr([
        td(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + tag),
        td(dist.toLocaleString(), 'ew-num'), td(set ? hm(set) : '—'), td(rise ? hm(rise) : '—'),
      ]))
    }
    const pair = el('div', 'ew-pair')
    pair.appendChild(table('Full Moons', [{ text: 'Full Moon' }, { text: 'Distance (km)', cls: 'ew-num' },
      { text: 'Moonset' }, { text: 'Sunrise' }], moons, 'ew-head'))

    let noTides = null
    if (tides) {
      const cutoff = Date.now() - 3600 * 1000
      const rows = tides.preds.filter(p => new Date(p.t.replace(' ', 'T')).getTime() >= cutoff)
        .map(p => tr([td(p.type === 'H' ? 'high' : 'low'), td(fmtTideTime(p.t)), td(parseFloat(p.v).toFixed(1), 'ew-num')]))
      pair.appendChild(table(`Tides — ${tides.name}`, [{ text: 'Type' }, { text: 'Time' }, { text: 'ft', cls: 'ew-num' }], rows, 'ew-head'))
    } else {
      noTides = el('p', `${muted} ew-small`, 'Tides: NOAA has no tide station within 50 miles of here.')
    }

    const src = el('ul', `${muted} ew-small`)
    ;['GET https://api.open-meteo.com/v1/forecast (conditions + forecast)',
      'GET https://nominatim.openstreetmap.org/reverse (place name)',
      'GET https://api.tidesandcurrents.noaa.gov (tide stations + predictions)',
      'moon/sun times computed in the browser (SunCalc 2.0.2)'].forEach(s => src.appendChild(el('li', '', s)))

    root.replaceChildren(summary, pair, ...(noTides ? [noTides] : []), el('p', `${muted} ew-small`, 'Sources:'), src)
  } catch (e) {
    status.textContent = 'No weather: ' + (e && e.message ? e.message : e)
    root.removeAttribute('data-estate-weather-mounted')   // a later open tries again
  }
}

document.querySelectorAll('[data-estate-weather="now"]').forEach(e => mount(e))
