#!/usr/bin/env python3
# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
"""Refuse to start the demo with a value still CHANGEME, or with no shell. Runs first, in the `certs` step,
which every other service waits for."""
import os
import sys

NAMES = ["KC_BOOTSTRAP_ADMIN_PASSWORD", "DEMO_PERSON_PASSWORD", "HOUSE_PYTHON_CLIENT_SECRET", "HOUSE_NODE_CLIENT_SECRET"]
bad = [n for n in NAMES if os.environ.get(n, "").strip() in ("", "CHANGEME")]
if bad:
    sys.exit("dvar: replace CHANGEME in .env before starting (openssl rand -hex 16 makes a value): " + ", ".join(bad))
if not os.path.isfile("/shell/estate/titlebar/titlebar.css"):
    sys.exit("dvar: ./shell is missing. It ships in the published tree; run the demo from that tree, not from the shell's source.")
print("dvar: settings and shell present")
