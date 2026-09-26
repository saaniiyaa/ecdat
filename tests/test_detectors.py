"""Detection engine unit tests: precision first, no false positives on clean code."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.registry import canonicalise  # noqa: E402
from app.scanners import certs, configs, manifests, python_ast, source_text  # noqa: E402
from app.scanners import binaries as bin_scanner  # noqa: E402

LEGACY_PY = '''
import hashlib, ssl, jwt
from cryptography.hazmat.primitives.asymmetric import rsa, ec
KEY_BITS = 2048

def h(data):
    return hashlib.md5(data).hexdigest()

def k():
    return rsa.generate_private_key(public_exponent=65537, key_size=KEY_BITS)

def ctx():
    return ssl.SSLContext(ssl.PROTOCOL_TLSv1_1)

def tok(u):
    return jwt.encode({"sub": u}, "s", algorithm="HS256")

def none_tok(u):
    return jwt.encode({"sub": u}, "", algorithm="none")
'''

CLEAN_PY = '''
"""Mentions hashlib.md5 and AES-256 in prose only."""
NOTES = "we moved off RSA-2048 last year, now on AES-256"

def add(a, b):
    return a + b
'''

JAVA = '''
public class G {
    void go() throws Exception {
        Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
        g.initialize(1024);
        MessageDigest.getInstance("SHA1withRSA");
        Random r = new Random();
    }
}
'''


def _names(findings):
    return [f.asset["canonical_name"] for f in findings]


def test_python_ast_detects_expected_assets():
    findings = python_ast.SCANNER.scan_text(LEGACY_PY, "app/legacy.py")
    names = _names(findings)
    assert "MD5" in names
    assert "RSA-2048" in names
    assert "TLSv1.1" in names
    assert "HMAC-SHA256" in names
    assert any("JWT-ALG-NONE" in n or "NONE" in n for n in names), names
    assert all(f.evidence_class in {"AST_RESOLVED", "AST_UNRESOLVED"} for f in findings)


def test_python_ast_resolves_module_constant_key_size():
    findings = python_ast.SCANNER.scan_text(LEGACY_PY, "app/legacy.py")
    rsa_findings = [f for f in findings if f.asset["canonical_name"] == "RSA-2048"]
    assert rsa_findings and rsa_findings[0].evidence_class == "AST_RESOLVED"


def test_no_false_positives_on_clean_file():
    assert python_ast.SCANNER.scan_text(CLEAN_PY, "app/clean.py") == []
    assert source_text.SCANNER.scan_text("add(1, 2)  # no crypto here", "app/clean.go") == []


def test_source_text_detects_transformation_strings_and_java_patterns():
    findings = source_text.SCANNER.scan_text(JAVA, "src/G.java")
    names = _names(findings)
    assert "AES-128-CBC" in names
    assert "RSA-1024" in names
    assert "RSA-2048" in names or "RSA-1024" in names  # signature path
    assert "NON-CSPRNG" in names


def test_source_text_skips_comment_lines():
    code = '// Cipher.getInstance("DES/ECB/PKCS5Padding")\nint x = 1;\n'
    assert source_text.SCANNER.scan_text(code, "src/A.java") == []


def test_manifest_declarations_are_capped_as_declared_only():
    findings = manifests.SCANNER.scan_text("cryptography==42.0.5\nrequests==2.31.0\n", "requirements.txt")
    assert len(findings) == 1
    assert findings[0].evidence_class == "DECLARED_ONLY"
    assert findings[0].asset["asset_type"] == "library"


def test_manifest_parses_maven_and_npm():
    pom = """<dependency><groupId>org.bouncycastle</groupId>
             <artifactId>bcprov-jc18on</artifactId><version>1.78</version></dependency>"""
    names = _names(manifests.SCANNER.scan_text(pom, "pom.xml"))
    assert "LIBRARY/org.bouncycastle:bcprov-jc18on@1.78" in names
    pkg = '{"dependencies": {"jose": "^5.6.3", "axios": "^1.0.0"}}'
    assert _names(manifests.SCANNER.scan_text(pkg, "package.json")) == ["LIBRARY/jose@5.6.3"]


def test_config_scanner_flags_weak_suites_and_old_protocols():
    conf = """
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-RSA-AES128-GCM-SHA256:DES-CBC3-SHA:RC4-SHA:NULL-SHA:EXPORT';
    """
    names = _names(configs.SCANNER.scan_text(conf, "nginx.conf"))
    assert "TLSv1.0" in names and "TLSv1.1" in names
    assert "3DES" in names and "RC4" in names


def test_certificate_scanner_parses_pem_without_storing_keys(demo_repo):
    pem = (demo_repo / "certs" / "weak_leaf.pem").read_text()
    findings = certs.SCANNER.scan_text(pem, "certs/weak_leaf.pem")
    names = _names(findings)
    assert "RSA-1024" in names
    assert any("X509/" in n for n in names)
    assert all("PRIVATE KEY" not in (f.snippet or "") for f in findings)


def test_private_key_block_is_redacted(demo_repo):
    pem = (demo_repo / "certs" / "root_ca.key").read_text()
    findings = certs.SCANNER.scan_text(pem, "certs/root_ca.key")
    assert findings
    assert all("BEGIN RSA PRIVATE KEY" not in (f.snippet or "") for f in findings)
    assert all(f.extra.get("hardcoded_material") for f in findings)


def test_binary_scanner_separates_structured_from_inferred(demo_repo):
    data = (demo_repo / "third_party" / "native" / "libcrypto_vendor.so").read_bytes()
    findings = bin_scanner.SCANNER.scan_bytes(data, "vendor/libcrypto_vendor.so")
    classes = {f.evidence_class for f in findings}
    assert "INFERRED" in classes and "SYMBOL_INFERRED" in classes
    names = _names(findings)
    assert "X25519MLKEM768" in names or "ML-KEM-768" in names
    assert any(f.confidence <= 0.5 for f in findings), "inferred findings must stay low confidence"


def test_opaque_blob_yields_nothing(demo_repo):
    data = (demo_repo / "data" / "blob.dat").read_bytes()
    assert bin_scanner.SCANNER.scan_bytes(data, "data/blob.dat") == []


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("RSA-2048", "RSA-2048"),
        ("aes", "AES-256-GCM"),  # bare "AES" resolves to the modern default
        ("AES-256-GCM", "AES-256-GCM"),
        ("sha1", "SHA-1"),
        ("P-256", "ECDSA-P256"),
        ("ecdsa", "ECDSA-P256"),
        ("ml-kem", "ML-KEM-768"),
    ],
)
def test_canonicalise_aliases(raw, expected):
    asset = canonicalise(raw)
    assert asset is not None and asset["canonical_name"] == expected


def test_canonicalise_by_oid():
    assert canonicalise(oid="1.2.840.113549.1.1.1")["canonical_name"] == "RSA-2048"
    assert canonicalise(oid="1.3.101.112")["canonical_name"] == "Ed25519"


def test_unknown_algorithm_is_recorded_not_dropped():
    asset = canonicalise("SomeVendorCipher9000")
    assert asset["quantum_status"] == "unknown"
    assert asset["meta"]["unrecognised"] is True


@pytest.mark.parametrize(
    "member",
    [
        "/etc/cron.d/pwn",            # POSIX absolute
        "//server/share/pwn",         # UNC-ish POSIX
        "C:\\Windows\\System32\\pwn", # Windows absolute - the case a Linux-only check misses
        "C:pwn",                      # Windows drive-relative
        "..\\..\\etc\\pwn",           # Windows traversal with backslashes
        "../../etc/pwn",              # POSIX traversal
        "nested/../../pwn",           # traversal that is not a leading component
        "",                           # empty name
    ],
)
def test_archive_member_names_are_judged_as_both_posix_and_windows(tmp_path, member):
    """Zip-slip / tar-slip guard.

    The scanner ships on Linux *and* Windows. A member name is untrusted text, so it
    must be rejected if it escapes the extraction root under EITHER platform's path
    rules - `C:\\Windows\\...` is a perfectly ordinary-looking relative name to
    PurePosixPath and would be extracted outside the root on a Windows host.
    """
    from app.scanners.containers import _safe_target

    root = tmp_path / "extract"
    root.mkdir()
    assert _safe_target(root, member) is None, f"{member!r} must be rejected"


def test_archive_member_inside_root_is_accepted(tmp_path):
    from app.scanners.containers import _safe_target

    root = tmp_path / "extract"
    root.mkdir()
    (root / "app").mkdir()
    assert _safe_target(root, "app/signing.py") == (root / "app" / "signing.py").resolve()
    assert _safe_target(root, "app\\signing.py") == (root / "app" / "signing.py").resolve()
