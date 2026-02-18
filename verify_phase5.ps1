$base = "http://localhost:4001/api"
$email = "test-" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$password = "password123"

# Register
Write-Output "Registering user: $email"
try {
    $body = @{email = $email; password = $password } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "$base/auth/register" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
    
    $json = $response.Content | ConvertFrom-Json
    
    if ($json.token) {
        $token = $json.token
    }
    elseif ($json.data.token) {
        $token = $json.data.token
    }
    else {
        $token = $null
    }
    
    if (-not $token) {
        Write-Output "No token found."
        exit 1
    }
}
catch {
    Write-Output "Registration Failed: $_"
    exit 1
}

$headers = @{Authorization = "Bearer $token" }

# Create Tasks
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")

# Task A: 60 mins (Due Tomorrow)
$bodyA = @{title = "Task A"; dueDate = $tomorrow; estimatedMinutes = 60 } | ConvertTo-Json
Invoke-WebRequest -Uri "$base/tasks" -Method Post -Headers $headers -Body $bodyA -ContentType "application/json" -UseBasicParsing | Out-Null

# Task B: 120 mins (Due Tomorrow) - Should come BEFORE A in Priority View, but SAME/AFTER in Default View (depending on creation/stable sort)
$bodyB = @{title = "Task B"; dueDate = $tomorrow; estimatedMinutes = 120 } | ConvertTo-Json
Invoke-WebRequest -Uri "$base/tasks" -Method Post -Headers $headers -Body $bodyB -ContentType "application/json" -UseBasicParsing | Out-Null

# Verify Default View (Due Date Sort)
Write-Output "`n--- Checking Default View (/tasks) ---"
$responseDefaults = Invoke-WebRequest -Uri "$base/tasks" -Method Get -Headers $headers -UseBasicParsing
$dataDefaults = ($responseDefaults.Content | ConvertFrom-Json).data

foreach ($t in $dataDefaults) {
    Write-Output "$($t.title) - Due: $($t.dueDate)"
}

# Verify Priority View (Start Time Sort)
Write-Output "`n--- Checking Priority View (/tasks/priority) ---"
$responsePriority = Invoke-WebRequest -Uri "$base/tasks/priority" -Method Get -Headers $headers -UseBasicParsing
$dataPriority = ($responsePriority.Content | ConvertFrom-Json).data

foreach ($t in $dataPriority) {
    Write-Output "$($t.title) - StartByTime Sort"
}

if ($dataPriority[0].title -eq "Task B") {
    Write-Output "SUCCESS: Priority View correctly prioritizes Task B"
}
else {
    Write-Output "FAILURE: Priority View should have Task B first"
}
