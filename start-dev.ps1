param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [switch]$InstallDeps
)

$ErrorActionPreference = 'Stop'

function Test-PortAvailable {
    param([int]$Port)
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Get-FreePort {
    param([int[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (Test-PortAvailable -Port $candidate) {
            return $candidate
        }
    }
    throw 'No free port found in candidate list.'
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot 'backend'
$frontendPath = Join-Path $repoRoot 'frontend'

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python is not installed or not in PATH.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm is not installed or not in PATH.'
}

if (-not (Test-Path $backendPath)) {
    throw "Backend folder not found: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Frontend folder not found: $frontendPath"
}

if (-not (Test-PortAvailable -Port $BackendPort)) {
    Write-Host "Backend port $BackendPort is busy. Looking for a free port..." -ForegroundColor Yellow
    $BackendPort = Get-FreePort -Candidates @(8002, 8003, 8010, 8080)
}

if (-not (Test-PortAvailable -Port $FrontendPort)) {
    Write-Host "Frontend port $FrontendPort is busy. Looking for a free port..." -ForegroundColor Yellow
    $FrontendPort = Get-FreePort -Candidates @(5174, 5175, 5180)
}

$activateScript = Join-Path $backendPath '.venv\Scripts\Activate.ps1'
$venvCreated = $false

if (-not (Test-Path $activateScript)) {
    Write-Host 'Creating backend virtual environment...' -ForegroundColor Cyan
    Push-Location $backendPath
    try {
        python -m venv .venv
    }
    finally {
        Pop-Location
    }
    $venvCreated = $true
}

if ($venvCreated -or $InstallDeps) {
    Write-Host 'Installing backend dependencies...' -ForegroundColor Cyan
    Push-Location $backendPath
    try {
        & $activateScript
        python -m pip install --upgrade pip
        pip install -r requirements.txt
    }
    finally {
        Pop-Location
    }

    Write-Host 'Installing frontend dependencies...' -ForegroundColor Cyan
    Push-Location $frontendPath
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}

$backendCmd = "Set-Location '$backendPath'; . .\\.venv\\Scripts\\Activate.ps1; uvicorn app.main:app --host 127.0.0.1 --port $BackendPort --reload"
$frontendCmd = "Set-Location '$frontendPath'; `$env:VITE_API_BASE_URL='http://127.0.0.1:$BackendPort'; npm run dev -- --host 127.0.0.1 --port $FrontendPort"

Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCmd) | Out-Null
Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCmd) | Out-Null

Write-Host ''
Write-Host "Backend started on http://127.0.0.1:$BackendPort" -ForegroundColor Green
Write-Host "Frontend started on http://127.0.0.1:$FrontendPort" -ForegroundColor Green
Write-Host 'Use Ctrl+C in each spawned terminal to stop services.' -ForegroundColor DarkGray