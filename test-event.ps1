$body = @{
    uuid = "course_c1"
    event = @{
        type = "smoke-test"
        payload = "hello"
    }
} | ConvertTo-Json -Depth 5

Write-Host "Sending payload: $body"

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/whiteboard/event" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    Write-Host "Success!"
    Write-Host ($response | ConvertTo-Json -Depth 5)
} catch {
    Write-Host "Error:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Host "Details:"
        Write-Host $_.ErrorDetails
    }
    # Print the response stream if available
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            Write-Host "Server Response:"
            Write-Host $reader.ReadToEnd()
        }
    }
}
