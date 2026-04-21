@echo off
setlocal

set "ROOT_DIR=%~dp0.."
set "RESULTS_ROOT=%ROOT_DIR%\test-results\continuous-live-runs"
if not exist "%RESULTS_ROOT%" mkdir "%RESULTS_ROOT%"

set "FRONTEND_URL=https://texasholdemfrontend-production.up.railway.app"
set "BACKEND_URL=https://texasholdembackend-production.up.railway.app"
set "MAX_ITERATIONS=0"
set "ITERATION_PAUSE_MS=3000"
set "CONTINUOUS_RESULTS_ROOT=%RESULTS_ROOT%"

node "%~dp0railway-six-player-live-continuous.cjs" 1>> "%RESULTS_ROOT%\runner.stdout.log" 2>> "%RESULTS_ROOT%\runner.stderr.log"
