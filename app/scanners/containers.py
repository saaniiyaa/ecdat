"""Tier 2 - container images and archives, without a Docker daemon.

An OCI image is a tar of layers, each layer a tar. We open the archive stream,
cap member count and per-member size (zip-bomb guard), reject absolute paths
and `..` traversal, and extract to a scratch directory that the scan runner then
treats as a nested surface tree - so a crypto library baked into a base image
shows up in the inventory with the same fidelity as source code.
"""

from __future__ import annotations

import tarfile
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath

ARCHIVE_SUFFIXES = {".tar", ".tar.gz", ".tgz", ".tar.xz", ".txz", ".zip", ".whl", ".jar", ".apk", ".deb"}


@dataclass
class ExtractionResult:
    extracted_to: str | None
    members: int
    total_bytes: int
    truncated: bool
    note: str | None = None


def is_archive(path: Path) -> bool:
    name = path.name.lower()
    return any(name.endswith(sfx) for sfx in ARCHIVE_SUFFIXES)


def _safe_target(root: Path, member_name: str) -> Path | None:
    """Zip-slip / tar-slip guard.

    An archive member name is untrusted text and must be judged as *both* a POSIX
    and a Windows path: `/etc/cron.d/x` is absolute on Linux, `C:\\Windows\\x` is
    absolute on Windows, and a backslash separator (`..\\..\\x`) is a traversal
    attempt on Windows even though it looks like one harmless name on Linux.
    Checking only the running platform's rules would let a crafted archive escape
    on the other one - and the scanner is expected to run on both.
    """
    if not member_name:
        return None
    normalised = member_name.replace("\\", "/")
    if (
        member_name.startswith("/")
        or normalised.startswith("/")
        or PurePosixPath(normalised).is_absolute()
        or PureWindowsPath(member_name).is_absolute()   # C:\..., \\server\share
        or PureWindowsPath(member_name).drive            # drive-relative, e.g. C:foo
        or ".." in PurePosixPath(normalised).parts
        or ".." in Path(member_name).parts
    ):
        return None
    target = (root / Path(normalised)).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return None
    return target


def extract_archive(
    path: Path,
    dest: Path,
    *,
    max_members: int = 20_000,
    max_member_bytes: int = 64 * 1024 * 1024,
    max_total_bytes: int = 512 * 1024 * 1024,
) -> ExtractionResult:
    dest.mkdir(parents=True, exist_ok=True)
    members = 0
    total = 0
    truncated = False

    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                if members >= max_members or total >= max_total_bytes:
                    truncated = True
                    break
                if info.is_dir():
                    continue
                if info.file_size > max_member_bytes:
                    truncated = True
                    continue
                target = _safe_target(dest, info.filename)
                if target is None:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, open(target, "wb") as out:
                    out.write(src.read())
                members += 1
                total += info.file_size
        return ExtractionResult(str(dest), members, total, truncated)

    try:
        with tarfile.open(path, "r:*") as tf:
            for member in tf:
                if members >= max_members or total >= max_total_bytes:
                    truncated = True
                    break
                if not member.isfile():
                    continue
                if member.size > max_member_bytes:
                    truncated = True
                    continue
                target = _safe_target(dest, member.name)
                if target is None:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                extracted = tf.extractfile(member)
                if extracted is None:
                    continue
                with extracted, open(target, "wb") as out:
                    while chunk := extracted.read(1 << 20):
                        out.write(chunk)
                members += 1
                total += member.size
    except tarfile.TarError as exc:
        return ExtractionResult(None, members, total, True, f"unreadable archive: {exc}")
    except OSError as exc:
        return ExtractionResult(None, members, total, True, f"io error: {exc}")

    return ExtractionResult(str(dest), members, total, truncated)
