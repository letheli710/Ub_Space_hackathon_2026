param([string]$Distribution = 'Ubuntu')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($projectRoot -notmatch '^[A-Za-z]:\\') {
    throw 'This launcher expects a project folder on a Windows drive.'
}
$linuxRoot = '/mnt/' + $projectRoot.Substring(0, 1).ToLowerInvariant() + $projectRoot.Substring(2).Replace('\', '/')
Push-Location -LiteralPath $projectRoot
try {
    & wsl.exe -d $Distribution -u root --cd $linuxRoot -- docker compose down
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the simulator.' }
    # Compose exits automatically, allowing the hidden WSL session to close.
    Write-Host 'Stopped the simulator and its attached WSL session.'
} finally {
    Pop-Location
}
