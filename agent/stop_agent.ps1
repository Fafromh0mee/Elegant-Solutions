param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath
)

$ErrorActionPreference = "Stop"
$targetPath = [System.IO.Path]::GetFullPath($ExecutablePath)

Get-CimInstance Win32_Process |
    Where-Object {
        $_.ExecutablePath -and
        ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $targetPath)
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
    }
