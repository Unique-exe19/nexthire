@echo off
echo ==========================================
echo   NextHire - AI Recruiter Ranking Engine
echo ==========================================
echo.

echo [MODE] Running on FULL dataset (100,000 candidates)...
echo [INFO] CPU-only, network-free. Typically ~20-60s with cache.
REM Run from repo root regardless of where this script is invoked from.
pushd "%~dp0\.."
set NEXTHIRE_USE_REDIS=0
set NEXTHIRE_ALLOW_GPU=0
py -3.12 ranker\ranker.py --input dataset\India_runs_data_and_ai_challenge\candidates.json --output submission.csv

echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Submission saved to: submission.csv
) else (
    echo [ERROR] Ranker failed. Check logs above.
)
popd
pause
