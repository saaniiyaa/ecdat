"""Tier 1 - dependency manifests (the SBOM slice of the crypto inventory).

A manifest declaration is *evidence that crypto is present*, never evidence of
how it is used, so every finding from this scanner is `DECLARED_ONLY` and the
policy pack caps it at the medium band. Libraries are also written to the
`dependencies` table so the inventory can answer "which vendor component pulls
this in?".
"""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

from app.registry import library_asset, library_record
from app.scanners.base import DECLARED_ONLY, RawFinding

MANIFEST_EXTS = {".txt", ".json", ".mod", ".toml", ".xml", ".gradle", ".kts", ".csproj", ".gemspec",
                 ".lock", ".yaml", ".yml"}
MANIFEST_NAMES = {"requirements.txt", "requirements-dev.txt", "package.json", "go.mod", "pom.xml",
                  "build.gradle", "build.gradle.kts", "cargo.toml", "gemfile", "composer.json",
                  "pyproject.toml", "packages.config", "podfile.lock", "go.sum", "gradle.lockfile"}
# Files that reach the name==version lockfile parser. Anything outside this set
# is not a lockfile, however manifest-like its contents look.
LOCKFILE_NAMES = {"package-lock.json", "yarn.lock", "poetry.lock", "pnpm-lock.yaml",
                  "cargo.lock", "gemfile.lock", "composer.lock", "Pipfile.lock",
                  "pdm.lock", "go.sum", "packages.lock.json"}
MODULE_PREFIXES = ("spring-boot-starter", "spring-security", "junit", "log4j", "commons-", "mockito",
                   "jackson", "guava", "slf4j", "protobuf", "testng", "assertj")


class ManifestScanner:
    name = "scanner.manifest"
    tier = "manifest"
    source = "static"

    def supports(self, path: Path, size: int) -> bool:
        if path.name.lower() in MANIFEST_NAMES:
            return True
        return path.suffix.lower() in {".csproj", ".gemspec"} or path.suffix.lower() == ".lock"

    def scan_text(self, text: str, rel_path: str) -> list[RawFinding]:
        name = rel_path.rsplit("/", 1)[-1].lower()
        deps: list[tuple[str, str | None, str]] = []
        try:
            if name == "requirements.txt" or name.startswith("requirements"):
                deps = self._requirements(text)
            elif name == "package.json":
                deps = self._package_json(text)
            elif name == "go.mod":
                deps = self._go_mod(text)
            elif name in {"cargo.toml", "pyproject.toml"}:
                deps = self._toml(text, name)
            elif name == "pom.xml":
                deps = self._pom(text)
            elif name.endswith(".csproj"):
                deps = self._csproj(text)
            elif name in {"composer.json"}:
                deps = self._composer(text)
            else:
                # Only genuine lockfiles may reach the name==version parser.
                # Falling through to it for every unrecognised file meant
                # .go and .java source was parsed as if it were a
                # requirements.txt, and every `for` loop and `hash` field
                # became a LIBRARY/ finding. A manifest scanner that invents
                # dependencies is worse than one that misses them.
                if name in LOCKFILE_NAMES:
                    deps = self._requirements(text)
                else:
                    return []
        except Exception:  # a malformed manifest must never abort a scan
            return []

        out: list[RawFinding] = []
        line_no = 0
        for dep_name, version, eco in deps:
            rec = library_record(dep_name, version, eco)
            if not rec or not rec.get("is_crypto_library"):
                continue
            out.append(
                RawFinding(
                    file_path=rel_path,
                    asset=library_asset(rec["name"], version, bool(rec.get("is_pqc_capable"))),
                    detector_id=self.name,
                    evidence_class=DECLARED_ONLY,
                    confidence=0.6,
                    line_start=None,
                    symbol=rec["name"],
                    snippet=f'{rec["name"]}{"==" + version if version else ""} ({eco}) - {rec.get("notes") or ""}',
                    source="static",
                    extra={"ecosystem": eco, "version": version, "library": rec["name"],
                           "is_pqc_capable": bool(rec.get("is_pqc_capable"))},
                )
            )
            line_no += 1
        return out

    # ------------------------------------------------------------------ #
    @staticmethod
    def _requirements(text: str) -> list[tuple[str, str | None, str]]:
        out = []
        for raw in text.splitlines():
            line = raw.split("#")[0].strip()
            if not line or line.startswith("-"):
                continue
            m = re.match(r"^([A-Za-z0-9_.\-\[\]]+)\s*(?:==|>=|~=|\s)\s*([0-9][\w.\-]*)?", line)
            if m:
                out.append((m.group(1), m.group(2), "pypi"))
        return out

    @staticmethod
    def _package_json(text: str) -> list[tuple[str, str | None, str]]:
        data = json.loads(text)
        out = []
        for section in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            for key, value in (data.get(section) or {}).items():
                out.append((key, str(value).lstrip("^~>=< "), "npm"))
        return out

    @staticmethod
    def _go_mod(text: str) -> list[tuple[str, str | None, str]]:
        out = []
        for m in re.finditer(r"^\s*([\w\.\-/~]+\.[\w\.\-/~]+)\s+(v[0-9][\w\.\-\+]*)?", text, re.M):
            name = m.group(1)
            if name.startswith(("github.com/", "golang.org/", "gopkg.in/", "go.uber.org/")):
                out.append((name, m.group(2), "go"))
        return out

    @staticmethod
    def _toml(text: str, filename: str) -> list[tuple[str, str | None, str]]:
        data = tomllib.loads(text)
        out: list[tuple[str, str | None, str]] = []
        for key, table in (data.get("dependencies") or data.get("package", {}).get("dependencies", []) or {}).items():
            if isinstance(table, str):
                out.append((key, table, "pypi" if filename.startswith("pyproject") else "cargo"))
        cargo = data.get("dependencies")
        if isinstance(cargo, list):
            for dep in cargo:
                if isinstance(dep, str):
                    bits = dep.split()
                    out.append((bits[0], bits[1] if len(bits) > 1 else None, "cargo"))
        return out

    @staticmethod
    def _pom(text: str) -> list[tuple[str, str | None, str]]:
        out = []
        for block in re.findall(r"<dependency>(.*?)</dependency>", text, re.S):
            gid = re.search(r"<groupId>(.*?)</groupId>", block)
            aid = re.search(r"<artifactId>(.*?)</artifactId>", block)
            ver = re.search(r"<version>(.*?)</version>", block)
            if not aid:
                continue
            name = f"{gid.group(1).strip()}:{aid.group(1).strip()}" if gid else aid.group(1).strip()
            out.append((name, ver.group(1).strip() if ver else None, "maven"))
        return out

    @staticmethod
    def _csproj(text: str) -> list[tuple[str, str | None, str]]:
        out = []
        for m in re.finditer(r'PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?', text):
            out.append((m.group(1), m.group(2), "nuget"))
        return out

    @staticmethod
    def _composer(text: str) -> list[tuple[str, str | None, str]]:
        data = json.loads(text)
        out = []
        for section in ("require", "require-dev"):
            for key, value in (data.get(section) or {}).items():
                out.append((key, str(value).lstrip("^~>=<v"), "composer"))
        return out


SCANNER = ManifestScanner()
