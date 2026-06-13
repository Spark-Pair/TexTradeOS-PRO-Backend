param(
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$project = "launcher/TexTradeOS.Launcher/TexTradeOS.Launcher.csproj"
$previewRoot = Join-Path $repo ".launcher-preview"
$output = Join-Path $previewRoot "app"
$nuget = Join-Path $previewRoot "nuget"
$executable = Join-Path $output "TexTradeOS.exe"

New-Item -ItemType Directory -Force -Path $output, $nuget | Out-Null

Get-Process TexTradeOS -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $executable } |
  Stop-Process -Force

if (-not $NoBuild) {
  docker run --rm `
    -v "${repo}:/src" `
    -v "${nuget}:/root/.nuget/packages" `
    -w /src `
    mcr.microsoft.com/dotnet/sdk:8.0 `
    dotnet publish $project `
      -c Debug -r win-x64 --self-contained true `
      -p:PublishSingleFile=false `
      -p:DebugType=None `
      -o /src/.launcher-preview/app

  if ($LASTEXITCODE -ne 0) {
    throw "Splash preview build failed."
  }
}

if (-not (Test-Path $executable)) {
  throw "Preview executable is missing. Run without -NoBuild first."
}

Start-Process -FilePath $executable -ArgumentList "--preview"
