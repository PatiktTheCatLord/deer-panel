@echo off
rem Keeps the bot running: starts it, and restarts it 10 seconds after it stops or crashes.
rem Output goes to logs\bot.log. Stop everything with stop-bot.cmd.
cd /d "%~dp0"
if not exist logs mkdir logs

:loop
echo [%date% %time%] Starting bot >> logs\bot.log
node src\index.js >> logs\bot.log 2>&1
echo [%date% %time%] Bot stopped (exit code %errorlevel%), restarting in 10 seconds >> logs\bot.log
timeout /t 10 /nobreak >nul
goto loop
