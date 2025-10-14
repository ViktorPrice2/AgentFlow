Param()

function Abort($msg) {
  Write-Host $msg -ForegroundColor Red
  exit 1
}

function Run($cmd) {
  Write-Host ">> $cmd" -ForegroundColor DarkCyan
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Command returned exit code: $LASTEXITCODE" -ForegroundColor Yellow
  }
}

# 1) Ensure we are in repo root
$root = Get-Location
Write-Host "Working directory: $root" -ForegroundColor Green

# 2) Ensure working tree clean (interactive)
$porcelain = (& git status --porcelain) 2>$null
if ($porcelain) {
  Write-Host "Working tree is not clean. Changes:" -ForegroundColor Yellow
  Write-Host $porcelain
  Write-Host ""
  Write-Host "Choose action before proceeding:" -ForegroundColor Cyan
  Write-Host "  [C] Commit all changes as WIP"
  Write-Host "  [S] Stash changes (including untracked)"
  Write-Host "  [I] Ignore and continue (risky)"
  Write-Host "  [A] Abort"
  $choice = Read-Host "Enter choice (C/S/I/A)"
  switch ($choice.ToUpper()) {
    'C' {
      Write-Host "Committing all changes as WIP..." -ForegroundColor Green
      Run "git add -A"
      Run "git commit -m `"wip: auto cleanup preflight`""
      break
    }
    'S' {
      Write-Host "Stashing changes (including untracked)..." -ForegroundColor Green
      Run "git stash push -u -m `"auto_cleanup_preflight`""
      break
    }
    'I' {
      Write-Host "Proceeding despite dirty working tree (user chose Ignore)." -ForegroundColor Yellow
      break
    }
    default {
      Write-Host "Aborted by user." -ForegroundColor Cyan
      Exit 1
    }
  }
}

# 3) Create backup branch if missing
$exists = (& git rev-parse --verify backup-main) 2>$null
if ($LASTEXITCODE -ne 0) {
  Run "git branch backup-main"
  Write-Host "Created backup branch: backup-main" -ForegroundColor Green
} else {
  Write-Host "backup-main already exists" -ForegroundColor Cyan
}

# 4) Ensure .gitignore committed
Run "git add .gitignore"
Run "git commit -m `"chore: add .gitignore (ignore node_modules, electron binaries)`" --allow-empty"

# 5) Remove cached node_modules (safe)
Run "git rm -r --cached app/node_modules" 
Run "git commit -m `"chore: remove app/node_modules from index (prepare history cleanup)`" --allow-empty"

# 6) Check git-filter-repo availability
Write-Host "Checking for git-filter-repo..." -ForegroundColor Green
(& git filter-repo --help) 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "git-filter-repo not found in PATH." -ForegroundColor Yellow
  # try pip install
  (& python -m pip --version) 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Attempting to install git-filter-repo via pip..." -ForegroundColor Green
    & python -m pip install --user git-filter-repo
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Failed to install git-filter-repo via pip. Please install manually: pip install git-filter-repo" -ForegroundColor Red
      Exit 1
    } else {
      Write-Host "git-filter-repo installed (user). Ensure 'git filter-repo' is available in PATH." -ForegroundColor Green
    }
  } else {
    Write-Host "Python/pip not found. Install git-filter-repo manually or use BFG." -ForegroundColor Red
    Exit 1
  }
}

# Final check
(& git filter-repo --help) 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "git filter-repo command still not available. Please check installation or PATH." -ForegroundColor Red
  Exit 1
}

# 7) Confirm destructive action
Write-Host ""
Write-Host "This will rewrite history and remove app/node_modules/electron/dist/electron.exe from all commits." -ForegroundColor Yellow
$confirm = Read-Host "Continue? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
  Write-Host "User cancelled." -ForegroundColor Cyan
  Exit 0
}

# 8) Run git-filter-repo to remove the file
Write-Host "Running git-filter-repo..." -ForegroundColor Green
Run "git filter-repo --invert-paths --paths app/node_modules/electron/dist/electron.exe --force"

# 9) Cleanup Git metadata
Write-Host "Cleaning reflogs and running garbage collection..." -ForegroundColor Green
Run "git reflog expire --expire=now --all"
Run "git gc --prune=now --aggressive"

# 10) Offer force-push
Write-Host ""
Write-Host "Local history rewritten. You need to force-push to origin to update remote." -ForegroundColor Yellow
$pushConfirm = Read-Host "Run 'git push --force origin main' now? (y/N)"
if ($pushConfirm -eq 'y' -or $pushConfirm -eq 'Y') {
  Run "git push --force origin main"
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Force-push completed successfully." -ForegroundColor Green
  } else {
    Write-Host "Force-push failed. Check output above." -ForegroundColor Red
  }
} else {
  Write-Host "You can push later: git push --force origin main" -ForegroundColor Cyan
}

Write-Host "Done. Notify collaborators to re-clone or reset their local copies." -ForegroundColor Green
Exit 0
