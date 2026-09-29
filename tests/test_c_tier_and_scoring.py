"""The C/OpenSSL tier, and the scoring rule that judges it.

Two things are pinned here.

The C tier: before it existed the scanner returned *nothing* against OpenSSL -
not a weak result, zero. A regex tier that only understood Java's naming
convention is blind to C, where a primitive is selected by a function name and
never appears as a string. That is the reason these tests exist: the failure was
invisible until a real C corpus was measured.

The scorer: it was scoring at family granularity, which could not distinguish a
detector that found all three SHA-2 members from one that found a single one.
The tests below are the ones that would have caught that, and they are written
to fail if the rule is ever loosened again.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys

from app.scanners.source_text import SCANNER

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _load_scorer():
    spec = importlib.util.spec_from_file_location("accuracy_real", ROOT / "scripts" / "accuracy_real.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _names(src: str, path: str = "x.c") -> set[str]:
    return {f.asset["canonical_name"] for f in SCANNER.scan_text(src, path)}


# --------------------------------------------------------------------------- #
# C / OpenSSL
# --------------------------------------------------------------------------- #

def test_c_tier_finds_evp_calls():
    """A textbook EVP call must not be invisible."""
    src = """
EVP_MD_CTX *ctx = EVP_MD_CTX_new();
EVP_DigestInit_ex(ctx, EVP_sha256(), NULL);
EVP_DigestInit_ex(ctx, EVP_md5(), NULL);
EVP_CipherInit_ex(c, EVP_aes_256_gcm(), NULL, key, iv, 1);
EVP_CipherInit_ex(c, EVP_des_ede3_cbc(), NULL, key, iv, 1);
"""
    names = _names(src)
    assert "SHA-256" in names
    assert "MD5" in names
    assert "AES-256-GCM" in names
    assert "3DES" in names


def test_c_tier_reads_implementation_functions():
    src = """
int MD5_Init(MD5_CTX *c) { return 1; }
void DES_encrypt3(DES_LONG *data, DES_key_schedule *ks1, DES_key_schedule *ks2,
                  DES_key_schedule *ks3) { }
void BF_encrypt(BF_LONG *data, const BF_KEY *key) { }
"""
    names = _names(src)
    assert "MD5" in names
    # Three key schedules is Triple-DES, not single DES.
    assert "3DES" in names
    assert "Blowfish" in names


def test_des_encrypt3_is_not_reported_as_plain_des():
    """The single most consequential C distinction.

    DES_encrypt3 takes three key schedules. Reporting that as bare DES would
    both mislabel a different algorithm and hide that it is the deprecated one.
    """
    assert "3DES" in _names("void DES_encrypt3(DES_LONG *d, DES_key_schedule *a,"
                            " DES_key_schedule *b, DES_key_schedule *c) { }")
    assert "DES" in _names("void DES_encrypt1(DES_LONG *d, DES_key_schedule *k, int e) { }")


def test_sha_family_is_not_collapsed():
    """SHA256 must not become a generic "SHA-2" because it starts with SHA2."""
    names = _names("int SHA256_Init(SHA256_CTX *c) { return 1; }")
    assert "SHA-256" in names
    assert "SHA-2" not in names


def test_nid_registry_names_are_exact():
    """A NID names a specific member. sha3_224 is not SHA3-256."""
    assert "SHA3-224" in _names("static const NID_sha3_224 = 1;")
    assert "SHA3-512" in _names("static const NID_sha3_512 = 1;")
    assert "SHA-512/224" in _names("static const NID_sha512_224 = 1;")


def test_aes_key_size_comes_from_the_macro_argument():
    """`NID_aes` alone must not invent a key size.

    OpenSSL's EVP table passes the size as the next macro argument. Resolving
    the NID on its own would report a size the source never stated.
    """
    assert "AES-128-GCM" in _names("BLOCK_CIPHER_custom(NID_aes, 128, 1, 12, gcm, GCM, 0, 0, 0, 0)")
    assert "AES-256-GCM" in _names("BLOCK_CIPHER_custom(NID_aes, 256, 1, 12, gcm, GCM, 0, 0, 0, 0)")
    assert "AES-192-GCM" in _names("BLOCK_CIPHER_generic_pack(NID_aes, 192, 0)")


def test_generic_hmac_does_not_invent_a_digest():
    """`HMAC_Init_ex` takes the digest as a parameter.

    Mapping the bare name to HMAC-SHA256 reported a digest the source never
    mentioned - the one construct where inventing specificity is least
    defensible.
    """
    names = _names("int HMAC_Init_ex(HMAC_CTX *ctx, const void *key, int len,"
                   " const EVP_MD *md, ENGINE *impl) { }")
    assert "HMAC" in names
    assert "HMAC-SHA256" not in names


def test_c_tier_does_not_fire_on_unrelated_c():
    src = """
int main(void) {
    printf("hello world");
    struct stat st;
    return 0;
}
"""
    assert _names(src) == set()


# --------------------------------------------------------------------------- #
# Registry robustness
# --------------------------------------------------------------------------- #

def test_aes_192_does_not_crash_the_registry():
    """A crash here took every other finding in the file with it.

    Only 128- and 256-bit AES have policy entries. AES-192 and AES-512 are real
    and appear in the wild, so an unlisted variant must still be reportable.
    """
    from app.registry import canonicalise

    for name in ("AES-192", "AES-512-GCM", "AES-192-CBC"):
        asset = canonicalise(name)
        assert asset is not None, f"{name} must resolve"
        assert str(name).replace("-", "")[:3] in asset["canonical_name"].replace("-", "").upper()


def test_hmac_family_and_instance_are_distinct():
    from app.registry import canonicalise

    assert canonicalise("HMAC")["canonical_name"] == "HMAC"
    assert canonicalise("HMAC-SHA256")["canonical_name"] == "HMAC-SHA256"
    assert canonicalise("HMAC-SHA1")["canonical_name"] == "HMAC-SHA1"


# --------------------------------------------------------------------------- #
# The scoring rule
# --------------------------------------------------------------------------- #

def test_extra_detector_specificity_is_not_a_mismatch():
    """An expected label constrains only what it names."""
    ar = _load_scorer()
    assert ar._label_satisfies("AES-128", "AES-128-GCM")
    assert ar._label_satisfies("AES-256", "AES-256-CBC")


def test_conflicting_specifiers_are_never_forgiven():
    """These are the cases family-granular scoring got wrong.

    Each pair is a different algorithm. Scoring them as equivalent inflated the
    true-positive count in the one direction nobody is watching for.
    """
    ar = _load_scorer()
    for expected, detected in [
        ("AES-128", "AES-256-GCM"),
        ("SHA-256", "SHA-512"),
        ("HMAC-SHA256", "HMAC-SHA384"),
        ("Ed25519", "Ed448"),
        ("3DES", "DES"),
        ("ECDSA-P256", "ECDSA-P384"),
    ]:
        assert not ar._label_satisfies(expected, detected), \
            f"{expected} must not satisfy {detected}"


def test_conflicting_modes_are_not_forgiven():
    ar = _load_scorer()
    assert not ar._label_satisfies("AES-256-CBC", "AES-256-GCM")


def test_unexpected_family_is_a_false_positive():
    ar = _load_scorer()
    assert not ar._label_satisfies("SHA-256", "MD5")
    assert not ar._label_satisfies("RSA-PSS", "RSA-2048")
