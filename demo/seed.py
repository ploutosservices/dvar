#!/usr/bin/env python3
# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
"""What the demo's operator would write by hand, written once before anyone signs in.

  - the door: one person, `demo`, in the realm `demo` (Chowkidar's generic realm holds no people), with the
    password DEMO_PERSON_PASSWORD from .env;
  - dakiya: the tenant Acme, the inbox it sends from, and a grant for each house to send for it (who may send,
    for whom and from which address is the operator's decision, never written through a door);
  - bhandara: its bucket (the deployer creates it; the service never does).

Running it twice changes nothing.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import psycopg2

DOOR = "http://door:8080"


def call(method, url, body=None, token=None, form=False):
    data = None
    headers = {}
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as r:
        raw = r.read()
        return r.status, (json.loads(raw) if raw else None)


def until(what, fn, tries=120):
    for _ in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — the dependency may still be starting
            last = e
            time.sleep(2)
    raise SystemExit(f"seed: {what} never answered: {last}")



# the door
until("the door's demo realm", lambda: call("GET", DOOR + "/realms/demo"))
_, tok = call("POST", DOOR + "/realms/master/protocol/openid-connect/token", {
    "grant_type": "password", "client_id": "admin-cli",
    "username": os.environ["KC_BOOTSTRAP_ADMIN_USERNAME"],
    "password": os.environ["KC_BOOTSTRAP_ADMIN_PASSWORD"]}, form=True)
token = tok["access_token"]   # an admin token read at run time, not a value — pragma: allowlist secret
_, found = call("GET", DOOR + "/admin/realms/demo/users?exact=true&username=demo", token=token)
if not found:
    call("POST", DOOR + "/admin/realms/demo/users", {
        "username": "demo", "email": "demo@acme.example", "emailVerified": True,
        "firstName": "Demo", "lastName": "Person", "enabled": True, "requiredActions": [],
        "credentials": [{"type": "password", "value": os.environ["DEMO_PERSON_PASSWORD"], "temporary": False}]},
        token=token)
    print("seeded the door: person demo in realm demo")
else:
    print("the door's person demo is already there")

# dakiya's rows (its schema is applied by dakiya itself as it starts)
ROWS = [
    ("tenant", ("tenant", "receives_at"), ("acme", "desk@acme.example")),
    ("inbox", ("tenant", "address", "account_kind", "key_env"), ("acme", "billing@acme.example", "smtp", "DEMO_SMTP")),
    ('"grant"', ("application", "tenant", "verb", "asked_by"), ("house-python", "acme", "send", "demo")),
    ('"grant"', ("application", "tenant", "verb", "asked_by"), ("house-node", "acme", "send", "demo")),
]


def dakiya_rows():
    with psycopg2.connect(os.environ["MAIL_SEND_DSN"]) as conn, conn.cursor() as cur:
        for table, cols, values in ROWS:
            where = " AND ".join(f"{c} = %s" for c in cols)
            cur.execute(f"SELECT 1 FROM {table} WHERE {where} AND NOT is_deleted", values)
            if not cur.fetchone():
                cur.execute(f'INSERT INTO {table} ({", ".join(cols)}) VALUES ({", ".join(["%s"] * len(cols))})', values)


until("dakiya's store", dakiya_rows)
print("seeded dakiya: tenant acme, inbox billing@acme.example, grants house-python and house-node")


# bhandara's bucket, on the demo's S3 store (it accepts anonymous requests)
def bucket():
    try:
        call("PUT", "http://s3:8333/" + os.environ["MINIO_BUCKET"])
    except urllib.error.HTTPError as e:
        if e.code != 409:   # already there
            raise


until("the S3 store", bucket)
print("seeded bhandara: bucket " + os.environ["MINIO_BUCKET"])
