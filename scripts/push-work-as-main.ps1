Param(
  [string]$Remote = 'origin',
  [string]$WorkBranch = 'work',
  [string]$MainBranch = 'main'
)

function Fail($message) {
  Write-Host "[push-work-as-main] $message" -ForegroundColor Red
  exit 1
}

function RunGit([string]$args) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'git'
  $psi.Arguments = $args
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  $null = $proc.Start()
  $proc.WaitForExit()

  if ($proc.ExitCode -ne 0) {
    $stderr = $proc.StandardError.ReadToEnd()
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
      Write-Host $stderr -ForegroundColor DarkRed
    }
    Fail "Команда 'git $args' завершилась с кодом $($proc.ExitCode)"
  }

  return $proc.StandardOutput.ReadToEnd()
}

# Ensure script is executed from repo root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir '..')

$gitDir = RunGit 'rev-parse --git-dir'
if (-not $gitDir) {
  Fail 'Не похоже на репозиторий Git'
}

try {
  RunGit "show-ref --verify --quiet refs/heads/$WorkBranch" | Out-Null
} catch {
  Fail "Локальная ветка '$WorkBranch' не найдена"
}

try {
  RunGit "remote get-url $Remote" | Out-Null
} catch {
  Fail "Удалённый репозиторий '$Remote' не настроен. Добавьте его: git remote add $Remote <url>"
}

$currentBranch = (RunGit 'branch --show-current').Trim()
if ($currentBranch -ne $WorkBranch) {
  Write-Host "[push-work-as-main] Переключение на '$WorkBranch'" -ForegroundColor Cyan
  RunGit "checkout $WorkBranch" | Out-Null
}

Write-Host "[push-work-as-main] Получение обновлений с '$Remote'" -ForegroundColor Cyan
RunGit "fetch $Remote --prune" | Out-Null

Write-Host "[push-work-as-main] Отправка '$WorkBranch' в '$Remote/$MainBranch'" -ForegroundColor Green
RunGit "push $Remote $WorkBranch:$MainBranch" | Out-Null

Write-Host "[push-work-as-main] Настройка upstream '$WorkBranch' -> '$Remote/$MainBranch'" -ForegroundColor Green
RunGit "branch --set-upstream-to=$Remote/$MainBranch $WorkBranch" | Out-Null

Write-Host "[push-work-as-main] Готово. Далее используйте 'git push' для синхронизации." -ForegroundColor Green
