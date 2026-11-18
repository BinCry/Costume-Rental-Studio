param(
  [ValidateSet('init', 'up', 'down', 'status', 'logs', 'seed')]
  [string]$Action = 'up'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root 'compose.local-test.yaml'
$envFile = Join-Path $PSScriptRoot '.env'

function New-HexSecret([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($buffer) }
  finally { $generator.Dispose() }
  return [BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant()
}

if (-not (Test-Path -LiteralPath $envFile)) {
  if ($Action -notin @('init', 'up', 'seed')) {
    throw 'Chưa có local-test/.env. Chạy .\local-test\start.ps1 up trước.'
  }
  $lines = @(
    'LOCAL_TEST_WEB_PORT=5180'
    'LOCAL_TEST_API_PORT=4180'
    'LOCAL_TEST_DB_PORT=55432'
    'LOCAL_TEST_S3_PORT=59000'
    "LOCAL_TEST_DB_PASSWORD=$(New-HexSecret 24)"
    "LOCAL_TEST_S3_PASSWORD=$(New-HexSecret 24)"
    "LOCAL_TEST_JWT_SECRET=$(New-HexSecret 32)"
    "LOCAL_TEST_OTP_SECRET=$(New-HexSecret 32)"
    "LOCAL_TEST_ACCOUNT_PASSWORD=LocalTest-$(New-HexSecret 16)"
  )
  [System.IO.File]::WriteAllText(
    $envFile,
    ($lines -join "`n") + "`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host 'Đã tạo local-test/.env với mật khẩu ngẫu nhiên, chỉ lưu trên máy này.'
}

if ($Action -eq 'init') { return }

$composeArgs = @('compose', '--env-file', $envFile, '-f', $composeFile)

switch ($Action) {
  'up' { $composeArgs += @('up', '--build', '-d') }
  'down' { $composeArgs += @('down') }
  'status' { $composeArgs += @('ps', '-a') }
  'logs' { $composeArgs += @('logs', '--tail', '100') }
  'seed' {
    & docker @composeArgs run --rm seed
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    return
  }
}

& docker @composeArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
