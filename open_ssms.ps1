$ssmsPath20 = "C:\Program Files (x86)\Microsoft SQL Server Management Studio 20\Common7\IDE\Ssms.exe"
$ssmsPath19 = "C:\Program Files (x86)\Microsoft SQL Server Management Studio 19\Common7\IDE\Ssms.exe"
$installerPath = "$env:TEMP\SSMS-Setup.exe"

if (Test-Path $ssmsPath20) {
    Start-Process $ssmsPath20
} elseif (Test-Path $ssmsPath19) {
    Start-Process $ssmsPath19
} elseif (Test-Path $installerPath) {
    Write-Host "SSMS belum terinstal. Sedang menjalankan installer..."
    Start-Process $installerPath
} else {
    Write-Host "Installer SSMS tidak ditemukan."
}
