# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
FROM python:3.12-slim
RUN pip install --no-cache-dir cryptography==43.0.3
WORKDIR /house
COPY house.py .
USER nobody
EXPOSE 8000
CMD ["python", "-u", "house.py"]
