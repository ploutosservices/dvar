// Copyright 2026 Ploutos Services LLC
// SPDX-License-Identifier: Apache-2.0
//
// A sample house in Node: the same accession as the Python house, in another language, to show the rules are
// language-neutral. Sign in only at the door (OIDC code flow with PKCE); wear the bar; plug a print action into
// the bar; wear the footer with its version; end its session on the door's back-channel logout; declare itself
// (/manifest.json, /health). It reaches bhandara and dakiya with its OWN client certificate, through the proxy.
// The weather slot is opt-in here as in the Python house (HOUSE_WEATHER=on), off by default. Node's built-ins only.
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')

const E = process.env
const CLIENT = E.HOUSE_CLIENT_ID
const NAME = E.HOUSE_DISPLAY_NAME
const BASE = E.HOUSE_BASE_URL.replace(/\/+$/, '')
const ISSUER = E.DOOR_ISSUER.replace(/\/+$/, '')
const SECRET = E.HOUSE_CLIENT_SECRET   // read from the environment, not a value — pragma: allowlist secret
const CDN = E.SHELL_URL.replace(/\/+$/, '')
const ENVIRONMENT = E.HOUSE_ENVIRONMENT
const COLOUR = E.HOUSE_ENV_COLOUR || ''
const TENANT = E.HOUSE_TENANT || ''
const OTHER = JSON.parse(E.HOUSE_OTHERS || '[]')
const BHANDARA = E.BHANDARA_URL.replace(/\/+$/, '')
const DAKIYA = E.DAKIYA_URL.replace(/\/+$/, '')
const WEATHER = (E.HOUSE_WEATHER || 'off') === 'on'
const VERSION = '0.1.0'

const CA = fs.readFileSync(E.DEMO_CA)                                   // trust the demo's CA, as neenv says
const DOOR_AGENT = new https.Agent({ ca: CA })
const SERVICE_AGENT = new https.Agent({ ca: CA, cert: fs.readFileSync(E.HOUSE_CERT), key: fs.readFileSync(E.HOUSE_KEY) })

const SESSIONS = new Map()   // cookie -> { name, email, sub, sid, idToken, csrf }
const PENDING = new Map()    // state  -> { verifier, nonce, at }
let META = null

function request (url, { method = 'GET', body = null, headers = {}, agent = DOOR_AGENT } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, agent, timeout: 15000 }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    if (body) req.write(body)
    req.end()
  })
}

async function meta () {
  if (!META) META = JSON.parse((await request(ISSUER + '/.well-known/openid-configuration')).body)
  return META
}

const b64url = b => Buffer.from(b).toString('base64url')
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const aud = c => (typeof c.aud === 'string' ? [c.aud] : c.aud || [])

// The token's claims, if the door signed it (RS256, a key from the door's JWKS); else null.
async function verified (jwt) {
  const parts = String(jwt).split('.')
  if (parts.length !== 3) return null
  const head = JSON.parse(Buffer.from(parts[0], 'base64url'))
  if (head.alg !== 'RS256') return null
  const { keys } = JSON.parse((await request((await meta()).jwks_uri)).body)
  const jwk = keys.find(k => k.kid === head.kid && k.kty === 'RSA')
  if (!jwk) return null
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))
  return ok ? JSON.parse(Buffer.from(parts[1], 'base64url')) : null
}

function cookieOf (req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)house_node=([^;]+)/)
  return m ? m[1] : ''
}

function page (s, body) {
  const jump = OTHER.map(o => `<a href="${esc(o.url)}" data-estate-tip="Open ${esc(o.name)}">${esc(o.name)}</a>`).join('')
  const exits = s ? `<span class="estate-bar-who" data-estate-first-name="${esc(s.name)}">Hello, ${esc(s.name)}</span>` +
    `<a class="estate-bar-exit" href="${ISSUER}/account" data-estate-tip="where am I signed in">Account</a>` +
    '<a class="estate-bar-exit" href="/logout" data-estate-tip="sign out">Sign out</a>' : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(NAME)}</title>
<link rel="stylesheet" href="${CDN}/estate/titlebar/titlebar.css">
<link rel="stylesheet" href="${CDN}/estate/tip/estate-tip.css">
<link rel="stylesheet" href="${CDN}/estate/print/estate-print.css">
<style>body{margin:0;font-family:system-ui,sans-serif} main{padding:1rem 16px;max-width:48rem}
footer.house-footer{padding:1rem 16px;color:#475569;font-size:.875rem;border-top:1px solid #e2e8f0}</style>
</head><body>
<header class="estate-bar" data-env="${esc(ENVIRONMENT)}"${COLOUR ? ` style="--estate-env-color: ${esc(COLOUR)}"` : ''}>
  <a class="estate-bar-logo" href="/"><img src="${CDN}/estate/icons/home.svg" alt="${esc(NAME)}"></a>
  <div class="estate-bar-main">
    <span class="estate-bar-app">${esc(NAME)}</span>
    <span class="estate-bar-context">${esc(TENANT)}</span>
    <span class="estate-bar-env">${ENVIRONMENT === 'production' ? '' : esc(ENVIRONMENT.toUpperCase())}</span>
    <div class="estate-bar-spacer"></div>
    <nav class="estate-bar-jump">${jump}</nav>
    <div class="estate-bar-actions">
      <a href="#" onclick="window.print();return false" data-estate-tip="print this page" aria-label="print"><img src="${CDN}/estate/icons/print.svg" alt=""></a>
      ${WEATHER ? `<a class="estate-bar-weather" href="${CDN}/estate/weather/"></a>` : ''}
    </div>
    ${exits}
  </div>
</header>
<main>${body}</main>
<footer class="house-footer">${esc(NAME)} ${VERSION} · ${esc(ENVIRONMENT)}</footer>
<script src="${CDN}/estate/titlebar/titlebar.js"></script>
<script src="${CDN}/estate/vendor/floating-ui/1.8.0/floating-ui.core.umd.min.js"></script>
<script src="${CDN}/estate/vendor/floating-ui/1.8.0/floating-ui.dom.umd.min.js"></script>
<script src="${CDN}/estate/tip/estate-tip.js"></script>
<script src="${CDN}/estate/print/estate-print.js"></script>
</body></html>`
}

function send (res, code, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers })
  res.end(body)
}
const json = (res, code, obj, headers) => send(res, code, JSON.stringify(obj), 'application/json', headers)
const redirect = (res, url, headers = {}) => send(res, 302, '', 'text/plain', { Location: url, ...headers })

function readBody (req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}

async function login (res) {
  const state = b64url(crypto.randomBytes(16)); const nonce = b64url(crypto.randomBytes(16))
  const verifier = b64url(crypto.randomBytes(48))
  PENDING.set(state, { verifier, nonce, at: Date.now() })
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const q = new URLSearchParams({ client_id: CLIENT, response_type: 'code', scope: 'openid email profile',
    redirect_uri: BASE + '/callback', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })
  redirect(res, (await meta()).authorization_endpoint + '?' + q)
}

async function callback (res, q) {
  const p = PENDING.get(q.get('state') || ''); PENDING.delete(q.get('state') || '')
  if (!p || Date.now() - p.at > 600000 || !q.get('code')) return send(res, 400, page(null, '<h1>That sign-in was not started here, or has expired.</h1>'))
  const r = await request((await meta()).token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: BASE + '/callback',
      client_id: CLIENT, client_secret: SECRET, code_verifier: p.verifier }).toString()
  })
  const tok = JSON.parse(r.body)
  const c = await verified(tok.id_token)
  if (!c || c.iss !== ISSUER || !aud(c).includes(CLIENT) || c.nonce !== p.nonce) {
    return send(res, 400, page(null, "<h1>The door's answer did not check out.</h1>"))
  }
  const cookie = b64url(crypto.randomBytes(32))
  SESSIONS.set(cookie, { name: c.given_name || c.preferred_username || '', email: c.email || '', sub: c.sub, sid: c.sid || '',
    idToken: tok.id_token, csrf: b64url(crypto.randomBytes(16)) })
  redirect(res, '/', { 'Set-Cookie': `house_node=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax` })
}

async function logout (req, res) {
  const s = SESSIONS.get(cookieOf(req)); SESSIONS.delete(cookieOf(req))
  const clear = { 'Set-Cookie': 'house_node=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' }
  if (!s) return redirect(res, '/', clear)
  const q = new URLSearchParams({ id_token_hint: s.idToken, post_logout_redirect_uri: BASE + '/' })
  redirect(res, (await meta()).end_session_endpoint + '?' + q, clear)
}

// The door says a session ended. Only a logout token the door signed, for this house, is believed.
async function backchannel (req, res) {
  const tok = new URLSearchParams(await readBody(req)).get('logout_token') || ''
  const c = await verified(tok)
  if (!c || c.iss !== ISSUER || !aud(c).includes(CLIENT) ||
      !(c.events || {})['http://schemas.openid.net/event/backchannel-logout']) return send(res, 400, '')
  let n = 0
  for (const [k, v] of SESSIONS) {
    if ((c.sid && v.sid === c.sid) || (!c.sid && v.sub === c.sub)) { SESSIONS.delete(k); n++ }
  }
  console.log(`house-node: the door ended ${n} session(s)`)
  send(res, 200, '')
}

async function upload (req, res, s) {
  const boundary = 'dvar' + crypto.randomBytes(8).toString('hex')
  const content = `A note from ${NAME}, for ${s.email}, at ${new Date().toISOString()}\n`
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`
  const r = await request(BHANDARA + '/v1/files', { method: 'POST', body, agent: SERVICE_AGENT,
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary } })
  let out; try { out = { bhandara: r.status, ...JSON.parse(r.body) } } catch (e) { out = { bhandara: r.status, error: r.body.slice(0, 300) } }
  if ((req.headers.accept || '').includes('application/json')) return json(res, r.status === 200 ? 200 : 502, out)
  send(res, 200, page(s, `<h1>Upload</h1><pre>${esc(JSON.stringify(out, null, 2))}</pre><p><a href="/">Back</a></p>`))
}

async function mail (req, res, s) {
  const ask = { tenant: 'acme', from: 'billing@acme.example', acting_user: null, purpose: 'demo', to: [s.email],
    subject: `Hello from ${NAME}`, html: `<html><body><p>${esc(NAME)} sent this through dakiya.</p></body></html>` }
  const r = await request(DAKIYA + '/v1/send', { method: 'POST', body: JSON.stringify(ask), agent: SERVICE_AGENT,
    headers: { 'Content-Type': 'application/json' } })
  let out; try { out = { dakiya: r.status, ...JSON.parse(r.body) } } catch (e) { out = { dakiya: r.status, error: r.body.slice(0, 300) } }
  if ((req.headers.accept || '').includes('application/json')) return json(res, r.status === 200 ? 200 : 502, out)
  send(res, 200, page(s, `<h1>Mail</h1><pre>${esc(JSON.stringify(out, null, 2))}</pre><p><a href="/">Back</a></p>`))
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://house')
    const s = SESSIONS.get(cookieOf(req))
    if (req.method === 'GET') {
      if (u.pathname === '/health') return json(res, 200, { status: 'UP', version: VERSION })
      if (u.pathname === '/manifest.json') return json(res, 200, { name: CLIENT, display_name: NAME, environment: ENVIRONMENT, version: VERSION, health: '/health' })
      if (u.pathname === '/.well-known/estate-brand.json') return json(res, 200, { name: TENANT, app: NAME }, { 'Access-Control-Allow-Origin': '*' })
      if (u.pathname === '/login') return await login(res)
      if (u.pathname === '/callback') return await callback(res, u.searchParams)
      if (u.pathname === '/logout') return await logout(req, res)
      if (u.pathname === '/whoami') return json(res, s ? 200 : 401, s ? { name: s.name, email: s.email } : { signed_in: false })
      if (u.pathname === '/') {
        if (!s) return redirect(res, '/login')
        return send(res, 200, page(s, `<h1>${esc(NAME)}</h1><p>Signed in at the door as <b>${esc(s.email)}</b>. ` +
          'This house keeps its own session; the door only proved who you are.</p>' +
          `<form method="post" action="/upload"><input type="hidden" name="csrf" value="${s.csrf}"><button>Upload a file to bhandara</button></form>` +
          `<form method="post" action="/mail"><input type="hidden" name="csrf" value="${s.csrf}"><button>Send a mail through dakiya</button></form>`))
      }
      return send(res, 404, page(null, '<h1>Not here</h1>'))
    }
    if (req.method === 'POST') {
      if (u.pathname === '/backchannel-logout') return await backchannel(req, res)
      if (!s) return json(res, 401, { signed_in: false })
      const f = new URLSearchParams(await readBody(req))
      if (f.get('csrf') !== s.csrf) return json(res, 403, { refused: 'the form did not come from this house' })
      if (u.pathname === '/upload') return await upload(req, res, s)
      if (u.pathname === '/mail') return await mail(req, res, s)
    }
    json(res, 404, {})
  } catch (e) {
    console.error('house-node:', e)
    json(res, 500, { error: String(e.message || e) })
  }
}).listen(8000, '0.0.0.0', () => console.log('house-node: listening on 8000'))
