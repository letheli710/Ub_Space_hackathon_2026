param(
    [string]$Distribution = 'Ubuntu',
    [switch]$NoBuild,
    [switch]$Foreground
)
$ErrorActionPreference = 'Stop'
if ($Distribution -notmatch '^[A-Za-z0-9_.-]+$') {
    throw 'Use a WSL distribution name containing letters, numbers, dots, underscores or hyphens.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($projectRoot -notmatch '^[A-Za-z]:\\') {
    throw 'This launcher expects a project folder on a Windows drive.'
}
$linuxRoot = '/mnt/' + $projectRoot.Substring(0, 1).ToLowerInvariant() + $projectRoot.Substring(2).Replace('\', '/')

Push-Location -LiteralPath $projectRoot
try {
    New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null
    if (-not $NoBuild) {
        # Archive bytes avoid DrvFS extended-attribute failures in Docker contexts.
        & tar.exe -czf .runtime/build-context.tar.gz --exclude=__pycache__ --exclude=*.pyc `
            Dockerfile requirements.lock starship_sim tools worlds config docker assets native
        if ($LASTEXITCODE -ne 0) { throw 'Could not package the Docker context.' }
        & wsl.exe -d $Distribution -u root --cd $linuxRoot -- bash -lc `
            'docker build -t starship-environment:local - < .runtime/build-context.tar.gz'
        if ($LASTEXITCODE -ne 0) { throw 'Container build failed.' }
    }
    # An attached WSL client keeps this distro alive. Systemd services alone
    # do not prevent WSL idle shutdown, even when Docker has running containers.
    if ($Foreground) {
        & wsl.exe -d $Distribution -u root --cd $linuxRoot -- docker compose up --no-build
        if ($LASTEXITCODE -ne 0) { throw 'Simulator exited with an error.' }
    } else {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $stdout = Join-Path $projectRoot ".runtime/simulator-$stamp.log"
        $stderr = Join-Path $projectRoot ".runtime/simulator-$stamp.stderr.log"
        $arguments = "-d $Distribution -u root --cd `"$linuxRoot`" -- docker compose up --no-build"
        $launcher = Start-Process -FilePath "$env:WINDIR\System32\wsl.exe" `
            -ArgumentList $arguments -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        if ($launcher.WaitForExit(1500)) {
            throw "Simulator launch exited with code $($launcher.ExitCode). See $stderr"
        }
        $launcher.Id | Set-Content -LiteralPath '.runtime/launcher.pid'
        Write-Host "Started background WSL session $($launcher.Id). Logs: $stdout"
    }
    Write-Host 'API reference: http://localhost:8000/docs (or your SIM_PORT setting)'
    Write-Host 'Readiness: http://localhost:8000/readyz'
} finally {
    Pop-Location
}
