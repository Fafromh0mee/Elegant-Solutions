$ErrorActionPreference = "Stop"

$hostsPath = Join-Path $env:windir "System32\drivers\etc\hosts"
if (-not (Test-Path -LiteralPath $hostsPath)) {
    exit 0
}

$original = [System.IO.File]::ReadAllText($hostsPath)
$pattern = '(?ms)^# --- ElegantAgent START ---\r?\n.*?^# --- ElegantAgent END ---\r?\n?'
$cleaned = [System.Text.RegularExpressions.Regex]::Replace($original, $pattern, '')

if ($cleaned -ne $original) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($hostsPath, $cleaned, $utf8NoBom)
}
