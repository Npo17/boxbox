# Guarda el token de Cloudflare como variable de entorno de tu usuario de Windows.
# El token se escribe oculto y nunca se muestra en pantalla ni pasa por el chat.
$seguro = Read-Host 'Pega tu token de Cloudflare y presiona Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'No pegaste nada. No se guardó nada.'; exit 1 }

# Comprueba que el token funcione antes de guardarlo
try {
  $r = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers @{ Authorization = "Bearer $token" }
  if (-not $r.success) { throw 'inválido' }
} catch { Write-Host 'Cloudflare rechazó el token. Revisa que lo hayas copiado completo.'; exit 1 }

[Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', $token, 'User')
Write-Host 'Listo: token verificado y guardado. Avísale a Claude.'
