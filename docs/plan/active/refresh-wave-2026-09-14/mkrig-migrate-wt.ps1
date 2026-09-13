param([string]$Name, [int]$Port, [string]$Db, [string]$Root)
$sp = "/mnt/c/Users/zhant/Desktop/clara-rebuild/docs/plan/active/refresh-wave-2026-09-14"
wsl -u root -- bash "$sp/mkrig.sh" $Name $Port
$env:PATH = "C:\Users\zhant\AppData\Local\pnpm;" + $env:PATH
Set-Location $Root
$env:PGHOST='127.0.0.1'; $env:PGPORT="$Port"; $env:PGUSER='postgres'; $env:PGDATABASE='postgres'
node -e "const {Client}=require('./packages/db/node_modules/pg');(async()=>{const c=new Client();await c.connect();await c.query('create database $Db');await c.end();console.log('created $Db')})()"
$env:PGDATABASE="$Db"; $env:CLARA_ALLOW_DESTRUCTIVE='1'
$sw=[Diagnostics.Stopwatch]::StartNew()
pnpm db:migrate 2>&1 | Select-Object -Last 2
pnpm db:seed 2>&1 | Select-Object -Last 1
Write-Host ("rig $Name :$Port/$Db ready in {0:N0}s from $Root" -f $sw.Elapsed.TotalSeconds)
