# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
# The demo's one-shot helpers (the certificate maker, the seed, the end-to-end test) share this image.
FROM python:3.12-slim
RUN pip install --no-cache-dir cryptography==43.0.3 psycopg2-binary==2.9.10
WORKDIR /dvar
COPY demo/preflight.py demo/make-certs.py demo/seed.py ./demo/
COPY tests/ ./tests/
