$tempDir = $env:TEMP
$ssmsUrl = "https://aka.ms/ssmsfullsetup"
$ssmsFile = "$tempDir\SSMS-Setup.exe"

$sqlUrl = "https://go.microsoft.com/fwlink/p/?linkid=2216019"
$sqlFile = "$tempDir\SQL2022-SSEI-Expr.exe"

Write-Host "Sedang mendownload SSMS (ini mungkin memakan waktu karena ukurannya 600MB+)..."
Invoke-WebRequest -Uri $ssmsUrl -OutFile $ssmsFile

Write-Host "Sedang mendownload SQL Server Express..."
Invoke-WebRequest -Uri $sqlUrl -OutFile $sqlFile

Write-Host "Membuka Installer SQL Server Express..."
Start-Process -FilePath $sqlFile

Write-Host "Sedang menginstal SSMS secara otomatis (mohon tunggu)..."
Start-Process -FilePath $ssmsFile -ArgumentList "/Passive" -Wait

Write-Host "Proses instalasi SSMS selesai!"
