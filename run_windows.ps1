# ECDAT backend - Windows (PowerShell) launcher
#   .\run_windows.ps1            setup + start the API on :8000
#   .\run_windows.ps1 test       setup + run the 84-test suite
#   .\run_windows.ps1 demo       setup + run the demo scan
#
# If PowerShell blocks the script, run it once with:
#   powershell -ExecutionPolicy Bypass -File .\run_windows.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Step($n, $text) { Write-Host "`n[$n/4] $text" -ForegroundColor Cyan }

Step 1 "Checking Python..."
python --version
python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)"
if ($LASTEXITCODE -ne 0) { Write-Error "Python 3.11+ is required."; exit 1 }

Step 2 "Creating virtual environment (.venv)..."
if (-not (Test-Path ".venv\Scripts\python.exe")) { python -m venv .venv }
$py = ".venv\Scripts\python.exe"

Step 3 "Installing dependencies..."
& $py -m pip install --quiet --upgrade pip
& $py -m pip install --quiet -r requirements.txt

Step 4 "Preparing the database..."
& $py -m app.manage init-db

switch ($args[0]) {
  "test" { & $py -m pytest tests/ -q; break }
  "setup" { Write-Host "`nSetup complete. Start with .\run_windows.ps1"; break }
  "demo"  {
    Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000","--log-level","warning" -WindowStyle Minimized
    Start-Sleep -Seconds 8
    & $py -m app.manage demo-scan --api-key dev-ecdat-key --base-url http://127.0.0.1:8000
    Write-Host "`nAPI running in the background. Docs: http://127.0.0.1:8000/docs"
    break
  }
  default {
    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host " ECDAT API : http://127.0.0.1:8000" -ForegroundColor Green
    Write-Host " Docs      : http://127.0.0.1:8000/docs" -ForegroundColor Green
    Write-Host " API key   : dev-ecdat-key" -ForegroundColor Green
    Write-Host " Stop with : CTRL+C" -ForegroundColor Green
    Write-Host "============================================================`n" -ForegroundColor Green
    & $py -m uvicorn app.main:app --host 0.0.0.0 --port 8000
  }
}
