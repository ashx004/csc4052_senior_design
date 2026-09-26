$taskLines = Get-Content (Join-Path $PSScriptRoot '.env')
$taskToken = (($taskLines | Where-Object { $_ -match '^OLLAMA_AUTH_TOKEN=' } | Select-Object -First 1) -replace '^OLLAMA_AUTH_TOKEN=', '')
$taskPrimary = (($taskLines | Where-Object { $_ -match '^OLLAMA_PRIMARY_URL=' } | Select-Object -First 1) -replace '^OLLAMA_PRIMARY_URL=', '')
$taskSecondary = (($taskLines | Where-Object { $_ -match '^OLLAMA_SECONDARY_URL=' } | Select-Object -First 1) -replace '^OLLAMA_SECONDARY_URL=', '')
$taskHeaders = @{ Authorization = "Bearer $taskToken"; 'Content-Type' = 'application/json' }
foreach ($taskModel in @('glm-4.7-flash:q4_K_M', 'qwen3.5:35b-a3b', 'nemotron-cascade-2:30b')) {
  "$(Get-Date -Format o) starting $taskModel" | Add-Content (Join-Path $PSScriptRoot '.tmp-ollama-pulls.log')
  Invoke-RestMethod -Method Post -Uri "$taskPrimary/api/pull" -Headers $taskHeaders -Body (@{ name = $taskModel; stream = $false } | ConvertTo-Json) | Out-String | Add-Content (Join-Path $PSScriptRoot '.tmp-ollama-pulls.log')
  "$(Get-Date -Format o) completed $taskModel" | Add-Content (Join-Path $PSScriptRoot '.tmp-ollama-pulls.log')
}
"$(Get-Date -Format o) starting qwen3.5:4b" | Add-Content (Join-Path $PSScriptRoot '.tmp-ollama-pulls.log')
Invoke-RestMethod -Method Post -Uri "$taskSecondary/api/pull" -Headers $taskHeaders -Body (@{ name = 'qwen3.5:4b'; stream = $false } | ConvertTo-Json) | Out-String | Add-Content (Join-Path $PSScriptRoot '.tmp-ollama-pulls.log')
"$(Get-Date -Format o) completed qwen3.5:4b" | Add-Content (Join-Path $PSScriptRoot '.tmp-ollama-pulls.log')
