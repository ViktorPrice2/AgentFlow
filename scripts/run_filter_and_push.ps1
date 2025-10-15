Param(
  [string]$TargetPath = 'app/node_modules/electron/dist/electron.exe',
  [string]$Remote = 'origin',
  [string]$Branch = 'main'
)

function Run($cmd) {
  Write-Host ">> $cmd" -ForegroundColor DarkCyan
  cmd /c $cmd
  return $LASTEXITCODE
}

Write-Host "Check working tree clean..." -ForegroundColor Green
$porcelain = (& git status --porcelain) 2>$null
if ($porcelain) {
  Write-Host "Working tree is not clean. Auto-staging and committing WIP changes..." -ForegroundColor Yellow
  # stage everything (including untracked) and commit as WIP so history rewrite proceeds from a clean state
  & git add -A
  & git commit -m "wip: auto pre-filter commit" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "No changes were committed (maybe nothing to commit) or commit failed. Continuing..." -ForegroundColor Cyan
  } else {
    Write-Host "WIP commit created." -ForegroundColor Green
  }
}

Write-Host "Check git-filter-repo availability..." -ForegroundColor Green
# prefer global "git filter-repo", fallback to "python -m git_filter_repo"
$filterCmd = $null
git filter-repo --help > $null 2>&1
if ($LASTEXITCODE -eq 0) {
  $filterCmd = "git filter-repo"
} else {
  python -m git_filter_repo --help > $null 2>&1
  if ($LASTEXITCODE -eq 0) {
    $filterCmd = "python -m git_filter_repo"
  } else {
    Write-Host "git-filter-repo not available. Install via: python -m pip install --user git-filter-repo" -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "This will remove from history: $TargetPath" -ForegroundColor Yellow
$confirm = Read-Host "Proceed to rewrite history and remove the file? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
  Write-Host "Aborted by user." -ForegroundColor Cyan
  exit 0
}

# Run git-filter-repo using chosen command
$escaped = $TargetPath.Replace('"', '\"')
$cmd = "$filterCmd --invert-paths --path `"$escaped`" --force"
$rc = Run $cmd
if ($rc -ne 0) {
  Write-Host "git-filter-repo failed with exit code $rc" -ForegroundColor Red
  exit $rc
}

Write-Host "Expiring reflog and running garbage collection..." -ForegroundColor Green
Run "git reflog expire --expire=now --all"
Run "git gc --prune=now --aggressive"

Write-Host ""
$pushConfirm = Read-Host "Force-push rewritten history to $Remote/$Branch now? (This rewrites remote) (y/N)"
if ($pushConfirm -ne 'y' -and $pushConfirm -ne 'Y') {
  Write-Host "Skipped push. To publish changes later run:" -ForegroundColor Cyan
  Write-Host "  git push --force $Remote HEAD:$Branch" -ForegroundColor Cyan
  exit 0
}

Write-Host "Force-pushing to $Remote/$Branch ..." -ForegroundColor Green
$rc2 = Run "git push --force $Remote HEAD:$Branch"
if ($rc2 -ne 0) {
  Write-Host "Force-push failed with code $rc2. Inspect output." -ForegroundColor Red
  exit $rc2
}

Write-Host "Done. Inform collaborators to re-clone or reset to the updated $Remote/$Branch." -ForegroundColor Green
exit 0