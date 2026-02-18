# verify_phase6.ps1

$baseUrl = "http://localhost:4002/api"
$email = "test_phase6_" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$password = "password123"

# 1. Register User
$registerBody = @{
    email    = $email
    password = $password
} | ConvertTo-Json

Write-Host "--- Registering User ---"
$regResponse = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -ErrorAction Stop
$token = $regResponse.token
$headers = @{ Authorization = "Bearer $token" }
Write-Host "User Registered. Token received."

# 2. Create Recurring Template
$templateBody = @{
    title            = "Daily Standup"
    estimatedMinutes = 15
    recurrenceType   = "DAILY"
} | ConvertTo-Json

Write-Host "`n--- Creating Recurring Template ---"
try {
    $templateResponse = Invoke-RestMethod -Uri "$baseUrl/recurring" -Method Post -Body $templateBody -Headers $headers -ContentType "application/json"
    Write-Host "Template Created: $($templateResponse.data.title)"
}
catch {
    Write-Host "Error creating template: $_"
    exit 1
}

# 3. Create a Normal Task
$taskBody = @{
    title            = "One-off Task"
    dueDate          = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
    estimatedMinutes = 60
} | ConvertTo-Json

Write-Host "`n--- Creating Normal Task ---"
Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Post -Body $taskBody -Headers $headers -ContentType "application/json" | Out-Null
Write-Host "Normal Task Created."

# 4. Initialize Daily Tasks (Lazy Generation)
Write-Host "`n--- Fetching Daily Tasks (Triggering Generation) ---"
$dailyTasks = Invoke-RestMethod -Uri "$baseUrl/tasks/daily" -Method Get -Headers $headers
$dailyCount = $dailyTasks.data.Length
Write-Host "Daily Tasks Found: $dailyCount"

if ($dailyCount -ge 1) {
    Write-Host "SUCCESS: Daily task instance generated."
}
else {
    Write-Host "FAILURE: No daily task instance generated."
}

# 5. Check Dashboard (Should NOT contain recurring task)
Write-Host "`n--- Checking Dashboard (Should EXCLUDE recurring) ---"
$dashboardTasks = Invoke-RestMethod -Uri "$baseUrl/tasks" -Method Get -Headers $headers
$dashboardCount = $dashboardTasks.data.Length
Write-Host "Dashboard Tasks Found: $dashboardCount"

$recurringInDashboard = $dashboardTasks.data | Where-Object { $_.recurringTemplateId -ne $null }
if ($recurringInDashboard) {
    Write-Host "FAILURE: Recurring task found in Dashboard!"
}
else {
    Write-Host "SUCCESS: Recurring task excluded from Dashboard."
}

Write-Host "`n--- Verification Complete ---"
