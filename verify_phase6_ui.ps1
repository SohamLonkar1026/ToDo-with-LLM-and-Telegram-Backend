# verify_phase6.ps1

$baseUrl = "http://localhost:4001/api"
$email = "test_phase6_" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$password = "password123"

# 1. Register User
$registerBody = @{
    email    = $email
    password = $password
} | ConvertTo-Json

Write-Host "--- Registering User ---"
$regResponse = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -ErrorAction Stop
$token = $regResponse.data.token
$headers = @{ Authorization = "Bearer $token" }
Write-Host "User Registered. Token received."

# 2. Create Recurring Template (Simulating UI Modal Submit)
$templateBody = @{
    title            = "UI Created Recurring Task"
    estimatedMinutes = 45
    recurrenceType   = "DAILY"
} | ConvertTo-Json

Write-Host "`n--- Creating Recurring Template (Simulating UI Action) ---"
try {
    $templateResponse = Invoke-RestMethod -Uri "$baseUrl/recurring" -Method Post -Body $templateBody -Headers $headers -ContentType "application/json"
    Write-Host "Template Created: $($templateResponse.data.title)"
}
catch {
    Write-Host "Error creating template: $_"
    exit 1
}

# 3. Initialize Daily Tasks (Lazy Generation)
Write-Host "`n--- Fetching Daily Tasks (Triggering Generation) ---"
$dailyTasks = Invoke-RestMethod -Uri "$baseUrl/tasks/daily" -Method Get -Headers $headers
$dailyCount = $dailyTasks.data.Length
Write-Host "Daily Tasks Found: $dailyCount"

$found = $dailyTasks.data | Where-Object { $_.title -eq "UI Created Recurring Task" }

if ($found) {
    Write-Host "SUCCESS: Task instance generated from template."
}
else {
    Write-Host "FAILURE: Task instance not generated."
    exit 1
}

Write-Host "`n--- Verification Complete ---"
