$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$project = Join-Path $PSScriptRoot "TexTradeOS.Launcher\TexTradeOS.Launcher.csproj"
$output = Join-Path $repo "artifacts\launcher"

New-Item -ItemType Directory -Force -Path $output | Out-Null
docker run --rm `
  -v "${repo}:/src" `
  -w /src `
  mcr.microsoft.com/dotnet/sdk:8.0 `
  dotnet publish "launcher/TexTradeOS.Launcher/TexTradeOS.Launcher.csproj" `
    -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -o /src/artifacts/launcher
Remove-Item (Join-Path $output "TexTradeOS.pdb") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $output "deployment") -Recurse -Force -ErrorAction SilentlyContinue
