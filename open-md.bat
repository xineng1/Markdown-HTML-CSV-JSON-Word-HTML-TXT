@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem  MD Reader launcher
rem  Usage: set this .bat as the default app for .md files,
rem         or simply drag a .md file onto it.
rem
rem  Why not just open index.html directly?
rem  A file:// page is not allowed to read other local files
rem  unless the browser is started with --allow-file-access-from-files.
rem  This script writes the target path into _last_open.txt and
rem  starts the browser with that flag, passing ?autofile=1.
rem
rem  Tip: append --app="%PAGE%" to the start command if you prefer
rem       a chromeless app window.
rem ============================================================

set "TARGET=%~1"
if not defined TARGET (
  echo [MD Reader] No file given. Drag a .md file onto this script,
  echo             or set it as the default app for .md files.
  timeout /t 4 >nul
  exit /b 1
)

set "HERE=%~dp0"
set "ARGFILE=%HERE%_last_open.txt"

rem Write the absolute path in UTF-8 for the page to read back.
>"%ARGFILE%" echo %TARGET%

rem ---- locate a Chromium based browser ----
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

set "PROFILE=%LOCALAPPDATA%\MDReader\Profile"
set "PAGE=file:///%HERE:\=/%index.html?autofile=1"

if defined BROWSER (
  start "" "%BROWSER%" --user-data-dir="%PROFILE%" --allow-file-access-from-files --no-first-run --no-default-browser-check "%PAGE%"
) else (
  rem No Chromium found: fall back to the default browser.
  start "" "%PAGE%"
)

endlocal
