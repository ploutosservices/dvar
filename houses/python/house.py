#!/usr/bin/env python3
# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
"""A sample house in Python: what the accession asks of a house, and nothing else.

  1. Sign in only at the door: OIDC authorization code flow with PKCE against the door's realm.
  2. Wear the bar: the shell's fixed skeleton and its unversioned titlebar.css.
  3. The weather slot, opt-in (HOUSE_WEATHER=on): one element the shell's titlebar.js fills. Off by default.
  4. Print: the house plugs its own print action into the bar's actions; the shell's estate-print
     writes the sheet's corners.
  5. The footer: this house wears it, with its declared version.
  6. Sign-out reaches the house: the door's back-channel logout ends this house's session.
  7. The house declares itself: /manifest.json (environment, version, health door) and /health.

It reaches bhandara and dakiya with its OWN client certificate, through the proxy, never with the person's pass.
Standard library, plus `cryptography` to verify the door's signature on a logout token.
"""
import base64
import hashlib
import html
import http.cookies
import json
import os
import secrets
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

E = os.environ
CLIENT = E["HOUSE_CLIENT_ID"]                  # house-python
NAME = E["HOUSE_DISPLAY_NAME"]                 # Python house
BASE = E["HOUSE_BASE_URL"].rstrip("/")         # https://house-python.localhost:8443
ISSUER = E["DOOR_ISSUER"].rstrip("/")          # https://door.localhost:8443/realms/demo
SECRET = E["HOUSE_CLIENT_SECRET"]   # read from the environment, not a value — pragma: allowlist secret
CDN = E["SHELL_URL"].rstrip("/")               # where the shell is served
ENVIRONMENT = E["HOUSE_ENVIRONMENT"]           # the realm's name: demo
COLOUR = E.get("HOUSE_ENV_COLOUR", "")
TENANT = E.get("HOUSE_TENANT", "")
OTHER = json.loads(E.get("HOUSE_OTHERS", "[]"))   # [{"name": ..., "url": ...}]: the tenant's other houses
BHANDARA = E["BHANDARA_URL"].rstrip("/")
DAKIYA = E["DAKIYA_URL"].rstrip("/")
WEATHER = E.get("HOUSE_WEATHER", "off") == "on"
VERSION = "0.1.0"

TLS = ssl.create_default_context(cafile=E["DEMO_CA"])                 # trust the demo's CA, as neenv says
SERVICE_TLS = ssl.create_default_context(cafile=E["DEMO_CA"])
SERVICE_TLS.load_cert_chain(E["HOUSE_CERT"], E["HOUSE_KEY"])          # the house's own certificate

SESSIONS = {}   # cookie -> {"name", "email", "sub", "sid", "id_token", "csrf"}
PENDING = {}    # state  -> {"verifier", "nonce", "at"}
_meta = {}


def fetch(url, data=None, headers=None, ctx=TLS, method=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        return r.status, r.read()


def meta():
    if not _meta:
        _meta.update(json.loads(fetch(ISSUER + "/.well-known/openid-configuration")[1]))
    return _meta


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def claims(jwt):
    return json.loads(unb64url(jwt.split(".")[1]))


def verified(jwt):
    """The token's claims, if the door signed it (RS256, a key from the door's JWKS); else None."""
    head_b64, body_b64, sig_b64 = jwt.split(".")
    head = json.loads(unb64url(head_b64))
    if head.get("alg") != "RS256":
        return None
    keys = json.loads(fetch(meta()["jwks_uri"])[1])["keys"]
    for k in keys:
        if k.get("kid") == head.get("kid") and k.get("kty") == "RSA":
            pub = rsa.RSAPublicNumbers(int.from_bytes(unb64url(k["e"]), "big"),
                                       int.from_bytes(unb64url(k["n"]), "big")).public_key()
            try:
                pub.verify(unb64url(sig_b64), f"{head_b64}.{body_b64}".encode(), padding.PKCS1v15(), hashes.SHA256())
            except Exception:  # noqa: BLE001 — a bad signature is simply not the door's
                return None
            return json.loads(unb64url(body_b64))
    return None


def multipart(field, filename, content, ctype):
    boundary = "dvar" + secrets.token_hex(8)
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, "multipart/form-data; boundary=" + boundary


ICON_PRINT = ('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" '
              'aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 '
              '42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 '
              '1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 '
              '48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 '
              '0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"/></svg>')


def page(s, body):
    who = html.escape(s["name"]) if s else ""
    jump = "".join(f'<a href="{html.escape(o["url"])}" data-estate-tip="Open {html.escape(o["name"])}">'
                   f'{html.escape(o["name"])}</a>' for o in OTHER)
    exits = (f'<span class="estate-bar-who" data-estate-first-name="{who}">Hello, {who}</span>'
             f'<a class="estate-bar-exit" href="{ISSUER}/account" data-estate-tip="where am I signed in">Account</a>'
             f'<a class="estate-bar-exit" href="/logout" data-estate-tip="sign out">Sign out</a>') if s else ""
    env_word = "" if ENVIRONMENT == "production" else ENVIRONMENT.upper()
    # no colour declared: no style at all, so the stylesheet's "undeclared" red shows, never an empty colour
    style = f' style="--estate-env-color: {html.escape(COLOUR)}"' if COLOUR else ""
    weather = f'<a class="estate-bar-weather" href="{CDN}/estate/weather/"></a>' if WEATHER else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(NAME)}</title>
<link rel="stylesheet" href="{CDN}/estate/titlebar/titlebar.css">
<link rel="stylesheet" href="{CDN}/estate/tip/estate-tip.css">
<link rel="stylesheet" href="{CDN}/estate/print/estate-print.css">
<style>body{{margin:0;font-family:system-ui,sans-serif}} main{{padding:1rem 16px;max-width:48rem}}
footer.house-footer{{padding:1rem 16px;color:#475569;font-size:.875rem;border-top:1px solid #e2e8f0}}</style>
</head><body>
<header class="estate-bar" data-env="{html.escape(ENVIRONMENT)}"{style}>
  <a class="estate-bar-logo" href="/"><img src="{CDN}/estate/icons/home.svg" alt="{html.escape(NAME)}"></a>
  <div class="estate-bar-main">
    <span class="estate-bar-app">{html.escape(NAME)}</span>
    <span class="estate-bar-context">{html.escape(TENANT)}</span>
    <span class="estate-bar-env">{env_word}</span>
    <div class="estate-bar-spacer"></div>
    <nav class="estate-bar-jump">{jump}</nav>
    <div class="estate-bar-actions">
      <a href="#" onclick="window.print();return false" data-estate-tip="print this page" aria-label="print">{ICON_PRINT}</a>
      {weather}
    </div>
    {exits}
  </div>
</header>
<main>{body}</main>
<footer class="house-footer">{html.escape(NAME)} {VERSION} · {html.escape(ENVIRONMENT)}</footer>
<script src="{CDN}/estate/titlebar/titlebar.js"></script>
<script src="{CDN}/estate/vendor/floating-ui/1.8.0/floating-ui.core.umd.min.js"></script>
<script src="{CDN}/estate/vendor/floating-ui/1.8.0/floating-ui.dom.umd.min.js"></script>
<script src="{CDN}/estate/tip/estate-tip.js"></script>
<script src="{CDN}/estate/print/estate-print.js"></script>
</body></html>"""


class House(BaseHTTPRequestHandler):
    server_version = "house-python"

    def log_message(self, fmt, *args):
        print("house-python:", fmt % args, flush=True)

    # ── plumbing ──
    def session(self):
        c = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        m = c.get("house_python")
        return SESSIONS.get(m.value) if m else None

    def send(self, code, body, ctype="text/html; charset=utf-8", headers=None):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def json(self, code, obj, headers=None):
        self.send(code, json.dumps(obj), "application/json", headers)

    def redirect(self, url, headers=None):
        self.send(302, "", headers={"Location": url, **(headers or {})})

    def wants_json(self):
        return "application/json" in self.headers.get("Accept", "")

    def form(self):
        n = int(self.headers.get("Content-Length") or 0)
        return urllib.parse.parse_qs(self.rfile.read(n).decode()) if n else {}

    # ── GET ──
    def do_GET(self):
        path, _, query = self.path.partition("?")
        q = urllib.parse.parse_qs(query)
        if path == "/health":
            return self.json(200, {"status": "UP", "version": VERSION})
        if path == "/manifest.json":
            return self.json(200, {"name": CLIENT, "display_name": NAME, "environment": ENVIRONMENT,
                                   "version": VERSION, "health": "/health"})
        if path == "/.well-known/estate-brand.json":   # the door's bar reads the house's own name for the tenant
            return self.json(200, {"name": TENANT, "app": NAME}, {"Access-Control-Allow-Origin": "*"})
        if path == "/login":
            return self.login()
        if path == "/callback":
            return self.callback(q)
        if path == "/logout":
            return self.logout()
        if path == "/whoami":
            s = self.session()
            return self.json(200 if s else 401, {"name": s["name"], "email": s["email"]} if s else {"signed_in": False})
        if path == "/":
            s = self.session()
            if not s:
                return self.redirect("/login")
            body = (f"<h1>{html.escape(NAME)}</h1><p>Signed in at the door as <b>{html.escape(s['email'])}</b>. "
                    f"This house keeps its own session; the door only proved who you are.</p>"
                    f'<form method="post" action="/upload"><input type="hidden" name="csrf" value="{s["csrf"]}">'
                    f"<button>Upload a file to bhandara</button></form>"
                    f'<form method="post" action="/mail"><input type="hidden" name="csrf" value="{s["csrf"]}">'
                    f"<button>Send a mail through dakiya</button></form>")
            return self.send(200, page(s, body))
        return self.send(404, page(None, "<h1>Not here</h1>"))

    def login(self):
        state, nonce, verifier = secrets.token_urlsafe(16), secrets.token_urlsafe(16), secrets.token_urlsafe(48)
        PENDING[state] = {"verifier": verifier, "nonce": nonce, "at": time.time()}
        challenge = b64url(hashlib.sha256(verifier.encode()).digest())
        url = meta()["authorization_endpoint"] + "?" + urllib.parse.urlencode({
            "client_id": CLIENT, "response_type": "code", "scope": "openid email profile",
            "redirect_uri": BASE + "/callback", "state": state, "nonce": nonce,
            "code_challenge": challenge, "code_challenge_method": "S256"})
        self.redirect(url)

    def callback(self, q):
        state = (q.get("state") or [""])[0]
        p = PENDING.pop(state, None)
        if not p or time.time() - p["at"] > 600 or "code" not in q:
            return self.send(400, page(None, "<h1>That sign-in was not started here, or has expired.</h1>"))
        status, raw = fetch(meta()["token_endpoint"], urllib.parse.urlencode({
            "grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": BASE + "/callback",
            "client_id": CLIENT, "client_secret": SECRET, "code_verifier": p["verifier"]}).encode(),
            {"Content-Type": "application/x-www-form-urlencoded"})
        tok = json.loads(raw)
        # The id_token came straight from the door's token endpoint over TLS, authenticated by this house's
        # secret (OIDC Core 3.1.3.7, item 6); its signature is still checked, because it costs nothing here.
        c = verified(tok["id_token"])
        if not c or c.get("iss") != ISSUER or CLIENT not in ([c["aud"]] if isinstance(c["aud"], str) else c["aud"]) \
                or c.get("nonce") != p["nonce"]:
            return self.send(400, page(None, "<h1>The door's answer did not check out.</h1>"))
        cookie = secrets.token_urlsafe(32)
        SESSIONS[cookie] = {"name": c.get("given_name") or c.get("preferred_username", ""), "email": c.get("email", ""),
                            "sub": c["sub"], "sid": c.get("sid", ""), "id_token": tok["id_token"],
                            "csrf": secrets.token_urlsafe(16)}
        self.redirect("/", {"Set-Cookie": f"house_python={cookie}; Path=/; HttpOnly; Secure; SameSite=Lax"})

    def logout(self):
        c = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        m = c.get("house_python")
        s = SESSIONS.pop(m.value, None) if m else None
        clear = {"Set-Cookie": "house_python=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"}
        if not s:
            return self.redirect("/", clear)
        self.redirect(meta()["end_session_endpoint"] + "?" + urllib.parse.urlencode({
            "id_token_hint": s["id_token"], "post_logout_redirect_uri": BASE + "/"}), clear)

    # ── POST ──
    def do_POST(self):
        path = self.path.partition("?")[0]
        if path == "/backchannel-logout":
            return self.backchannel()
        s = self.session()
        if not s:
            return self.json(401, {"signed_in": False})
        f = self.form()
        if (f.get("csrf") or [""])[0] != s["csrf"]:
            return self.json(403, {"refused": "the form did not come from this house"})
        if path == "/upload":
            return self.upload(s)
        if path == "/mail":
            return self.mail(s)
        return self.json(404, {})

    def backchannel(self):
        """The door says a session ended. Only a logout token the door signed, for this house, is believed."""
        f = self.form()
        tok = (f.get("logout_token") or [""])[0]
        c = verified(tok) if tok.count(".") == 2 else None
        ok = (c and c.get("iss") == ISSUER
              and CLIENT in ([c["aud"]] if isinstance(c["aud"], str) else c["aud"])
              and "http://schemas.openid.net/event/backchannel-logout" in (c.get("events") or {}))
        if not ok:
            return self.send(400, "")
        gone = [k for k, v in SESSIONS.items()
                if (c.get("sid") and v["sid"] == c["sid"]) or (not c.get("sid") and v["sub"] == c.get("sub"))]
        for k in gone:
            SESSIONS.pop(k, None)
        print(f"house-python: the door ended {len(gone)} session(s)", flush=True)
        self.send(200, "")

    def upload(self, s):
        content = f"A note from {NAME}, for {s['email']}, at {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n".encode()
        body, ctype = multipart("file", "note.txt", content, "text/plain")
        try:
            status, raw = fetch(BHANDARA + "/v1/files", body, {"Content-Type": ctype}, ctx=SERVICE_TLS, method="POST")
            out = {"bhandara": status, **json.loads(raw)}
        except urllib.error.HTTPError as e:
            out = {"bhandara": e.code, "error": e.read().decode()[:300]}
        if self.wants_json():
            return self.json(200 if out["bhandara"] == 200 else 502, out)
        self.send(200, page(s, f"<h1>Upload</h1><pre>{html.escape(json.dumps(out, indent=2))}</pre><p><a href='/'>Back</a></p>"))

    def mail(self, s):
        ask = {"tenant": "acme", "from": "billing@acme.example", "acting_user": None, "purpose": "demo",
               "to": [s["email"]], "subject": f"Hello from {NAME}",
               "html": f"<html><body><p>{html.escape(NAME)} sent this through dakiya.</p></body></html>"}
        try:
            status, raw = fetch(DAKIYA + "/v1/send", json.dumps(ask).encode(), {"Content-Type": "application/json"},
                                ctx=SERVICE_TLS, method="POST")
            out = {"dakiya": status, **json.loads(raw)}
        except urllib.error.HTTPError as e:
            out = {"dakiya": e.code, "error": e.read().decode()[:300]}
        if self.wants_json():
            return self.json(200 if out["dakiya"] == 200 else 502, out)
        self.send(200, page(s, f"<h1>Mail</h1><pre>{html.escape(json.dumps(out, indent=2))}</pre><p><a href='/'>Back</a></p>"))


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), House).serve_forever()
