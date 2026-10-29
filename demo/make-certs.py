#!/usr/bin/env python3
# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
"""The demo's certificate authority and every certificate it issues. The CA is part of neenv: every pass
and every service certificate means something only because each machine trusts this root.

    python demo/make-certs.py DIR

  proxy                          the reverse proxy's server certificate, for every name the demo answers to
  smtp                           the mail sink's server certificate (dakiya verifies it on STARTTLS)
  dakiya                         dakiya's own client certificate, presented to the mail sink
  house-python@demo, house-node@demo
                                 each house's client certificate (CN = application@environment), presented
                                 to the proxy when the house calls bhandara or dakiya

Runs once per volume: an existing CA is kept. The certificates are valid for two days.
"""
import datetime
import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

NAMES = ["door.localhost", "house-python.localhost", "house-node.localhost",
         "bhandara.localhost", "dakiya.localhost"]

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
if os.path.exists(os.path.join(out, "ca.pem")):
    print(f"certificates already in {out}; kept (docker compose down -v makes new ones)")
    sys.exit(0)

now = datetime.datetime.now(datetime.timezone.utc)


def write(name, k, cert):
    with open(os.path.join(out, f"{name}.key"), "wb") as f:
        f.write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption()))
    with open(os.path.join(out, f"{name}.pem"), "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    os.chmod(os.path.join(out, f"{name}.key"), 0o644)   # a demo volume, read by every container


def issue(cn, usage, sans=()):
    k = ec.generate_private_key(ec.SECP256R1())
    b = (x509.CertificateBuilder()
         .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)]))
         .issuer_name(ca_name).public_key(k.public_key()).serial_number(x509.random_serial_number())
         .not_valid_before(now - datetime.timedelta(minutes=5))
         .not_valid_after(now + datetime.timedelta(days=2))
         .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
         .add_extension(x509.ExtendedKeyUsage([usage]), critical=False))
    if sans:
        b = b.add_extension(x509.SubjectAlternativeName([x509.DNSName(s) for s in sans]), critical=False)
    return k, b.sign(ca_key, hashes.SHA256())


ca_key = ec.generate_private_key(ec.SECP256R1())
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "dvar demo CA")])
ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
      .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
      .not_valid_before(now - datetime.timedelta(minutes=5))
      .not_valid_after(now + datetime.timedelta(days=2))
      .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
      .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=True, crl_sign=True,
                                   content_commitment=False, key_encipherment=False,
                                   data_encipherment=False, key_agreement=False,
                                   encipher_only=False, decipher_only=False), critical=True)
      .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
      .sign(ca_key, hashes.SHA256()))
write("ca", ca_key, ca)
write("proxy", *issue("proxy", ExtendedKeyUsageOID.SERVER_AUTH, NAMES))
write("smtp", *issue("smtp", ExtendedKeyUsageOID.SERVER_AUTH, ["smtp"]))
write("dakiya", *issue("dakiya", ExtendedKeyUsageOID.CLIENT_AUTH))
for cn in ("house-python@demo", "house-node@demo"):
    write(cn, *issue(cn, ExtendedKeyUsageOID.CLIENT_AUTH))
print(f"certificates written to {out}")
