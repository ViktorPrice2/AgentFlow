Param(
  [Parameter(Mandatory=$true)]
  [string]$Commit
)

function Run($cmd) {
  Write-Host ">> $cmd" -ForegroundColor Cyan
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Command returned exit code $LASTEXITCODE" -ForegroundColor Yellow
  }
}

# 0) checks
Write-Host "Rollback & cleanup helper" -ForegroundColor Green
(& git --version) 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "git required in PATH" -ForegroundColor Red; exit 1 }

# 1) ensure working tree clean or commit/stash
$porcelain = (& git status --porcelain) 2>$null
if ($porcelain) {
  Write-Host "Working tree not clean. Changes:" -ForegroundColor Yellow
  Write-Host $porcelain
  $choice = Read-Host "Commit all changes as WIP (C), Stash (S), Abort (A)? (C/S/A)"
  if ($choice -eq 'C') { Run "git add -A"; Run "git commit -m `"wip: pre-rollback commit`"" }
  elseif ($choice -eq 'S') { Run "git stash push -u -m `"auto_cleanup_preflight`"" }
  else { Write-Host "Aborted by user." -ForegroundColor Cyan; exit 1 }
}

# 2) create backup branch
$ts = (Get-Date).ToString('yyyyMMddHHmmss')
$backup = "backup-main-$ts"
Run "git branch $backup"
Write-Host "Backup branch created: $backup" -ForegroundColor Green

# 3) fetch and verify commit
Run "git fetch --all --prune"
$exists = (& git cat-file -t $Commit) 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit not found locally. Attempting to fetch it from origin..." -ForegroundColor Yellow
  Run "git fetch origin $Commit"
  $exists = (& git cat-file -t $Commit) 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "Commit $Commit not found. Aborting." -ForegroundColor Red; exit 1 }
}

# 4) confirm reset
Write-Host ""
Write-Host "About to run: git reset --hard $Commit" -ForegroundColor Yellow
$confirm = Read-Host "Proceed? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') { Write-Host "Aborted by user." -ForegroundColor Cyan; exit 0 }

# 5) reset
Run "git reset --hard $Commit"
Write-Host "Reset done." -ForegroundColor Green

# 6) ensure .gitignore present & committed
if (-not (Test-Path ".gitignore")) {
  Copy-Item -Path ".\ .gitignore" -Destination ".\" -ErrorAction SilentlyContinue
}
Run "git add .gitignore"
Run "git commit -m `"chore: add .gitignore to ignore node_modules and electron binaries`" --allow-empty"

# 7) remove cached node_modules to avoid re-adding binaries
Run "git rm -r --cached app/node_modules" 
Run "git commit -m `"chore: remove app/node_modules from index (prepare history cleanup)`" --allow-empty"

# 8) try git-filter-repo to remove electron.exe from history
Write-Host ""
Write-Host "Now removing large file app/node_modules/electron/dist/electron.exe from history (git-filter-repo)..." -ForegroundColor Yellow
(& git filter-repo --help) 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "git-filter-repo not available. Please install it (pip install git-filter-repo) and re-run this script." -ForegroundColor Red
  Write-Host "Or use BFG as alternative." -ForegroundColor Yellow
  exit 1
}
Run "git filter-repo --invert-paths --paths app/node_modules/electron/dist/electron.exe --force"

# 9) cleanup and gc
Run "git reflog expire --expire=now --all"
Run "git gc --prune=now --aggressive"
Write-Host "Local history cleaned." -ForegroundColor Green

# 10) final: force-push
$pushConfirm = Read-Host "Force-push changed history to origin/main now? (y/N)"
if ($pushConfirm -eq 'y' -or $pushConfirm -eq 'Y') {
  Run "git push --force origin main"
  Write-Host "Force-push attempted. Verify remote and inform collaborators." -ForegroundColor Yellow
} else {
  Write-Host "Done locally. To publish changes later run: git push --force origin main" -ForegroundColor Cyan
}

Write-Host "All steps finished." -ForegroundColor Green
Exit 0
