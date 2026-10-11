. "$PSScriptRoot/windows-artifacts.ps1"
Set-SmokeCommit
$work = Join-Path $env:TEMP ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $directory = Get-SmokeArtifacts -Work $work -Files @('actiond-worker.exe')
    $help = & (Join-Path $directory 'actiond-worker.exe') --help
    if ($LASTEXITCODE -ne 0 -or -not ($help | Select-String -SimpleMatch 'serve-vm')) { throw 'Windows worker CLI smoke failed' }
    $help | Out-Host
} finally {
    Remove-Item -Recurse -Force -LiteralPath $work
}
