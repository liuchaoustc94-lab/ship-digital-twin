$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $PSScriptRoot 'blender-runtime'
$builder = Join-Path $PSScriptRoot 'build_ship_blender.py'
$blender = Get-ChildItem -LiteralPath $runtimeRoot -Recurse -Filter 'blender.exe' -File |
  Select-Object -First 1 -ExpandProperty FullName

if(-not $blender) {
  throw "Blender portable runtime not found under $runtimeRoot"
}

Push-Location $projectRoot
try {
  Write-Output "Using Blender: $blender"
  & $blender -b --factory-startup -P $builder
  if($LASTEXITCODE -ne 0) {
    throw "Blender build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
