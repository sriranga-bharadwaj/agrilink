# Rebuilds the AgriLink MySQL database and MongoDB collections with sample data.
# Prereq (once, as root): mysql -u root -p < database/mysql/00_setup_root.sql
# Usage: powershell -ExecutionPolicy Bypass -File database\mysql\run_all.ps1 [-demo]
#   -demo  also runs 06_demo.sql (changes some orders; good for screenshots)

$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$dir   = $PSScriptRoot
$env:MYSQL_PWD = "agrilink_dev"   # local dev-only password

foreach ($f in "01_schema.sql", "02_functions_triggers.sql", "03_procedures.sql", "04_views.sql", "05_seed.sql") {
    Write-Host "== $f"
    Get-Content -Raw (Join-Path $dir $f) | & $mysql -u agrilink agrilink
    if ($LASTEXITCODE -ne 0) { Write-Host "Failed on $f"; exit 1 }
}

if ($args -contains "-demo") {
    Write-Host "== 06_demo.sql (some errors are expected)"
    Get-Content -Raw (Join-Path $dir "06_demo.sql") | & $mysql -u agrilink --force --table agrilink
}

$web = Join-Path $dir "..\..\web"

# Government mandi prices for price suggestions (01_schema.sql recreated the empty table).
Write-Host "== mandi_prices"
npm --prefix $web run --silent mandi:load

# MongoDB quality documents are keyed by the same listing/requirement ids.
Write-Host "== MongoDB setup + seed"
npm --prefix $web run --silent mongo:setup
npm --prefix $web run --silent mongo:seed
