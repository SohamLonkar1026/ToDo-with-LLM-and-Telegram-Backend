$base = "http://localhost:4001/api"
$email = "test-" + (Get-Date -Format "yyyyMMddHHmmss") + "@example.com"
$password = "password123"

# Register
Write-Output "Registering user: $email"
try {
    $body = @{email = $email; password = $password } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "$base/auth/register" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing
    
    $json = $response.Content | ConvertFrom-Json
    
    # Check if token is inside "data" or top level
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
        Write-Output "No token found. JSON: $($json | ConvertTo-Json -Depth 10)"
        exit 1
    }
    Write-Output "Got Token: $token"
}
catch {
    Write-Output "Registration Failed"
    Write-Output $_
    exit 1
}

$headers = @{Authorization = "Bearer $token" }

# Create Tasks
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")

# Task A: 60 mins
Write-Output "Creating Task A (60m)"
$bodyA = @{title = "Task A"; dueDate = $tomorrow; estimatedMinutes = 60 } | ConvertTo-Json
Invoke-WebRequest -Uri "$base/tasks" -Method Post -Headers $headers -Body $bodyA -ContentType "application/json" -UseBasicParsing | Out-Null

# Task B: 120 mins (Should start earlier)
Write-Output "Creating Task B (120m)"
$bodyB = @{title = "Task B"; dueDate = $tomorrow; estimatedMinutes = 120 } | ConvertTo-Json
Invoke-WebRequest -Uri "$base/tasks" -Method Post -Headers $headers -Body $bodyB -ContentType "application/json" -UseBasicParsing | Out-Null

# Get Tasks
Write-Output "Fetching Tasks..."
$response = Invoke-WebRequest -Uri "$base/tasks" -Method Get -Headers $headers -UseBasicParsing
$json = $response.Content | ConvertFrom-Json
$tasks = $json.data

Write-Output "Task Order:"
foreach ($t in $tasks) {
    Write-Output "$($t.title) - Due: $($t.dueDate) - Est: $($t.estimatedMinutes) min"
}

if ($tasks[0].title -eq "Task B") {
    Write-Output "SUCCESS: Task B is first"
}
else {
    Write-Output "FAILURE: Task B should be first"
}
