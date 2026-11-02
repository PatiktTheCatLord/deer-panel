@echo off
rem Opens the Deer Panel desktop app (the bot itself keeps running on the VDS).
start "" "%~dp0panel\node_modules\electron\dist\electron.exe" "%~dp0panel"
