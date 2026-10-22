for ($i = 1; $i -le 15; $i++) {
  Start-Sleep -Seconds 30
  $r = (Invoke-WebRequest -Uri "https://apoquiz.vercel.app/?c=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing -TimeoutSec 20).Content
  $compacta = $r -match 'panel p-1.5'
  $agrupar = $r -match 'Agrupar por'
  $separar = $r -match 'Separar por PDF'
  $erro = $r -match 'Erro no arquivo'
  $ia = $r -match 'conferiu o gabarito'
  Write-Output ("Tentativa {0}: compacta={0}, agrupar={1}, separar={1}, erro={2}, ia={3}" -f $i, $compacta, $agrupar, $separar, $erro, $ia)
  if ($compacta -and $agrupar) { break }
}