$packages = Get-Package -Name '*MySQL*' -ErrorAction SilentlyContinue
foreach ($pkg in $packages) {
    Write-Host "Mencabut: $($pkg.Name)"
    Uninstall-Package -InputObject $pkg -Force -ErrorAction SilentlyContinue
}
Write-Host "Selesai!"
