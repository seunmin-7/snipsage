Set-Location $PSScriptRoot
if (-not (Test-Path ".env")) {
    Write-Host "Missing server/.env"
    Write-Host "Copy .env.example to .env, paste your xAI API key, and run this script again."
    exit 1
}
npm start
