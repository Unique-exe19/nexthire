@echo off
echo ==========================================
echo   NextHire — AI Recruiter Ranking Engine
echo ==========================================
echo.

REM Check if --sample flag passed
if "%1"=="--sample" (
    echo [MODE] Running on sample dataset (50 candidates)...
    py -3.12 ranker.py --sample
) else (
    echo [MODE] Running on FULL dataset (100,000 candidates)...
    echo [INFO] This will take ~2-4 minutes. Please wait...
    py -3.12 ranker.py
)

echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Submission saved to: ..\submission.csv
) else (
    echo [ERROR] Ranker failed. Check logs above.
)
pause
