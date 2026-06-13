# Publishing TexTradeOS Releases

The backend repository is the release orchestrator. Its GitHub Actions workflow
builds both container images, the Windows launcher, the installer, checksums,
and `update.json`.

## One-time GitHub setup

1. Push the frontend repository to `Spark-Pair/TexTradeOS-PRO`.
2. Push the backend repository to `Spark-Pair/TexTradeOS-PRO-Backend`.
3. Make the backend repository public. GitHub Releases in a private repository
   cannot be downloaded anonymously by customer launchers. If the backend
   source must remain private, use a separate public releases repository
   instead.
4. If the frontend repository is private, create a fine-grained GitHub token
   with read access to it and save it in the backend repository as the Actions
   secret `FRONTEND_REPO_TOKEN`.
5. Enable GitHub Actions in the backend repository.
6. In **Settings > Actions > General**, set workflow permissions to
   **Read and write permissions**.
7. After the first release, open both GHCR package settings and change package
   visibility to **Public**.

## Publish an application update

1. Complete and test the frontend and backend changes.
2. Commit and push both repositories.
3. Copy the exact frontend commit SHA:

   ```powershell
   git -C ..\TexTradeOS-PRO rev-parse HEAD
   ```

4. In GitHub, open the backend repository.
5. Select **Actions** then **Publish TexTradeOS Release**.
6. Select **Run workflow** and provide:
   - `version`: a new semantic version such as `1.0.1`
   - `frontend_ref`: the exact frontend commit SHA
   - `mandatory`: `false` for normal updates or `true` for required updates
   - `minimum_launcher_version`: normally the currently supported launcher;
     use the new version when launcher code changed
   - `notes`: concise customer-facing release notes
7. Run the workflow from the backend commit that should be released.
8. Wait for all three jobs to succeed.
9. Open the resulting release in the backend repository and verify that it
   contains:
   - `update.json`
   - `TexTradeOS-Setup-X.Y.Z.exe`
   - `TexTradeOS-Portable-X.Y.Z.zip`
   - `checksums.txt`

Do not reuse a version number. Every published update must be greater than the
installed `APP_VERSION`.

## How clients update

The backend checks the latest release's `update.json`. After an administrator
approves the update, the launcher:

1. Pulls the frontend and backend images by immutable SHA-256 digest.
2. Creates a consistent SQLite backup.
3. Stops the existing containers.
4. Starts the new release and waits for health checks.
5. Restores the old images and database automatically if installation fails.

Optional updates can be deferred per version. Mandatory updates block normal
application API use until the launcher installs the release.

## Launcher updates

Container-only releases update automatically. When a release requires a newer
launcher, increase `minimumLauncherVersion` in the release metadata generation
and have customers run the new setup executable from the GitHub Release.

Release `1.1.0` is the transition to the hidden launcher agent and web-based
system management. Existing `1.0.0` installations must run the `1.1.0` setup
once. Later container-only updates can be installed entirely from the web app.
