import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 1. Move corpus to the correct directory
old_dir = ROOT / "corpora" / "tier6_binary_cert"
new_dir = ROOT / "fixtures" / "tier6_binary_cert"
if old_dir.exists() and not new_dir.exists():
    shutil.move(str(old_dir), str(new_dir))
    print("Moved corpus to fixtures/tier6_binary_cert")

# 2. Append labels to the multi-language ground truth
ml_path = ROOT / "fixtures" / "multi_language_ground_truth.json"
with open(ml_path, "r", encoding="utf-8") as f:
    data = json.load(f)

if not any(c["name"] == "Binary & Cert Tier" for c in data["corpora"]):
    data["corpora"].append({
        "name": "Binary & Cert Tier",
        "language": "Mixed (C/ASN.1)",
        "root": "fixtures/tier6_binary_cert",
        "labelled_files": [
            {"file_path": "_ssl.pyd", "expected_algorithms": ["OpenSSL"]},
            {"file_path": "expired_cert.pem", "expected_algorithms": ["RSA", "SHA-256"]},
            {"file_path": "wrong_host_cert.pem", "expected_algorithms": ["RSA", "SHA-256"]}
        ]
    })
    with open(ml_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("Injected Tier 6 into multi_language_ground_truth.json")

# 3. Patch accuracy_real.py to include the new corpus
real_path = ROOT / "scripts" / "accuracy_real.py"
code = real_path.read_text(encoding="utf-8")

if '"Binary"' not in code:
    code = code.replace(
        '("Rust", "fixtures/rustls_repo", "rustls 0.24.0-dev non-test source"),',
        '("Rust", "fixtures/rustls_repo", "rustls 0.24.0-dev non-test source"),\n            ("Binary", "fixtures/tier6_binary_cert", "Binary & Cert Tier"),'
    )
    code = code.replace(
        '"rustls 0.24.0-dev (Rust)": all_findings["Rust"],',
        '"rustls 0.24.0-dev (Rust)": all_findings["Rust"],\n            "Binary & Cert Tier": all_findings["Binary"],'
    )
    real_path.write_text(code, encoding="utf-8")
    print("Patched scripts/accuracy_real.py")

print("Successfully wired Tier 6 into the CI pipeline.")