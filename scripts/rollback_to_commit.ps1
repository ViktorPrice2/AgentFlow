Param(
  [Parameter(Mandatory=$true)]
  [string]$Commit
)

function Run($cmd) {
  Write-Host ">> $cmd" -ForegroundColor Cyan
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Command failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

# Ensure script run in repo root
$root = Get-Location
Write-Host "Repository root: $root" -ForegroundColor Green

# Check git present
(& git --version) 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "git is required in PATH" -ForegroundColor Red; exit 1 }

# Ensure working tree clean or ask user
$porcelain = (& git status --porcelain) 2>$null
if ($porcelain) {
  Write-Host "Working tree is not clean. Commit or stash changes first." -ForegroundColor Yellow
  Write-Host $porcelain
  $choice = Read-Host "Commit all changes as WIP now? (y/N)"
  if ($choice -eq 'y' -or $choice -eq 'Y') {
    Run "git add -A"
    Run "git commit -m `"wip: pre-rollback commit`""
  } else {
    Write-Host "Please commit or stash and re-run the script." -ForegroundColor Yellow
    exit 1
  }
}

# Create backup branch
$ts = (Get-Date).ToString('yyyyMMddHHmmss')
$backup = "backup-main-$ts"
Write-Host "Creating backup branch: $backup" -ForegroundColor Green
Run "git branch $backup"

# Fetch remote refs
Write-Host "Fetching origin..." -ForegroundColor Green
Run "git fetch origin"

# Verify commit exists locally or try fetching it
$exists = (& git cat-file -t $Commit) 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit not found locally. Attempting to fetch it from origin..." -ForegroundColor Yellow
  Run "git fetch origin $Commit"
  $exists = (& git cat-file -t $Commit) 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit $Commit not found. Aborting." -ForegroundColor Red
    exit 1
  }
}

# Confirm destructive action
Write-Host ""
Write-Host "About to reset current branch to commit: $Commit" -ForegroundColor Yellow
$confirm = Read-Host "Proceed with git reset --hard $Commit? This will move the current branch. (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') { Write-Host "Aborted by user." -ForegroundColor Cyan; exit 0 }

# Perform hard reset
Write-Host "Resetting HEAD to $Commit" -ForegroundColor Green
Run "git reset --hard $Commit"

# Offer force-push
$pushConfirm = Read-Host "Force-push this branch to origin/main? (Will rewrite remote) (y/N)"
if ($pushConfirm -eq 'y' -or $pushConfirm -eq 'Y') {
  Write-Host "Force-pushing to origin main..." -ForegroundColor Green
  Run "git push --force origin HEAD:main"
  Write-Host "Force-push completed. Inform collaborators to re-clone or reset their branches." -ForegroundColor Yellow
} else {
  Write-Host "Local reset done. To update remote later run: git push --force origin HEAD:main" -ForegroundColor Cyan
}

Write-Host "Done. Backup branch preserved: $backup" -ForegroundColor Green
Exit 0
