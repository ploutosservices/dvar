#!/usr/bin/env python3
# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
"""dvar end to end, as a visitor walks it: sign in once at the door, walk between both houses under one bar,
upload a file through bhandara, send a mail that dakiya delivers to the sink, and sign out so the door's
back-channel logout ends the other house's session. Run by `docker compose run --build --rm tests`.

Every name resolves to the proxy inside the demo's network, exactly as *.localhost does in a browser.
"""
import http.cookiejar
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CA = os.environ["DEMO_CA"]
DOOR = "https://door.localhost:8443"
PY = "https://house-python.localhost:8443"
NODE = "https://house-node.localhost:8443"
SINK = os.environ["SINK_URL"]
PASSWORD = os.environ["DEMO_PERSON_PASSWORD"]

ctx = ssl.create_default_context(cafile=CA)
jar = http.cookiejar.CookieJar()
visitor = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPCookieProcessor(jar))
failed = 0


def check(what, ok, detail=""):
    global failed
    print(f"  {what:<74} {'ok' if ok else 'FAILED ' + str(detail)}", flush=True)
    failed += 0 if ok else 1


def get(url, accept=None):
    req = urllib.request.Request(url, headers={"Accept": accept} if accept else {})
    try:
        with visitor.open(req, timeout=20) as r:
            return r.status, r.geturl(), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.geturl(), e.read().decode()


def post(url, fields, accept=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded", **({"Accept": accept} if accept else {})})
    try:
        with visitor.open(req, timeout=30) as r:
            return r.status, r.geturl(), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.geturl(), e.read().decode()


def anon(url, data=None, ctype=None):
    req = urllib.request.Request(url, data=data, headers={"Content-Type": ctype} if ctype else {}, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def sink():
    with urllib.request.urlopen(SINK + "/api/v1/messages", timeout=10) as r:
        return json.load(r).get("messages") or []


def csrf(page):
    m = re.search(r'name="csrf" value="([^"]+)"', page)
    return m.group(1) if m else ""


print("neenv: the proxy, the CA and every name")
for name, url in (("door", DOOR + "/realms/demo"), ("Python house", PY + "/health"), ("Node house", NODE + "/health")):
    for _ in range(90):
        try:
            if anon(url) == 200:
                break
        except Exception:  # noqa: BLE001 — still starting
            pass
        time.sleep(2)
    check(f"{name} answers through the proxy, its certificate from the demo CA", anon(url) == 200)
check("the shell is served beside the door", anon(DOOR + "/cdn/estate/titlebar/titlebar.css") == 200)
for _ in range(60):   # the seed writes the demo person after the door is up
    try:
        if anon(SINK + "/api/v1/messages") == 200:
            break
    except Exception:  # noqa: BLE001
        pass
    time.sleep(1)

print("sign in once, at the door")
status, where, page = get(PY + "/")
check("the Python house sends a stranger to the door", where.startswith(DOOR + "/realms/demo/"), where)
m = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', page)
check("the door's sign-in page is Chowkidar's", "chowkidar" in page and m is not None)
check("the door's page carries dvar's settings for its bar", "chowkidar-config.js" in page)
check("a person can see the password form (no sheet hides it)", "chowkidar-hide-v2.css" not in page)
status, where, page = post(m.group(1).replace("&amp;", "&"), {"username": "demo", "password": PASSWORD})
check("signed in, back at the Python house", status == 200 and where.rstrip("/") == PY, (status, where))
check("the house greets the person the door proved", "demo@acme.example" in page)
py_csrf = csrf(page)

print("both houses under one bar")
for label, html in (("Python house", page),):
    check(f"{label} wears the bar's skeleton", 'class="estate-bar"' in html and 'class="estate-bar-app">Python house<' in html)
    check(f"{label} names its tenant and environment", 'estate-bar-context">Acme<' in html and 'estate-bar-env">DEMO<' in html)
    check(f"{label} takes the bar from the shell", DOOR + "/cdn/estate/titlebar/titlebar.css" in html)
    check(f"{label} wears its footer with its version", "Python house 0.1.0" in html)
status, where, page = get(NODE + "/")
check("the Node house signs the same person in WITHOUT asking again", status == 200 and where.rstrip("/") == NODE
      and "kc-form-login" not in page, (status, where))
check("Node house wears the same bar", 'class="estate-bar-app">Node house<' in page and 'estate-bar-context">Acme<' in page)
check("each house's jump names the other", 'href="' + PY + '"' in page)
node_csrf = csrf(page)
check("each house declares itself", json.loads(get(NODE + "/manifest.json")[2]).get("health") == "/health"
      and json.loads(get(PY + "/manifest.json")[2]).get("version") == "0.1.0")

print("the utilities: a house's own certificate, never the person's pass")
check("bhandara refuses a caller with no certificate (401)", anon("https://bhandara.localhost:8443/v1/files") == 401)
check("dakiya refuses a send with no certificate (403)",
      anon("https://dakiya.localhost:8443/v1/send", b"{}", "application/json") == 403)
status, _, body = post(PY + "/upload", {"csrf": py_csrf}, "application/json")
up = json.loads(body) if body.startswith("{") else {}
check("an upload from the Python house reaches bhandara (200)", status == 200 and up.get("bhandara") == 200, body[:200])
check("bhandara hands back its handle and the bytes' sha1", bool(up.get("uuid")) and len(up.get("sha1", "")) == 40)
before = len(sink())
status, _, body = post(NODE + "/mail", {"csrf": node_csrf}, "application/json")
sent = json.loads(body) if body.startswith("{") else {}
check("a mail from the Node house is accepted by dakiya (200)", status == 200 and sent.get("dakiya") == 200, body[:200])
check("outside production it goes to the tenant, not the person", sent.get("sent_to") == ["desk@acme.example"], sent.get("sent_to"))
got = []
for _ in range(20):
    got = sink()
    if len(got) > before:
        break
    time.sleep(0.5)
check("the sink caught exactly one mail", len(got) - before == 1, len(got) - before)
if got:
    check("it is the Node house's", "Node house" in (got[0].get("Subject") or ""), got[0].get("Subject"))
check("a form from elsewhere is refused (403)", post(PY + "/upload", {"csrf": "forged"}, "application/json")[0] == 403)

print("sign-out reaches every house")
check("the Node house knows the person", get(NODE + "/whoami")[0] == 200)
status, where, page = get(PY + "/logout")
check("signing out of the Python house ends the door's session (the door asks again)",
      where.startswith(DOOR + "/realms/demo/") and "kc-form-login" in page, (status, where))
time.sleep(2)
check("the door's back-channel logout ended the Node house's session", get(NODE + "/whoami")[0] == 401)
status, where, _ = get(NODE + "/")
check("the Node house sends the visitor back to the door", where.startswith(DOOR + "/realms/demo/"), where)

print("dvar end to end: " + ("every check holds" if not failed else f"{failed} check(s) FAILED"))
sys.exit(1 if failed else 0)
