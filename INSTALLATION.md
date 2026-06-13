# TexTradeOS Installation Guide

## What the customer receives

- `TexTradeOS-Setup-X.Y.Z.exe`: the single installation file.
- A signed `*.license.json` file issued after the server fingerprint is
  generated.

Docker Desktop is the only prerequisite. It must be installed on the Windows
computer that will act as the TexTradeOS server.

> A clean-machine installation requires the corresponding frontend and backend
> images to be published publicly in GHCR first. The local `1.0.0` setup file
> cannot download application containers until release `1.0.0` is published.

## Install on the server computer

1. Install Docker Desktop and start it.
2. Double-click `TexTradeOS-Setup-X.Y.Z.exe`.
3. Complete the setup wizard. It installs one self-contained launcher and
   creates a desktop shortcut.
4. Open **TexTradeOS** from the desktop.
5. The browser opens the activation page. Click **Download Fingerprint
   Request** and send the generated JSON request to the TexTradeOS developer.
6. On the developer computer, run this inside the backend repository:

   ```powershell
   npm run license:create -- --request "C:\path\fingerprint.json" --customer "Customer Name"
   ```

   The signed license is created under:

   ```text
   %USERPROFILE%\TexTradeOS-Licenses
   ```

7. Send the generated `*.license.json` file to the customer.
8. In the browser activation page, click **Import Signed License** and select
   that file.
9. Continue to login. An administrator can configure the firewall under
   **Settings > System Management**.

The launcher shows a startup splash, starts Docker Desktop when necessary,
creates `C:\ProgramData\TexTradeOS`, starts both containers, waits for health
checks, opens TexTradeOS in the default browser, and then remains hidden as the
restricted Windows management agent.

## Connect other users

The launcher displays the LAN address, for example:

```text
http://192.168.100.10:8080
```

Open that address in a browser on each computer or phone connected to the same
network. Only the server computer needs Docker Desktop. Reserve the server's IP
address in the router so the URL does not change.

## Data and backups

Customer data is stored outside the installer:

```text
C:\ProgramData\TexTradeOS\data
C:\ProgramData\TexTradeOS\backups
C:\ProgramData\TexTradeOS\license
C:\ProgramData\TexTradeOS\config
```

Administrators use **Settings > System Management** for backup, restore,
licensing, diagnostics, firewall configuration, and updates. Uninstalling the
launcher does not automatically delete business data.

## Updates

The launcher checks releases in `Spark-Pair/TexTradeOS-PRO-Backend` for the
latest update metadata. That repository must be public for customer launchers
to download releases without GitHub credentials. An administrator can approve
an optional update or defer it. Mandatory updates cannot be bypassed.
Before installation, the launcher creates a consistent SQLite backup. Failed
updates automatically restore the previous images and database.

## Developer release

Run the **Publish TexTradeOS Release** GitHub Actions workflow from the backend
repository. Enter the version, exact frontend ref, mandatory flag, and release
notes. The workflow publishes both GHCR images and creates the single Windows
setup executable, portable launcher, checksums, and `update.json`.
