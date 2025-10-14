<#
Usage:
  Open PowerShell in c:\AgentFlow and run:
    .\scripts\cleanup_history.ps1

What it does:
  - creates a backup branch
  - adds .gitignore (should be committed)
  - removes app/node_modules from index
  - if git-filter-repo is available, runs it to remove the large file from history
  - otherwise prints BFG alternative and manual steps
Note: This rewrites history locally; you must force-push (git push --force) and inform collaborators.
#>

param()

function ExitWith($msg) {
  Write-Host $msg -ForegroundColor Yellow
  exit 1
}

# 1) create backup branch
Write-Host "1) Creating backup branch 'backup-main'..."
git rev-parse --verify backup-main >/dev/null 2>&1
if ($LASTEXITCODE -ne 0) {
  git branch backup-main main
  Write-Host "Backup branch created: backup-main"
} else {
  Write-Host "Backup branch already exists"
}

# 2) ensure .gitignore committed
Write-Host "2) Ensure .gitignore is added and committed..."
git add .gitignore
git commit -m "chore: add .gitignore to ignore node_modules and electron binaries" 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host ".gitignore committed."
} else {
  Write-Host ".gitignore commit skipped or already up-to-date."
}

# 3) remove app/node_modules from index (keeps files in working tree)
Write-Host "3) Removing app/node_modules from index (cached)..."
git rm -r --cached app/node_modules 2>$null
git commit -m "chore: remove app/node_modules from index (prepare history cleanup)" 2>$null
Write-Host "Index updated. This does not remove file from history."

# 4) try git-filter-repo
Write-Host "4) Attempting to run git-filter-repo to remove large files from history..."
$gfr = & git filter-repo --help 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "git-filter-repo detected. Running to remove electron.exe..."
  # remove specific paths
  git filter-repo --invert-paths --paths app/node_modules/electron/dist/electron.exe --force
  Write-Host "git-filter-repo completed. Run garbage collection and force-push."
  Write-Host "Run these commands now:"
  Write-Host "  git reflog expire --expire=now --all"
  Write-Host "  git gc --prune=now --aggressive"
  Write-Host "  git push --force origin main"
  Exit 0
} else {
  Write-Host "git-filter-repo not found. Showing BFG alternative..."
}

# 5) BFG alternative instructions
Write-Host ""
Write-Host "If you prefer BFG (Java), follow these steps manually:"
Write-Host "  1) git clone --mirror <repo-url> repo.git"
Write-Host "  2) java -jar bfg.jar --delete-files 'electron.exe' repo.git"
Write-Host "  3) cd repo.git"
Write-Host "  4) git reflog expire --expire=now --all && git gc --prune=now --aggressive"
Write-Host "  5) git push --force"
Write-Host ""
Write-Host "Or run the following manual local sequence (careful, rewrites history):"
Write-Host "  - Install git-filter-repo (recommended): pip install git-filter-repo"
Write-Host "  - Then run:"
Write-Host "      git filter-repo --path app/node_modules/electron/dist/electron.exe --invert-paths"
Write-Host "      git reflog expire --expire=now --all"
Write-Host "      git gc --prune=now --aggressive"
Write-Host "      git push --force origin main"
Write-Host ""
Write-Host "Finally: after force-push, all collaborators must re-clone or reset their local branches."
Exit 0
