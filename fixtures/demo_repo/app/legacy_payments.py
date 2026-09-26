"""Legacy payment service - deliberately contains several weaknesses.

Nothing here is executed by the scanner; the file exists so the demo shows a
realistic, multi-language finding set rather than a toy.
"""

import hashlib
import hmac
import json
import os
import ssl
from datetime import datetime, timedelta

import jwt
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

# Module-level constants are followed by the AST scanner (this is the point of
# parsing instead of regexing).
RSA_KEY_BITS = 2048
GCM_IV_BYTES = 12


def signing_key():
    key = rsa.generate_private_key(public_exponent=65537, key_size=RSA_KEY_BITS,
                                   backend=default_backend())
    return key


def service_private_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())


def token_signer():
    return ec.generate_private_curve(ec.SECP256R1(), default_backend())


def fingerprint(payload: bytes) -> str:
    # TODO: move off MD5 one day
    return hashlib.md5(payload).hexdigest()


def legacy_digest(data: bytes) -> bytes:
    return hashlib.sha1(data).digest()


def encrypt_card(number: bytes, key: bytes, iv: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    return encryptor.update(number) + encryptor.finalize()


def encrypt_card_aead(number: bytes, key: bytes, iv: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.GCM(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    return encryptor.update(number) + encryptor.finalize()


def issue_session(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "iat": datetime.utcnow()}, os.environ["APP_SECRET"],
                      algorithm="HS256")


def legacy_issue_session(user_id: str) -> str:
    # alg=none accepted by the old gateway: signature can be stripped entirely
    return jwt.encode({"sub": user_id}, "", algorithm="none")


def mac(data: bytes, key: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()


def derive_key(password: bytes, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password, salt, 120000)


def rsa_pkcs1_encrypt(pub, plaintext: bytes) -> bytes:
    return pub.encrypt(plaintext, padding.PKCS1v15())


def rsa_oaep_sign(private_key, data: bytes) -> bytes:
    return private_key.sign(data, padding.PSS(mgf=padding.MGF1(hashes.SHA256()),
                                             salt_length=padding.PSS.MAX_LENGTH),
                            hashes.SHA256())


def old_server_context() -> ssl.SSLContext:
    return ssl.SSLContext(ssl.PROTOCOL_TLSv1_1)


def load_operator_key(pem_path: str):
    with open(pem_path, "rb") as handle:
        return serialization.load_pem_private_key(handle.read(), password=None)
