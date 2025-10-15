# ...existing code...

Write-Host "Checking for git-filter-repo..." -ForegroundColor Green
$filterCmd = $null
git filter-repo --help > $null 2>&1
if ($LASTEXITCODE -eq 0) {
  $filterCmd = "git filter-repo"
} else {
  python -m git_filter_repo --help > $null 2>&1
  if ($LASTEXITCODE -eq 0) {
    $filterCmd = "python -m git_filter_repo"
  } else {
    Write-Host "git-filter-repo not found. Install: python -m pip install --user git-filter-repo" -ForegroundColor Red
    Exit 1
  }
}

# ...existing code...

# Run filter using chosen command
Run "$filterCmd --invert-paths --path `"app/node_modules/electron/dist/electron.exe`" --force"

# ...existing code...