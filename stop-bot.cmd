@echo off
rem Stops the background bot started by start-bot.cmd (the restart loop first, then its node process).
rem Only the start-bot.cmd in this folder counts, whatever the folder is called.
set "BOT_SCRIPT=%~dp0start-bot.cmd"
powershell -NoProfile -Command ^
  "$script = $env:BOT_SCRIPT.ToLower();" ^
  "$loops = Get-CimInstance Win32_Process -Filter \"Name = 'cmd.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($script) };" ^
  "$ids = @($loops.ProcessId);" ^
  "$bots = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $ids -contains $_.ParentProcessId };" ^
  "@($loops) + @($bots) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Write-Host ('Stopped ' + @($bots).Count + ' bot process(es).')"
