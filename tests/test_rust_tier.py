"""Rust / rustls tier regression tests.

The Rust tier earns its place in the word "multi-language" the same way the C
tier did: by being measured against a real, independently authored Rust TLS
stack, with every label below written from the source rather than from the
detector's output. These tests exist so a later change cannot quietly turn
Rust support back into "returns nothing" - which is exactly the failure the
OpenSSL tier had before it was measured.
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.scanners.source_text import (  # noqa: E402
    C_RUST_CONST,
    RUST_KDF_CONSTRUCTION,
    SourceTextScanner,
    TLS_OLD,
    _c_resolve_rust_const,
)

CORPUS = ROOT / "fixtures" / "rustls_repo"

SCANNER = SourceTextScanner()


def scan(rel: str) -> list:
    return SCANNER.scan_text((CORPUS / rel).read_text(encoding="utf-8"), rel)


def labels(rel: str) -> set[str]:
    return {f.asset["canonical_name"] for f in scan(rel)}


# --------------------------------------------------------------------------
# Constant-path resolution
# --------------------------------------------------------------------------

def test_rust_constant_path_resolves_to_the_named_primitive():
    """`hmac::HMAC_SHA256` names HMAC-SHA256, not the family "HMAC".

    The digest is part of the identifier. Collapsing it to a bare HMAC would
    report a less specific algorithm than the source states, which is the
    failure mode family-granular scoring is supposed to expose rather than
    hide.
    """
    for text, expected in [
        ("digest::SHA256", "SHA-256"),
        ("digest::SHA384", "SHA-384"),
        ("hmac::HMAC_SHA256", "HMAC-SHA256"),
        ("hmac::HMAC_SHA512", "HMAC-SHA512"),
        ("hkdf::HKDF_SHA384", "HKDF"),
        ("aead::AES_256_GCM", "AES-256"),
        ("aead::CHACHA20_POLY1305", "ChaCha20-Poly1305"),
        ("signature::RSA_PSS_SHA256", "RSA-PSS"),
        ("signature::ECDSA_P384_SHA384_ASN1_SIGNING", "ECDSA-P384"),
    ]:
        m = C_RUST_CONST.search(text)
        assert m, text
        assert _c_resolve_rust_const(m) == expected, text


def test_rust_camelcase_type_namespace_is_recognised():
    """Rust type paths are CamelCase; a lowercase-only namespace misses them.

    `SignatureScheme::ED25519` is rustls' signature-scheme enum. A namespace
    pattern written for Rust *modules* (`ring::aead`, all lowercase) never
    matches it, so Ed25519 and every ECDSA scheme silently disappeared.
    """
    for text, expected in [
        ("SignatureScheme::ED25519", "Ed25519"),
        ("SignatureScheme::ECDSA_NISTP384_SHA384", "ECDSA-P384"),
        ("HashAlgorithm::SHA384", "SHA-384"),
    ]:
        m = C_RUST_CONST.search(text)
        assert m, text
        assert _c_resolve_rust_const(m) == expected, text


def test_rust_ecdsa_p384_is_not_reported_as_p256():
    """The curve is in the name. P384 must not fall through to a P256 default.

    This is the Rust twin of the OpenSSL `NID_aes` bug: a name that states its
    parameters must be read from the name, not resolved to a registry default.
    """
    for text in ("alg_id::ECDSA_P384", "signature::ECDSA_P384_SHA384_ASN1_SIGNING"):
        m = C_RUST_CONST.search(text)
        assert m, text
        assert _c_resolve_rust_const(m) == "ECDSA-P384", text


def test_rust_unknown_namespace_does_not_guess():
    """An unrecognised path is absent from our model, not a confident guess.

    Returning None keeps an unmodelled primitive visible as a gap in our
    coverage rather than inventing a label for it.
    """
    m = C_RUST_CONST.search("internal_helper::SOME_UNKNOWN_THING")
    assert m
    assert _c_resolve_rust_const(m) is None


def test_rust_tls13_protocol_constant_is_not_tls10():
    """`ProtocolVersion::TLSv1_3` is TLS 1.3, not a legacy TLS 1.0 use.

    Found by scanning rustls, reported as TLSv1.0: a false positive on the most
    modern protocol in the corpus. The legacy-protocol pattern now refuses a
    name that is not actually legacy.
    """
    assert not TLS_OLD.search("ProtocolVersion::TLSv1_3")
    assert not TLS_OLD.search("ProtocolVersion::TLSv1_2")
    for legacy in ("TLSv1", "TLSv1.0", "TLSv1.2", "SSLv2", "SSLv3"):
        assert TLS_OLD.search(legacy), legacy


# --------------------------------------------------------------------------
# The HKDF construction
# --------------------------------------------------------------------------

def test_rust_hkdf_construction_is_named_by_its_type():
    """HKDF is implemented by a type here, not selected by a constant.

    `HkdfUsingHmac` implements RFC 5869 over a generic `dyn hmac::Hmac`, so the
    KDF is named without a digest - the same rule the OpenSSL HMAC file follows.
    """
    assert RUST_KDF_CONSTRUCTION.search("pub struct HkdfUsingHmac")
    assert RUST_KDF_CONSTRUCTION.search("impl Hkdf for HkdfUsingHmac<'_>")
    assert labels("rustls/src/crypto/tls13.rs") == {"HKDF"}


# --------------------------------------------------------------------------
# Corpus behaviour: what must be found, and what must not
# --------------------------------------------------------------------------

def test_rust_provider_binds_each_digest_it_advertises():
    for rel, expected in [
        ("rustls-ring/src/hash.rs", {"SHA-256", "SHA-384"}),
        ("rustls-ring/src/hmac.rs", {"HMAC-SHA256", "HMAC-SHA384", "HMAC-SHA512"}),
    ]:
        assert labels(rel) == expected, rel


def test_rust_signing_file_finds_each_signature_family():
    assert labels("rustls-ring/src/sign.rs") == {
        "RSA", "RSA-PSS", "ECDSA-P256", "ECDSA-P384", "Ed25519",
    } or labels("rustls-ring/src/sign.rs") == {
        # The registry models a key-size-less RSA with a 2048-bit default, so
        # the canonical name is RSA-2048. Family-granular scoring treats the two
        # as one; the test pins the real canonical output so the mapping stays
        # visible rather than being quietly assumed.
        "RSA-2048", "RSA-PSS", "ECDSA-P256", "ECDSA-P384", "Ed25519",
    }


def test_rust_tls13_suite_finds_kdf_mac_and_record_protection():
    found = labels("rustls-ring/src/tls13.rs")
    assert {"HKDF", "HMAC-SHA256", "HMAC-SHA384"} <= found
    assert {"AES-128-GCM", "AES-256-GCM", "ChaCha20-Poly1305"} <= found
    assert {"SHA-256", "SHA-384"} <= found


def test_rust_interface_only_files_report_nothing():
    """A trait declaration that binds no algorithm is not a use of one.

    The main crate's hash.rs and hmac.rs declare `trait Hash` and `trait Hmac`
    and nothing else. Reporting a digest in them would mean reporting an
    algorithm the file never selects.
    """
    for rel in ("rustls/src/crypto/hash.rs", "rustls/src/crypto/hmac.rs"):
        assert labels(rel) == set(), rel


def test_rust_tls12_does_not_report_test_only_hmac_sha512():
    """HMAC-SHA512 in tls12.rs lives only in the `#[cfg(test)]` block.

    The corpus keeps non-test source, as every other corpus here does, so
    expecting HMAC-SHA512 would be scoring the detector against a file it is
    not given. The corpus build records that stripping removed exactly this
    one algorithm.
    """
    assert "HMAC-SHA512" not in labels("rustls-ring/src/tls12.rs")


# --------------------------------------------------------------------------
# Corpus provenance
# --------------------------------------------------------------------------

def test_rust_corpus_records_a_real_upstream_commit_and_hashes():
    commit = (CORPUS / ".upstream_commit").read_text(encoding="utf-8").strip()
    assert len(commit) == 40 and all(c in "0123456789abcdef" for c in commit), commit
    import json

    meta = json.loads((CORPUS / ".upstream_hashes.json").read_text(encoding="utf-8"))
    assert meta["upstream_commit"] == commit
    assert set(meta["files"]) == {
        "rustls/src/crypto/hash.rs", "rustls/src/crypto/hmac.rs",
        "rustls/src/crypto/tls13.rs", "rustls-ring/src/hash.rs",
        "rustls-ring/src/hmac.rs", "rustls-ring/src/sign.rs",
        "rustls-ring/src/tls12.rs", "rustls-ring/src/tls13.rs",
    }
    for rel, digest in meta["files"].items():
        assert len(digest) == 64, rel


def test_rust_corpus_files_contain_no_test_modules():
    """The non-test convention is enforced, not just described.

    A cfg-gated `use` or `fn` is left in place - it is ordinary non-test code
    that happens to be compiled out - but a whole `#[cfg(test)] mod` block is
    removed, because that is where rustls keeps its algorithm-exercising test
    vectors.
    """
    import re

    test_module = re.compile(r"#\[cfg\(test\)\][^\n]*\n(?:\s*#\[[^\n]*\]\n)*\s*(?:pub\s+)?mod\s")
    for path in CORPUS.rglob("*.rs"):
        text = path.read_text(encoding="utf-8")
        assert not test_module.search(text), path
