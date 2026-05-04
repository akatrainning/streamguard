param(
    [string]$Text = "",
    [string]$ApiBase = "http://127.0.0.1:8011",
    [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"

$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

if (-not $Text) {
    $Text = '"\u8fd9\u4e2a\u4ef7\u683c\u5168\u7f51\u6700\u4f4e\uff0c\u53ea\u5269\u6700\u540e100\u5355"' | ConvertFrom-Json
}

$uri = "$ApiBase/rag/test"
$jsonBody = @{ text = $Text } | ConvertTo-Json -Compress
$null = Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.UseProxy = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)

try {
    $content = New-Object System.Net.Http.StringContent($jsonBody, $utf8, "application/json")
    $response = $client.PostAsync($uri, $content).GetAwaiter().GetResult()
    $rawJson = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
        throw "HTTP $([int]$response.StatusCode): $rawJson"
    }
    $result = $rawJson | ConvertFrom-Json
} catch {
    Write-Error "RAG test failed: $($_.Exception.Message)"
    exit 1
}

$summary = [ordered]@{
    request_text = $Text
    raw_content = $result.event.raw_content
    claim_types = @($result.claim.claim_type)
    evidence_count = @($result.evidence).Count
    evidence_sources = @($result.evidence | ForEach-Object { $_.source })
    risk_level = $result.risk.level
    risk_score = $result.risk.score
    trace = @($result.trace | ForEach-Object { $_.step })
    embedding_ready = $null
}

try {
    $configJson = $client.GetStringAsync("$ApiBase/rag/config").GetAwaiter().GetResult()
    $config = $configJson | ConvertFrom-Json
    $summary.embedding_ready = $config.embedding_status.ready
} catch {
    $summary.embedding_ready = $false
}

$summary | ConvertTo-Json -Depth 8

if ($OutFile) {
    $full = $result | ConvertTo-Json -Depth 20
    $target = $OutFile
    if (-not [System.IO.Path]::IsPathRooted($target)) {
        $target = Join-Path (Get-Location) $target
    }
    $dir = Split-Path -Parent $target
    if ($dir) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText($target, $full, $utf8)
    Write-Host "Full result written to $target" -ForegroundColor Green
}
