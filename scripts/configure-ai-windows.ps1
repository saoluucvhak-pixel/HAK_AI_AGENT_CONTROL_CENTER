$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Write-Host 'HAK AI local configuration (do not share API credentials)' -ForegroundColor Cyan
Write-Host 'OmniRoute must be running on this PC and support /v1/chat/completions.'
$url = Read-Host 'Local gateway URL [http://127.0.0.1:20128]'
if ([string]::IsNullOrWhiteSpace($url)) { $url = 'http://127.0.0.1:20128' }
$uri = [Uri]$url
if ($uri.Scheme -ne 'http' -or @('127.0.0.1','localhost','[::1]') -notcontains $uri.Host -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) { throw 'Only a local HTTP gateway URL without path or credentials is supported.' }
$model = Read-Host 'Model identifier [auto]'
if ([string]::IsNullOrWhiteSpace($model)) { $model = 'auto' }
if ($model -cnotmatch '^[a-zA-Z0-9_./:-]{1,128}$') { throw 'Invalid model identifier' }
$key = Read-Host 'OmniRoute API key (hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($plain.Length -lt 16 -or $plain -match '[\r\n]') { throw 'API key must be at least 16 characters and single-line' }
try {
 $values = @(
  'HAK_AGENT_EXECUTION_ENABLED=true',
  'HAK_OMNIROUTE_ENABLED=true',
  'HAK_OMNIROUTE_URL=' + $url,
  'HAK_OMNIROUTE_MODEL=' + $model,
  'HAK_OMNIROUTE_API_KEY=' + $plain
 )
 $target = Join-Path $root '.env'
 $temp = Join-Path $root ('.env.' + [Guid]::NewGuid().ToString('N') + '.tmp')
 # Preserve every unrelated setting; keep a backup so a failed write can be rolled back.
 $existing = @()
 if (Test-Path -LiteralPath $target) {
  $existing = @([IO.File]::ReadAllLines($target))
  Copy-Item -LiteralPath $target -Destination ($target + '.bak') -Force
 }
 $managed = '^(HAK_AGENT_EXECUTION_ENABLED|HAK_OMNIROUTE_ENABLED|HAK_OMNIROUTE_URL|HAK_OMNIROUTE_MODEL|HAK_OMNIROUTE_API_KEY)='
 $merged = @($existing | Where-Object { $_ -notmatch $managed }) + $values
 [IO.File]::WriteAllLines($temp, $merged, (New-Object Text.UTF8Encoding($false)))
 Move-Item -LiteralPath $temp -Destination $target -Force
 Write-Host 'Saved local settings. Restart HAK_START_WINDOWS.cmd to apply.' -ForegroundColor Green
} catch { if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Force }; throw } finally { $plain = $null; $values = $null }
