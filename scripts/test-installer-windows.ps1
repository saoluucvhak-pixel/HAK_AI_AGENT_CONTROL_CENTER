# Installation / upgrade / uninstall acceptance for the Windows installer. Runs on a Windows machine (CI runner or VM).
# Usage: test-installer-windows.ps1 -OldInstaller old.exe -NewInstaller new.exe -NewVersion X -OldVersion Y
param([Parameter(Mandatory)][string]$OldInstaller,[Parameter(Mandatory)][string]$NewInstaller,[Parameter(Mandatory)][string]$OldVersion,[Parameter(Mandatory)][string]$NewVersion)
$ErrorActionPreference = 'Stop'
$results = @()
function Record($id,$name,$ok,$detail){ $script:results += [pscustomobject]@{id=$id;name=$name;result=$(if($ok){'PASS'}else{'FAIL'});detail=$detail}; Write-Host ("[{0}] {1} {2} {3}" -f $(if($ok){'PASS'}else{'FAIL'}),$id,$name,$detail) }
$installDir = Join-Path $env:RUNNER_TEMP 'hak-install-test'
if (-not $env:RUNNER_TEMP) { $installDir = Join-Path $env:TEMP 'hak-install-test' }
$dataDir = Join-Path $env:LOCALAPPDATA 'HAK\AI_AGENT_CONTROL_CENTER'
if (Test-Path $dataDir) { Remove-Item $dataDir -Recurse -Force }
$port = 47311
$env:PORT = "$port"; $env:HAK_NO_BROWSER = '1'
function Install($exe,$extra=@()) {
  $p = Start-Process -FilePath $exe -ArgumentList (@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS=desktopicon',"/DIR=$installDir","/LOG=$installDir.log")+$extra) -Wait -PassThru
  return $p.ExitCode
}
# -Wait would also wait for descendants (the detached backend never exits); wait only for wscript itself.
function StartHak {
  $p = Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$installDir\HAK_AI_AGENT.vbs`"" -PassThru
  if (-not $p.WaitForExit(90000)) { throw 'launcher did not return within 90s' }
}
function WaitHealth { for($i=0;$i -lt 60;$i++){ try { return Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 2 } catch { Start-Sleep -Milliseconds 500 } }; return $null }
function StopHak { & "$installDir\runtime\node.exe" "$installDir\scripts\stop.mjs" | Out-Null; Start-Sleep -Seconds 2 }
function Desktop { [Environment]::GetFolderPath('Desktop') }
function StartMenu { Join-Path ([Environment]::GetFolderPath('Programs')) 'HAK AI Agent Control Center' }

# TC01 install old version
$rc = Install $OldInstaller
Record 'TC01' 'Install (old build) exit code 0' ($rc -eq 0) "rc=$rc"
Record 'TC01' 'Bundled runtime present' (Test-Path "$installDir\runtime\node.exe") ''
Record 'TC01' 'Desktop shortcut created' (Test-Path (Join-Path (Desktop) 'HAK AI Agent Control Center.lnk')) ''
Record 'TC01' 'Start Menu shortcut created' (Test-Path (Join-Path (StartMenu) 'HAK AI Agent Control Center.lnk')) ''
StartHak
$h = WaitHealth
Record 'TC01' 'App starts via shortcut launcher and /api/health answers' ($h -and $h.app -eq 'hak-agent-control-center') ($h | ConvertTo-Json -Compress)
Record 'TC01' 'Reported version equals installed version' ($h -and $h.version -eq $OldVersion) "got=$($h.version) want=$OldVersion"
# single instance: starting again must not spawn a second server
StartHak
$count = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -like "$installDir*" -and $_.CommandLine -like '*server.js*' }).Count
Record 'TC01' 'Second launch does not start a second backend' ($count -eq 1) "backends=$count"

# user data written by the app, used to prove upgrade preservation
$sess = Invoke-RestMethod "http://127.0.0.1:$port/api/operator/session"
$headers = @{ 'X-HAK-Operator-Token' = $sess.token; 'Origin' = "http://127.0.0.1:$port" }
$body = @{ title='Upgrade preservation'; description='Work order created before upgrade'; agents=@('backend') } | ConvertTo-Json
$wo = Invoke-RestMethod "http://127.0.0.1:$port/api/v2/work-orders" -Method Post -Headers $headers -Body $body -ContentType 'application/json'
Set-Content -Path (Join-Path $dataDir 'upgrade-marker.txt') -Value 'keep-me'
Record 'TC13' 'Data written before upgrade' (Test-Path (Join-Path $dataDir "work-orders\$($wo.id).json")) "workOrder=$($wo.id)"

# TC13 upgrade in place (installer stops the running instance itself)
$rc = Install $NewInstaller
Record 'TC13' 'Upgrade install exit code 0' ($rc -eq 0) "rc=$rc"
Start-Sleep -Seconds 1
$still = $null; try { $still = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 2 } catch {}
Record 'TC13' 'Running backend was stopped by the installer before files were replaced' ($null -eq $still) ''
StartHak
$h2 = WaitHealth
Record 'TC13' 'Upgraded app starts with new version' ($h2 -and $h2.version -eq $NewVersion) "got=$($h2.version) want=$NewVersion"
Record 'TC13' 'Marker file preserved' ((Get-Content (Join-Path $dataDir 'upgrade-marker.txt')) -eq 'keep-me') ''
$sess2 = Invoke-RestMethod "http://127.0.0.1:$port/api/operator/session"
$h2h = @{ 'X-HAK-Operator-Token' = $sess2.token; 'Origin' = "http://127.0.0.1:$port" }
$list = Invoke-RestMethod "http://127.0.0.1:$port/api/v2/work-orders" -Headers $h2h
Record 'TC13' 'Work order created before upgrade still listed' (@($list.workOrders | Where-Object { $_.id -eq $wo.id }).Count -eq 1) ''
Record 'TC11' 'Server log written to user data directory' (Test-Path (Join-Path $dataDir 'logs\server.log')) ''

# TC14 uninstall (silent): app + shortcuts removed, user data kept by default
$uninst = Get-ChildItem $installDir -Filter 'unins*.exe' | Select-Object -First 1
$p = Start-Process -FilePath $uninst.FullName -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait -PassThru
Record 'TC14' 'Uninstaller exit code 0' ($p.ExitCode -eq 0) "rc=$($p.ExitCode)"
Start-Sleep -Seconds 3
$alive = $false; try { Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 2 | Out-Null; $alive = $true } catch {}
Record 'TC14' 'Backend process stopped' (-not $alive) ''
Record 'TC14' 'Desktop shortcut removed' (-not (Test-Path (Join-Path (Desktop) 'HAK AI Agent Control Center.lnk'))) ''
Record 'TC14' 'Start Menu folder removed' (-not (Test-Path (StartMenu))) ''
Record 'TC14' 'Runtime removed from install directory' (-not (Test-Path "$installDir\runtime\node.exe")) ''
Record 'TC14' 'User data kept on silent uninstall' (Test-Path (Join-Path $dataDir 'upgrade-marker.txt')) ''

# purge option
$rc = Install $NewInstaller
$uninst = Get-ChildItem $installDir -Filter 'unins*.exe' | Select-Object -First 1
$p = Start-Process -FilePath $uninst.FullName -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/PURGEDATA=1' -Wait -PassThru
Start-Sleep -Seconds 2
Record 'TC14' 'Explicit /PURGEDATA=1 removes user data' (-not (Test-Path $dataDir)) ''

$results | ConvertTo-Json | Set-Content -Path 'installer-test-results.json'
$failed = @($results | Where-Object { $_.result -ne 'PASS' }).Count
if ($failed -gt 0) { Write-Host "$failed installer checks FAILED"; exit 1 }
Write-Host 'All installer checks passed'
