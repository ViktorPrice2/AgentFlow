Param()

$root = $PSScriptRoot
$scriptRel = Join-Path $root 'scripts\cleanup_history.ps1'

if (Test-Path $scriptRel) {
    Write-Host "Found helper script: $scriptRel" -ForegroundColor Green
    Write-Host "Executing helper script..." -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptRel
    Exit $LASTEXITCODE
} else {
    Write-Host "Helper script not found at: $scriptRel" -ForegroundColor Red
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1) Run the helper directly (if present):" -ForegroundColor Cyan
    Write-Host "       powershell -ExecutionPolicy Bypass -File .\scripts\cleanup_history.ps1" -ForegroundColor Cyan
    Write-Host "  2) Copy helper to project root and run:" -ForegroundColor Cyan
    Write-Host "       copy .\scripts\cleanup_history.ps1 .\cleanup_history.ps1" -ForegroundColor Cyan
    Write-Host "  3) Or follow manual instructions in the repository README." -ForegroundColor Cyan
    Exit 1
}
