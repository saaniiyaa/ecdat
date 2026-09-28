"""JWK detection and source-context classification.

Two failure modes motivated both of these:

1. A JSON Web Key names no primitive. `{"kty":"RSA","n":...,"e":...}` *is* an RSA
   key, so a scanner that only reads code cannot inventory key management at
   all. The reverse risk is worse: a dict that merely has an "n" key is not a
   key, so the tier has to require the member *set*, not a single token.

2. A test that pins AES-128 on purpose is not a production exposure. Counting it
   as one trains users to ignore the list. The rule is therefore a weight and a
   label - never a filter - and a test for that is a test of the no-hiding
   guarantee.
"""
from __future__ import annotations

from app.scanners.declarations import SCANNER
from app.scanners.source_context import NON_PRODUCTION, PRODUCTION, classify_path


def _names(src: str) -> set[str]:
    return {f.asset["canonical_name"] for f in SCANNER.scan_text(src, "t.py")}


# --------------------------------------------------------------------------- #
# JWK
# --------------------------------------------------------------------------- #

def test_rsa_jwk_with_private_parameters_is_flagged():
    src = """
JWK = {
    "kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256",
    "d": "...", "p": "...", "q": "...", "dp": "...", "dq": "...", "qi": "...",
}
"""
    names = _names(src)
    assert "RSA-2048" in names
    assert "RS256" in names
    assert "PRIVATE-KEY-MATERIAL" in names


def test_ec_jwk_reports_family_curve_and_algorithm():
    src = 'JWK = {"kty": "EC", "crv": "P-384", "x": "...", "y": "...", "alg": "ES384"}'
    names = _names(src)
    assert "ECDSA-P384" in names
    assert "ES384" in names
    # A public EC key carries no private parameters, so it must not be escalated.
    assert "PRIVATE-KEY-MATERIAL" not in names


def test_okp_jwk_reports_ed25519():
    names = _names('JWK = {"kty": "OKP", "crv": "Ed25519", "x": "...", "d": "..."}')
    assert "Ed25519" in names
    assert "PRIVATE-KEY-MATERIAL" in names


def test_public_key_jwk_is_not_escalated():
    names = _names('JWK = {"kty": "RSA", "n": "...", "e": "AQAB", "alg": "RS256"}')
    assert "RSA-2048" in names
    assert "PRIVATE-KEY-MATERIAL" not in names


def test_ordinary_dicts_are_not_keys():
    """The false-positive guard. A dict with one suggestive member is not a JWK."""
    src = """
user = {"name": "a", "email": "b@c.d"}
config = {"n": 3, "name": "retries"}
record = {"x": 1, "y": 2, "d": "2026-01-01"}
"""
    assert "RSA-2048" not in _names(src)
    assert "ECDSA-P256" not in _names(src)
    assert "PRIVATE-KEY-MATERIAL" not in _names(src)


def test_jwk_reports_the_evidence_not_just_the_match():
    findings = SCANNER.scan_text(
        'JWK = {"kty": "RSA", "n": "...", "e": "AQAB", "d": "..."}', "t.py"
    )
    reasons = {f.extra.get("declaration") for f in findings}
    assert any("kty='RSA'" in (r or "") for r in reasons)


# --------------------------------------------------------------------------- #
# source context
# --------------------------------------------------------------------------- #

def test_production_paths():
    for path in ("src/main.py", "app/jwt/api_jwk.py", "lib/crypto/aes.go", "a/b/c.py"):
        assert classify_path(path) == PRODUCTION, path


def test_test_and_fixture_paths():
    for path in ("tests/test_aes.py", "app/jwt/api_jwk_test.go", "src/foo.test.ts",
                 "src/foo.spec.js", "conftest.py", "src/fixtures/keys.json",
                 "testdata/aes.rb", "docs/example.py", "vendor/lib/crypto.php",
                 "build/generated/crypto.cs", "src/__mocks__/jwt.py"):
        assert classify_path(path) == NON_PRODUCTION, path


def test_similar_looking_names_are_not_test_paths():
    """Whole-segment matching, so a real source directory survives."""
    for path in ("src/latest/crypto.py", "src/protest/aes.py", "src/contest/aes.py",
                 "src/testing_utils/aes.py", "src/attestation/crypto.py"):
        assert classify_path(path) == PRODUCTION, path


def test_findings_carry_their_context():
    from app.scanners.source_text import SCANNER as SRC

    finding = SRC.scan_text('Cipher.getInstance("AES/CBC/PKCS5Padding")', "tests/test_aes.java")[0]
    assert finding.extra["source_context"] == NON_PRODUCTION
    assert finding.extra["source_context_note"]

    prod = SRC.scan_text('Cipher.getInstance("AES/CBC/PKCS5Padding")', "src/Aes.java")[0]
    assert prod.extra["source_context"] == PRODUCTION


def test_test_findings_are_downweighted_not_hidden():
    """The load-bearing guarantee: context changes priority, never visibility."""
    from app.services import risk as risk_svc

    common = dict(
        asset={"quantum_status": "shor_vulnerable", "classical_security_bits": 112,
               "family": "RSA", "is_post_quantum": False, "key_size_bits": 2048,
               "canonical_name": "RSA-2048", "asset_type": "algorithm"},
        evidence_class="VERIFIED", confidence=0.9, corroborations=1,
        context={"exposure": "internet_facing", "criticality": "core_operations",
                 "classification": "confidential"},
    )
    prod = risk_svc.assess(**{**common, "context": {**common["context"], "source_context": "production"}})
    test = risk_svc.assess(**{**common, "context": {**common["context"], "source_context": "non_production"}})

    assert test.composite_risk < prod.composite_risk
    assert any(f.rule_id == "M-012" for f in test.factors)
    # Both are still fully assessed - the finding exists either way.
    assert test.band and prod.band


def test_java_jca_literals_are_marked_as_declarations():
    """Declaration-shaped findings must be identifiable in every language.

    The console asks "what does this find that never calls a primitive?". If
    only the Python scanner answers, the question silently returns an empty
    result for Go and Java, which reads as "nothing to find" rather than "not
    measured". The reasoning string is what makes the answer language-neutral.
    """
    from app.scanners.source_text import SCANNER as SRC

    finding = SRC.scan_text(
        'Signature sig = Signature.getInstance("SHA256withRSA");', "src/Auth.java"
    )[0]
    assert finding.extra.get("declaration"), "JCA literal must carry its reasoning"
    assert "SHA256withRSA" in finding.extra["declaration"]


def test_every_detector_reports_a_source_context():
    """No finding may be produced without knowing where it lives.

    A missing context silently means "production" to every downstream weight
    and badge, so a detector that omits it inflates a test-only scan into a set
    of production exposures.
    """
    from app.scanners import configs, source_text
    from app.scanners import declarations, python_ast

    # Probes taken from shapes the existing suite already proves fire, so this
    # test measures context coverage rather than detector reach.
    probes = {
        source_text: ('Cipher.getInstance("AES/CBC/PKCS5Padding")', "src/A.java"),
        configs: ("ssl_protocols TLSv1 TLSv1.1;", "nginx.conf"),
        declarations: ('ALG = {"RS256": hashlib.sha256, "ES256": None}', "jwt/algorithms.py"),
        python_ast: ("import hashlib\nhashlib.md5(b'x')\n", "a.py"),
    }
    for module, (text, path) in probes.items():
        findings = module.SCANNER.scan_text(text, path)
        assert findings, f"{module.__name__} produced no finding for the probe"
        for f in findings:
            assert "source_context" in f.extra, f"{module.__name__} omitted source_context"


def test_no_detector_can_silently_drop_source_context():
    """The permanent guard, over every detector in the package.

    Wiring context into each detector by hand worked, and the next detector
    would have quietly forgotten. A missing context is not cosmetic: every
    downstream weight reads an absent value as "production", so one forgotten
    call site turns a test-only finding into an apparent production exposure -
    the precise error this feature exists to prevent.

    The check is static over the whole package rather than a hand-written list,
    so a new detector is covered the moment it is added with no edit here. A
    runtime probe would only exercise the branches the probe happens to hit,
    which is how the gap got in the first time.
    """
    import pathlib

    from app.scanners import base

    pkg = pathlib.Path(base.__file__).parent
    offenders = [
        path.name for path in sorted(pkg.glob("*.py"))
        if "RawFinding(" in path.read_text(encoding="utf-8")
        and "source_context" not in path.read_text(encoding="utf-8")
    ]
    assert not offenders, f"detectors emitting findings without source_context: {offenders}"
