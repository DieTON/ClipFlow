# ClipFlow one-click start (PowerShell)
Write-Host ""
Write-Host "  ClipFlow starting..." -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Docker..." -ForegroundColor Yellow
docker start clipflow-postgres 2>$null | Out-Null
docker start clipflow-redis 2>$null | Out-Null
Start-Sleep -Seconds 3

Write-Host "[2/4] Free ports if needed..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

$root = Join-Path $env:USERPROFILE "ClipFlow"

Write-Host "[3/4] Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; npm run dev"

Start-Sleep -Seconds 4

Write-Host "[4/4] Client..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\client'; npm run dev"

Start-Sleep -Seconds 5
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "  Open: http://localhost:5173" -ForegroundColor Green
Write-Host "  Keep the two new windows open." -ForegroundColor Green
Write-Host ""
