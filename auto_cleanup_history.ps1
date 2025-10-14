Param()

$root = $PSScriptRoot
$helper = Join-Path $root 'scripts\auto_cleanup_history.ps1'

if (Test-Path $helper) {
    Write-Host "Found helper script: $helper" -ForegroundColor Green
    Write-Host "Executing helper script..." -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File $helper
    Exit $LASTEXITCODE
} else {
    Write-Host "Helper script not found at: $helper" -ForegroundColor Red
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1) Run the helper directly if present in scripts folder:" -ForegroundColor Cyan
    Write-Host "       powershell -ExecutionPolicy Bypass -File .\scripts\auto_cleanup_history.ps1" -ForegroundColor Cyan
    Write-Host "  2) Or copy the helper to the project root and run:" -ForegroundColor Cyan
    Write-Host "       copy .\scripts\auto_cleanup_history.ps1 .\auto_cleanup_history.ps1" -ForegroundColor Cyan
    Exit 1
}
