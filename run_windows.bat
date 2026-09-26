@echo off
REM ===========================================================================
REM  ECDAT backend - Windows setup and launch (cmd.exe, no PowerShell needed)
REM  Usage:   run_windows.bat            setup + start the API on :8000
REM           run_windows.bat test       setup + run the 84-test suite
REM           run_windows.bat demo       setup + run the demo scan against a live API
REM ===========================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo [1/4] Checking Python...
where python >nul 2>&1 || (echo ERROR: Python not found. Install Python 3.11+ from python.org and tick "Add to PATH". & exit /b 1)
python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)" || (echo ERROR: Python 3.11+ required. & exit /b 1)
python --version

echo.
echo [2/4] Creating virtual environment (.venv)...
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv || (echo ERROR: venv creation failed. & exit /b 1)
) else (
  echo      .venv already exists - reusing it.
)
set "PY=.venv\Scripts\python.exe"

echo.
echo [3/4] Installing dependencies...
"%PY%" -m pip install --quiet --upgrade pip
"%PY%" -m pip install --quiet -r requirements.txt || (echo ERROR: pip install failed. Try: %PY% -m pip install -r requirements.txt & exit /b 1)

echo.
echo [4/4] Preparing the database...
"%PY%" -m app.manage init-db || exit /b 1

if /i "%~1"=="test" goto :run_tests
if /i "%~1"=="demo" goto :run_demo
if /i "%~1"=="setup" goto :done

:run_server
echo.
echo ============================================================
echo  ECDAT API:  http://127.0.0.1:8000
echo  Docs:       http://127.0.0.1:8000/docs
echo  API key:    dev-ecdat-key
echo  Stop with:  CTRL+C
echo ============================================================
echo.
"%PY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
goto :eof

:run_tests
echo.
"%PY%" -m pytest tests/ -q
goto :eof

:run_demo
echo.
echo Starting the API in the background for the demo scan...
start "ECDAT API" /min "%PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --log-level warning
timeout /t 8 /nobreak >nul
"%PY%" -m app.manage demo-scan --api-key dev-ecdat-key --base-url http://127.0.0.1:8000
echo.
echo The API is still running in the background (window titled "ECDAT API").
echo Open http://127.0.0.1:8000/docs  -  close that window to stop the server.
goto :eof

:done
echo.
echo Setup complete. Start the server with:  run_windows.bat
goto :eof
