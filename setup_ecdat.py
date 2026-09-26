#!/usr/bin/env python3
"""ECDAT one-file bootstrap - works on Windows, macOS and Linux.

    python setup_ecdat.py            install, prepare the database, start the API
    python setup_ecdat.py test       install + run the test suite
    python setup_ecdat.py demo       install + start the API + run the demo scan
    python setup_ecdat.py install    install and prepare only

Written in plain Python on purpose: there is no .bat and no .ps1 in this
distribution, so nothing here depends on a Windows shell, and the archive stays
inert to security software that quarantines scripts inside downloads.

It uses only the standard library and the interpreter you are already running.
"""

from __future__ import annotations

import os
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
MIN_PYTHON = (3, 11)


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def step(number: int, total: int, message: str) -> None:
    print(f"\n[{number}/{total}] {message}", flush=True)


def api_is_live(base: str = "http://127.0.0.1:8000") -> bool:
    """Is an ECDAT API already serving on this port? (stdlib only, 2 s budget)"""
    import json
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(f"{base}/api/v1/health", timeout=2) as response:
            return response.status == 200 and "status" in json.loads(response.read())
    except (urllib.error.URLError, OSError, ValueError):
        return False


def run(args: list[str], **kwargs) -> int:
    print("    $ " + " ".join(str(a) for a in args), flush=True)
    return subprocess.call([str(a) for a in args], cwd=str(ROOT), **kwargs)


def main(argv: list[str]) -> int:
    if sys.version_info < MIN_PYTHON:
        print(f"ERROR: Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ is required; "
              f"this is {sys.version.split()[0]}.", file=sys.stderr)
        print("Download Python 3.11 or newer from https://www.python.org/downloads/ "
              "and tick 'Add python.exe to PATH'.", file=sys.stderr)
        return 1
    if not REQUIREMENTS.is_file():
        print(f"ERROR: {REQUIREMENTS} not found. Extract the whole archive before "
              "running this script.", file=sys.stderr)
        return 1

    command = (argv[1] if len(argv) > 1 else "serve").lower()
    total = 4
    print("=" * 64)
    print("  ECDAT - Enterprise Cryptographic Discovery & Analysis Tool")
    print(f"  project: {ROOT}")
    print(f"  python : {sys.version.split()[0]}  ({sys.executable})")
    print("=" * 64)

    step(1, total, "Creating the virtual environment (.venv)")
    if not venv_python().is_file():
        venv.EnvBuilder(with_pip=True, clear=False).create(VENV_DIR)
        print("    created")
    else:
        print("    already exists, reusing it")
    python = venv_python()

    step(2, total, "Installing pinned dependencies")
    if run([python, "-m", "pip", "install", "--quiet", "--upgrade", "pip"]) != 0:
        print("ERROR: could not upgrade pip. Check your internet connection.", file=sys.stderr)
        return 1
    if run([python, "-m", "pip", "install", "--quiet", "-r", "requirements.txt"]) != 0:
        print("ERROR: dependency installation failed.", file=sys.stderr)
        return 1
    print("    done")

    step(3, total, "Creating the database schema")
    if run([python, "-m", "app.manage", "init-db"]) != 0:
        print("ERROR: database initialisation failed.", file=sys.stderr)
        return 1

    if command == "test":
        step(4, total, "Running the test suite")
        return run([python, "-m", "pytest", "tests/", "-q"])

    if command == "install":
        step(4, total, "Ready")
        print(f"\nStart the API with:  {sys.executable} setup_ecdat.py")
        return 0

    if command == "demo":
        step(4, total, "Running the demo scan")
        server = None
        if not api_is_live():
            server = subprocess.Popen(
                [str(python), "-m", "uvicorn", "app.main:app",
                 "--host", "127.0.0.1", "--port", "8000", "--log-level", "warning"],
                cwd=str(ROOT),
            )
            import time
            time.sleep(8)
        else:
            print("    reusing the API already running on port 8000")
        try:
            code = run([python, "-m", "app.manage", "demo-scan",
                        "--api-key", os.getenv("ECDAT_API_KEYS", "dev-ecdat-key").split(",")[0],
                        "--base-url", "http://127.0.0.1:8000"])
            print("\nDocs:  http://127.0.0.1:8000/docs")
            if server is not None:
                print("The API is running in the background. Stop it with CTRL+C here.")
            else:
                print("The API was already running and has been left untouched.")
            return code
        finally:
            if server is not None:
                server.terminate()

    if api_is_live():
        print("\nAn ECDAT API is already running on port 8000 - reusing it.\n"
              "Stop it first (CTRL+C in its window) if you want this script to own the port.")

    step(4, total, "Starting the API")
    print()
    print("=" * 64)
    print("  ECDAT API : http://127.0.0.1:8000")
    print("  Docs      : http://127.0.0.1:8000/docs")
    print("  API key   : dev-ecdat-key   (header: X-API-Key)")
    print("  Stop with : CTRL+C")
    print("=" * 64)
    print()
    return run([python, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
