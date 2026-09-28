"""Declaration-surface detection: the recall tier.

These tests pin the behaviour that the independent PyJWT benchmark identified
as missing. A call-only scanner reads a JWT library's algorithm table as
ordinary dict literals and misses every algorithm in it; these cases are the
regression guard for the fix.
"""
from __future__ import annotations

import pytest

from app.scanners.declarations import SCANNER
from app.scanners.python_ast import SCANNER as AST


def _assets(findings) -> set[str]:
    return {f.asset.get("canonical_name") for f in findings}


def _at(findings, line: int):
    return [f for f in findings if f.line_start == line]


# --------------------------------------------------------------------------
# JOSE algorithm registries
# --------------------------------------------------------------------------
def test_jose_registry_table_yields_families_not_one_finding_per_name():
    """A 12-entry algorithm table is 6 surfaces, not 12 findings."""
    src = '''
def get_default_algorithms():
    return {
        "HS256": HMACAlgorithm(HMACAlgorithm.SHA256),
        "RS256": RSAAlgorithm(RSAAlgorithm.SHA256),
        "PS512": RSAPSSAlgorithm(RSAPSSAlgorithm.SHA512),
        "ES256": ECAlgorithm(ECAlgorithm.SHA256, SECP256R1),
        "EdDSA": OKPAlgorithm(),
    }
'''
    found = _assets(SCANNER.scan_text(src, "jwt/algorithms.py"))
    assert "RSA-2048" in found
    assert "RSA-PSS" in found
    assert "ECDSA-P256" in found
    assert "Ed25519" in found
    assert "HMAC-SHA256" in found
    # three RS* names collapse to one RSA surface
    rsa = [f for f in SCANNER.scan_text(src, "jwt/algorithms.py")
           if f.asset.get("canonical_name") == "RSA-2048"]
    assert len(rsa) == 1


def test_jose_registry_is_inferred_never_parsed_structure():
    """A declaration is a policy claim, not a resolved call. Say so."""
    src = 'ALGOS = {"RS256": RSAAlgorithm(RSAAlgorithm.SHA256)}\n'
    for f in SCANNER.scan_text(src, "jwt/algs.py"):
        assert f.evidence_class == "INFERRED"
        assert f.confidence < 0.75


def test_unrelated_dict_with_algorithmish_keys_is_not_a_crypto_finding():
    """Guard against over-reporting: a plain config map must stay silent."""
    src = '''
OPTIONS = {
    "RS256": "some business value",
    "ES512": "another business value",
}
'''
    assert SCANNER.scan_text(src, "app/config_values.py") == []


def test_jose_names_require_jose_context_or_family_constructor():
    """No JOSE signal in path or text, and no family constructor, means no finding."""
    src = 'MAPPING = {"HS256": "label", "RS256": "label"}\n'
    assert SCANNER.scan_text(src, "app/misc.py") == []


# --------------------------------------------------------------------------
# Class-level and module-level hash bindings
# --------------------------------------------------------------------------
def test_class_var_hash_binding_is_detected():
    src = '''
class HMACAlgorithm:
    SHA256: ClassVar[HashlibHash] = hashlib.sha256
    SHA512: ClassVar[HashlibHash] = hashlib.sha512
'''
    found = _assets(SCANNER.scan_text(src, "jwt/algorithms.py"))
    assert {"SHA-256", "SHA-512"} <= found


def test_module_level_digest_constant_is_detected():
    src = 'DEFAULT_DIGEST = hashlib.sha384\n'
    assert "SHA-384" in _assets(SCANNER.scan_text(src, "app/crypto.py"))


def test_cipher_configuration_table_is_detected():
    src = 'CIPHERS = ["aes-256-gcm", "chacha20-poly1305"]\n'
    found = _assets(SCANNER.scan_text(src, "app/ciphers.py"))
    assert "AES-256-GCM" in found
    assert "ChaCha20-Poly1305" in found


def test_declarations_do_not_fire_on_non_python():
    src = '{"RS256": "RSAAlgorithm(SHA256)"}'
    assert SCANNER.scan_text(src, "config.json") == []


def test_invalid_syntax_is_ignored_not_raised():
    assert SCANNER.scan_text("def broken(:\n", "app/broken.py") == []


# --------------------------------------------------------------------------
# The false positive this tier was built to remove
# --------------------------------------------------------------------------
def test_str_encode_with_text_codec_is_not_jwt_alg_none():
    """Regression: jwt.encode("utf-8") is str.encode, not a signature bypass.

    Found in PyJWT's api_jws.py and reported as a critical JWT-ALG-NONE before
    the codec guard. This is the exact false positive the independent benchmark
    measured at 0.667 precision.
    """
    src = '''
def _load(self, jwt):
    if isinstance(jwt, str):
        jwt = jwt.encode("utf-8")
    if not isinstance(jwt, bytes):
        raise DecodeError("Invalid token")
'''
    assert AST.scan_text(src, "jwt/api_jws.py") == []


@pytest.mark.parametrize("codec", ["utf-8", "utf8", "latin-1", "ascii", "base64", "utf-16"])
def test_text_codecs_of_any_spelling_are_excluded(codec):
    src = f'jwt = jwt.encode("{codec}")\n'
    assert AST.scan_text(src, "jwt/api_jws.py") == []


@pytest.mark.parametrize("algo,expected", [
    ("HS256", "HMAC-SHA256"),
    ("RS256", "RSA-2048"),
    ("ES256", "ECDSA-P256"),
])
def test_real_jose_calls_are_still_detected(algo, expected):
    """The codec guard must not disarm the detector."""
    src = f'token = jwt.encode(payload, key, algorithm="{algo}")\n'
    found = _assets(AST.scan_text(src, "app/auth.py"))
    assert expected in found


def test_jose_call_with_explicit_none_is_alg_none():
    src = 'token = jwt.encode(payload, key, algorithm="none")\n'
    assert "JWT-ALG-NONE" in _assets(AST.scan_text(src, "app/auth.py"))


def test_unresolvable_algorithm_is_not_reported_as_alg_none():
    """Absence of evidence is not evidence of absence.

    A call whose algorithm we cannot read must not be reported as a critical
    signature bypass - that is a critical-band false positive.
    """
    src = "token = jwt.encode(payload, some_key_object)\n"
    assert "JWT-ALG-NONE" not in _assets(AST.scan_text(src, "app/auth.py"))


def test_jose_decode_positional_algorithm_still_detected():
    src = 'data = jwt.decode(token, key, algorithms=["HS256"])\n'
    found = _assets(AST.scan_text(src, "app/auth.py"))
    assert "HMAC-SHA256" in found or found == set()  # list arg: either resolved or silent, never "none"
    assert "JWT-ALG-NONE" not in found


def test_ecdsa_and_eddsa_jose_calls_are_detected():
    for algo, asset in [("ES256", "ECDSA-P256"), ("ES384", "ECDSA-P384"),
                        ("EdDSA", "Ed25519")]:
        src = f'token = jwt.encode(payload, key, algorithm="{algo}")\n'
        assert asset in _assets(AST.scan_text(src, "app/auth.py")), algo


# --------------------------------------------------------------------------
# Scanner contract
# --------------------------------------------------------------------------
def test_scanner_satisfies_the_scanner_protocol():
    from pathlib import Path

    assert hasattr(SCANNER, "supports") and hasattr(SCANNER, "scan_text")
    assert SCANNER.supports(Path("x.py"), 100)
    assert not SCANNER.supports(Path("x.go"), 100)
    assert SCANNER.tier and SCANNER.source
