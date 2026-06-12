# TexTradeOS Installation Guide

## What the customer receives

- `TexTradeOS-Setup-X.Y.Z.exe`: the single installation file.
- `license.json`: the signed license issued for the server computer.

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
5. Click **Fingerprint Request** and send the generated JSON file to the
   TexTradeOS developer.
6. After receiving `license.json`, click **License Import** and select it.
7. Click **Firewall** once and approve the Windows administrator prompt.
8. Click **Start**.

The launcher validates the license, starts Docker Desktop when necessary,
creates `C:\ProgramData\TexTradeOS`, starts both containers, waits for health
checks, and opens TexTradeOS in the default browser.

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

Use the launcher's **Backup** and **Restore** buttons. Uninstalling the launcher
does not automatically delete business data.

## Updates

The launcher checks the public `Spark-Pair/TexTradeOS-Releases` repository for
the latest GitHub release metadata. An administrator can approve an optional
update or defer it. Mandatory updates cannot be bypassed.
Before installation, the launcher creates a consistent SQLite backup. Failed
updates automatically restore the previous images and database.

## Developer release

Run the **Publish TexTradeOS Release** GitHub Actions workflow from the backend
repository. Enter the version, exact frontend ref, mandatory flag, and release
notes. The workflow publishes both GHCR images and creates the single Windows
setup executable, portable launcher, checksums, and `update.json`.
