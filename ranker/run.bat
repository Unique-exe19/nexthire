@echo off
echo ==========================================
echo   NextHire — AI Recruiter Ranking Engine
echo ==========================================
echo.

echo [MODE] Running on FULL dataset (100,000 candidates)...
echo [INFO] This will take ~2-4 minutes. Please wait...
py -3.12 ranker.py

echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Submission saved to: ..\submission.csv
) else (
    echo [ERROR] Ranker failed. Check logs above.
)
pause
