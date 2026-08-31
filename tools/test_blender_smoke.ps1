$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$blender = Join-Path $PSScriptRoot 'blender-runtime\blender-4.5.10-windows-x64\blender.exe'
$builder = Join-Path $PSScriptRoot 'build_ship_blender.py'
$blend = Join-Path $projectRoot 'models\ship-blender.blend'
$glb = Join-Path $projectRoot 'models\ship-blender.glb'
$preview = Join-Path $projectRoot 'models\ship-blender-preview.png'

if(-not (Test-Path -LiteralPath $blender)) {
  throw "Blender runtime not found: $blender"
}

& $blender -b --factory-startup -P $builder
if($LASTEXITCODE -ne 0) {
  throw "Blender build failed with exit code $LASTEXITCODE"
}

foreach($artifact in @($blend, $glb, $preview)) {
  if(-not (Test-Path -LiteralPath $artifact)) {
    throw "Expected artifact was not created: $artifact"
  }
  $size = (Get-Item -LiteralPath $artifact).Length
  if($size -lt 100000) {
    throw "Artifact is unexpectedly small: $artifact ($size bytes)"
  }
}

Write-Output "PASS: Blender build produced .blend, .glb, and preview artifacts"
