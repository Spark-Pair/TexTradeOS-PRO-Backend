# TexTradeOS Backend and Deployment

Express, SQLite, Docker deployment, device licensing, Windows launcher, and
release automation for TexTradeOS.

## Development

```powershell
npm install
npm run dev
```

The development API runs at `http://localhost:4000/api`. License enforcement
is disabled outside production unless `LICENSE_ENFORCEMENT=true`.

## Production architecture

- Nginx frontend exposed on LAN port `8080`
- One internal Node.js backend container
- SQLite stored at `C:\ProgramData\TexTradeOS\data`
- License and fingerprint stored at `C:\ProgramData\TexTradeOS\license`
- Backups stored at `C:\ProgramData\TexTradeOS\backups`
- Deployment configuration stored at `C:\ProgramData\TexTradeOS\config`

Only the frontend container publishes a host port. Nginx proxies `/api` to
the backend over the private Compose network.

## Local container build

```powershell
docker build -t textradeos-backend:test .
docker build -t textradeos-frontend:test ..\TexTradeOS-PRO
```

The production backend image contains the obfuscated bundle, production
dependencies, and the native `better-sqlite3` module. It does not contain the
source tree, source maps, Git metadata, tests, or development dependencies.

## Windows launcher

Build without installing the .NET SDK on the host:

```powershell
powershell -ExecutionPolicy Bypass -File launcher\build-launcher.ps1
```

The result is the single file `artifacts\launcher\TexTradeOS.exe`. Its Docker
Compose template is embedded inside the executable. The launcher starts Docker,
validates the device license, opens the browser, manages backups, and applies
updates with rollback.

Customer setup instructions are packaged with local release deliverables under
`..\Installable`. See [RELEASING.md](RELEASING.md) for the publishing process.

## Licensing

See [LICENSE.md](LICENSE.md). Licenses are perpetual and tolerate one changed
hardware fingerprint component. Keep
`%USERPROFILE%\.textradeos-license-keys\private.pem` private and backed up.

## Publishing

Run the **Publish TexTradeOS Release** workflow from GitHub Actions and enter:

- Semantic version, such as `1.0.0`
- Exact frontend branch, tag, or commit
- Whether the release is mandatory
- Release notes

For a private frontend repository, configure the backend repository secret
`FRONTEND_REPO_TOKEN` with read access. The workflow publishes public GHCR
images, immutable digests, `update.json`, a portable launcher, checksums, and
the Windows installer.

## Customer network

Reserve a stable LAN address for the server PC in the router. Client devices
open `http://SERVER-IP:8080`. Only the server PC requires Docker Desktop.
