param(
    [int]$Port = 5173,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$processIds = @()

if ($connections) {
    $processIds = $connections |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -gt 0 }
}

foreach ($processId in $processIds) {
    try {
        $process = Get-Process -Id $processId -ErrorAction Stop
        Write-Host "Stopping process on port ${Port}: $($process.ProcessName) ($processId)"
        Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
        Write-Warning "Failed to stop process $processId on port ${Port}: $($_.Exception.Message)"
    }
}

if ($processIds.Count -eq 0) {
    Write-Host "Port $Port is free."
}

$viteCommand = Join-Path $PSScriptRoot '..\node_modules\.bin\vite.cmd'

if (-not (Test-Path $viteCommand)) {
    throw 'Vite binary not found. Run npm install first.'
}

& $viteCommand --host 127.0.0.1 --port $Port --strictPort @ExtraArgs
exit $LASTEXITCODE
