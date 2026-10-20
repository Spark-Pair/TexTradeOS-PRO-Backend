using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

namespace TexTradeOS.Launcher;

internal sealed class DeploymentService
{
    internal static readonly string Home =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "TexTradeOS");
    internal static readonly string DataDirectory = Path.Combine(Home, "data");
    internal static readonly string BackupDirectory = Path.Combine(Home, "backups");
    internal static readonly string LicenseDirectory = Path.Combine(Home, "license");
    internal static readonly string ConfigDirectory = Path.Combine(Home, "config");
    internal static readonly string CertificateDirectory = Path.Combine(Home, "cert");
    internal static readonly string ComposePath = Path.Combine(Home, "docker-compose.yml");
    internal static readonly string EnvironmentPath = Path.Combine(ConfigDirectory, ".env");
    internal static readonly string LicensePath = Path.Combine(LicenseDirectory, "license.json");
    internal static readonly string FingerprintPath = Path.Combine(LicenseDirectory, "fingerprint.json");
    internal static readonly string UpdateRequestPath = Path.Combine(DataDirectory, "update-request.json");
    internal static readonly string CommandDirectory = Path.Combine(DataDirectory, "launcher-commands");
    internal static readonly string ResultDirectory = Path.Combine(DataDirectory, "launcher-results");
    internal const string MetadataUrl =
        "https://github.com/Spark-Pair/TexTradeOS-PRO-Backend/releases/latest/download/update.json";

    private readonly HttpClient _http = new(new HttpClientHandler
    {
        // The launcher creates a local self-signed certificate for the detected
        // LAN address. This client is only used for the local health probe;
        // browser traffic still shows the normal certificate warning once.
        ServerCertificateCustomValidationCallback =
            HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
    }) { Timeout = TimeSpan.FromSeconds(15) };

    internal void EnsureLayout(FingerprintDocument fingerprint)
    {
        Directory.CreateDirectory(Home);
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(BackupDirectory);
        Directory.CreateDirectory(LicenseDirectory);
        Directory.CreateDirectory(ConfigDirectory);
        Directory.CreateDirectory(CertificateDirectory);
        Directory.CreateDirectory(CommandDirectory);
        Directory.CreateDirectory(ResultDirectory);

        using (var stream = Assembly.GetExecutingAssembly()
                   .GetManifestResourceStream("TexTradeOS.Launcher.docker-compose.yml")
               ?? throw new InvalidOperationException("The embedded Docker Compose template is missing."))
        using (var reader = new StreamReader(stream))
            File.WriteAllText(ComposePath, reader.ReadToEnd());

        File.WriteAllText(FingerprintPath, JsonSerializer.Serialize(fingerprint, JsonOptions.Default));
        EnsureLanCertificate();
        if (!File.Exists(EnvironmentPath))
        {
            var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
            var refreshSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
            var managementSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
            File.WriteAllText(EnvironmentPath, $"""
TEXTRADEOS_HOME=C:/ProgramData/TexTradeOS
APP_PORT=8443
HTTP_PORT=8080
APP_VERSION={GetLauncherVersion()}
FRONTEND_IMAGE=ghcr.io/spark-pair/textradeos-frontend:latest
BACKEND_IMAGE=ghcr.io/spark-pair/textradeos-backend:latest
CORS_ORIGIN=*
JWT_SECRET={secret}
JWT_REFRESH_SECRET={refreshSecret}
MANAGEMENT_SECRET={managementSecret}
""");
        }
        else
        {
            var environment = ReadEnvironment();
            if (!environment.ContainsKey("HTTP_PORT")) environment["HTTP_PORT"] = "8080";
            if (environment.GetValueOrDefault("APP_PORT", "8080") == "8080")
                environment["APP_PORT"] = "8443";
            var launcherVersion = Assembly.GetExecutingAssembly().GetName().Version;
            var installedVersion = launcherVersion is null
                ? "0.0.0"
                : $"{launcherVersion.Major}.{launcherVersion.Minor}.{launcherVersion.Build}";
            if (environment.GetValueOrDefault("APP_VERSION", "0.0.0") != installedVersion &&
                (environment.GetValueOrDefault("FRONTEND_IMAGE", "").EndsWith(":latest",
                     StringComparison.OrdinalIgnoreCase) ||
                 environment.GetValueOrDefault("FRONTEND_IMAGE", "").EndsWith(":test",
                     StringComparison.OrdinalIgnoreCase)))
                environment["APP_VERSION"] = installedVersion;
            if (!environment.ContainsKey("MANAGEMENT_SECRET"))
            {
                environment["MANAGEMENT_SECRET"] =
                    Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
            }
            WriteEnvironment(environment);
        }
    }

    private static string GetLauncherVersion()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        return version is null ? "0.0.0" : $"{version.Major}.{version.Minor}.{version.Build}";
    }

    internal async Task<bool> EnsureDockerAsync(Action<string> log)
    {
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var desktopCandidates = new[]
        {
            Path.Combine(programFiles, "Docker", "Docker", "Docker Desktop.exe"),
            Path.Combine(programFilesX86, "Docker", "Docker", "Docker Desktop.exe"),
            Path.Combine(localAppData, "Programs", "Docker", "Docker", "Docker Desktop.exe"),
            Path.Combine(localAppData, "Docker", "Docker Desktop.exe"),
        };
        var dockerDirectories = new[]
        {
            Path.Combine(programFiles, "Docker", "Docker", "resources", "bin"),
            Path.Combine(programFilesX86, "Docker", "Docker", "resources", "bin"),
            Path.Combine(localAppData, "Programs", "Docker", "Docker", "resources", "bin"),
        };

        // A launcher started from a shortcut may inherit a stale or incomplete PATH.
        // Docker Desktop's own CLI location is stable even when the shell PATH is not.
        var dockerCli = dockerDirectories
            .Select(directory => Path.Combine(directory, "docker.exe"))
            .FirstOrDefault(File.Exists);
        if (dockerCli is not null)
        {
            var currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            var cliDirectory = Path.GetDirectoryName(dockerCli)!;
            if (!currentPath.Split(Path.PathSeparator).Contains(cliDirectory,
                    StringComparer.OrdinalIgnoreCase))
                Environment.SetEnvironmentVariable("PATH", $"{cliDirectory}{Path.PathSeparator}{currentPath}");
        }

        async Task<bool> EngineReadyAsync()
        {
            try { return (await RunAsync("docker", "info", log, false)).ExitCode == 0; }
            catch (Exception error)
            {
                log($"Docker CLI check failed: {error.Message}");
                return false;
            }
        }

        if (await EngineReadyAsync()) return true;

        var desktop = desktopCandidates.FirstOrDefault(File.Exists);
        if (desktop is null)
        {
            log("Docker Desktop executable was not found in the standard per-machine or per-user locations.");
            return false;
        }

        log($"Docker engine is not ready. Starting Docker Desktop from: {desktop}");
        try
        {
            Process.Start(new ProcessStartInfo(desktop)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(desktop)!,
            });
        }
        catch (Exception error)
        {
            log($"Docker Desktop launch failed: {error.Message}");
            return false;
        }

        // Desktop can take a while on first start or while WSL is waking up.
        // Keep checking the engine instead of treating process launch as readiness.
        const int maxAttempts = 120;
        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            await Task.Delay(TimeSpan.FromSeconds(2));
            if (await EngineReadyAsync())
            {
                log("Docker engine is ready.");
                return true;
            }
            if ((attempt + 1) % 15 == 0)
                log($"Still waiting for Docker engine ({(attempt + 1) * 2}s)...");
        }

        log("Docker Desktop was opened, but its engine did not become ready within 4 minutes.");
        return false;
    }

    internal async Task StartAsync(Action<string> log)
    {
        log("Starting TexTradeOS backend and frontend containers...");
        var result = await ComposeAsync("up -d --remove-orphans", log);
        if (result.ExitCode != 0) throw new InvalidOperationException("Docker Compose could not start TexTradeOS.");
        if (!await WaitForHealthAsync(TimeSpan.FromMinutes(2)))
            throw new TimeoutException("TexTradeOS did not become healthy.");
    }

    internal async Task StopAsync(Action<string> log)
    {
        var result = await ComposeAsync("down", log);
        if (result.ExitCode != 0) throw new InvalidOperationException("Docker Compose could not stop TexTradeOS.");
    }

    internal async Task<string> BackupAsync(Action<string> log)
    {
        Directory.CreateDirectory(BackupDirectory);
        var temporaryName = $".launcher-backup-{Guid.NewGuid():N}.sqlite";
        var temporaryContainerPath = $"/data/{temporaryName}";
        var temporaryHostPath = Path.Combine(DataDirectory, temporaryName);
        var script =
            $"const Database=require('better-sqlite3');(async()=>{{const db=new Database('/data/textradeos.sqlite');await db.backup('{temporaryContainerPath}');db.close()}})().catch(error=>{{console.error(error);process.exit(1)}})";
        var result = await RunAsync(
            "docker",
            $"exec textradeos-backend node -e {Quote(script)}",
            log);
        if (result.ExitCode != 0)
            throw new InvalidOperationException("SQLite could not create a consistent backup.");
        try
        {
            var backupPath = Path.Combine(BackupDirectory,
                $"textradeos-{DateTime.Now:yyyyMMdd-HHmmss}.sqlite");
            File.Move(temporaryHostPath, backupPath);
            PruneBackups();
            return backupPath;
        }
        finally
        {
            File.Delete(temporaryHostPath);
        }
    }

    internal async Task RestoreAsync(string backupPath, Action<string> log)
    {
        if (!File.Exists(backupPath))
            throw new FileNotFoundException("The selected backup does not exist.", backupPath);
        await ValidateBackupAsync(backupPath, log);
        await StopAsync(log);
        try
        {
            File.Copy(backupPath, Path.Combine(DataDirectory, "textradeos.sqlite"), true);
            DeleteWalFiles();
        }
        finally
        {
            await StartAsync(log);
        }
    }

    private async Task ValidateBackupAsync(string backupPath, Action<string> log)
    {
        var temporaryName = $".launcher-validate-{Guid.NewGuid():N}.sqlite";
        var temporaryHostPath = Path.Combine(DataDirectory, temporaryName);
        File.Copy(backupPath, temporaryHostPath, true);
        try
        {
            var script =
                $"const Database=require('better-sqlite3');const db=new Database('/data/{temporaryName}',{{readonly:true}});const integrity=db.pragma('integrity_check',{{simple:true}});const pages=db.pragma('page_count',{{simple:true}});const foreignKeys=db.pragma('foreign_key_check');const tables=new Set(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(row=>row.name));db.close();const required=['businesses','users','invoices','invoice_items'];if(integrity!=='ok'||pages<2||foreignKeys.length||required.some(table=>!tables.has(table))){{console.error('Invalid TexTradeOS database backup');process.exit(1)}}";
            var result = await RunAsync(
                "docker",
                $"exec textradeos-backend node -e {Quote(script)}",
                log);
            if (result.ExitCode != 0)
                throw new InvalidDataException("The selected SQLite backup failed its integrity check.");
        }
        finally
        {
            File.Delete(temporaryHostPath);
        }
    }

    internal async Task<UpdateMetadata?> CheckForUpdateAsync()
    {
        using var response = await _http.GetAsync(MetadataUrl);
        if (!response.IsSuccessStatusCode) return null;
        var metadata = JsonSerializer.Deserialize<UpdateMetadata>(
            await response.Content.ReadAsStringAsync(), JsonOptions.Default);
        if (metadata is null || !IsTrusted(metadata)) return null;
        var current = ReadEnvironment().GetValueOrDefault("APP_VERSION", "0.0.0");
        return CompareVersions(metadata.Version, current) > 0 ? metadata : null;
    }

    internal async Task<bool> InstallUpdateAsync(UpdateMetadata update, Action<string> log)
    {
        if (!IsTrusted(update)) throw new InvalidOperationException("Update metadata is not trusted.");
        var launcherVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0, 0);
        if (Version.TryParse(update.MinimumLauncherVersion, out var minimumLauncher) &&
            launcherVersion < minimumLauncher && update.LauncherUpdateRequired != true)
        {
            throw new InvalidOperationException(
                $"This release requires launcher {minimumLauncher} or newer. Install the new TexTradeOS setup package from the release page.");
        }
        log($"Pulling TexTradeOS {update.Version}...");
        if ((await RunAsync("docker", $"pull {Quote(update.BackendImage)}", log)).ExitCode != 0 ||
            (await RunAsync("docker", $"pull {Quote(update.FrontendImage)}", log)).ExitCode != 0)
            throw new InvalidOperationException("One or more update images could not be downloaded.");

        var oldEnvironment = File.ReadAllText(EnvironmentPath);
        var databaseBackup = await BackupAsync(log);
        await StopAsync(log);
        try
        {
            var environment = ReadEnvironment();
            environment["APP_VERSION"] = update.Version;
            environment["BACKEND_IMAGE"] = update.BackendImage;
            environment["FRONTEND_IMAGE"] = update.FrontendImage;
            WriteEnvironment(environment);
            File.Delete(UpdateRequestPath);
            await StartAsync(log);
            PruneBackups();
            return await StartLauncherUpdateIfNeededAsync(update, log);
        }
        catch
        {
            log("Update failed. Restoring the previous release...");
            await ComposeAsync("down", log);
            File.WriteAllText(EnvironmentPath, oldEnvironment);
            File.Copy(databaseBackup, Path.Combine(DataDirectory, "textradeos.sqlite"), true);
            DeleteWalFiles();
            await StartAsync(log);
            throw;
        }
    }

    internal UpdateMetadata? ReadRequestedUpdate()
    {
        try
        {
            if (!File.Exists(UpdateRequestPath)) return null;
            var update = JsonSerializer.Deserialize<UpdateMetadata>(
                File.ReadAllText(UpdateRequestPath), JsonOptions.Default);
            return update is not null && IsTrusted(update) ? update : null;
        }
        catch { return null; }
    }

    internal async Task<bool> ProcessRequestedUpdateAsync(Action<string> log)
    {
        var update = ReadRequestedUpdate();
        if (update is null) return false;
        return await InstallUpdateAsync(update, log);
    }

    internal async Task ProcessPendingCommandsAsync(
        FingerprintDocument fingerprint,
        Action<string> log)
    {
        var environment = ReadEnvironment();
        var expectedSecret = environment.GetValueOrDefault("MANAGEMENT_SECRET", "");
        if (string.IsNullOrWhiteSpace(expectedSecret)) return;

        foreach (var commandPath in Directory.GetFiles(CommandDirectory, "*.json")
                     .OrderBy(path => File.GetCreationTimeUtc(path)))
        {
            string id = Path.GetFileNameWithoutExtension(commandPath);
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(commandPath));
                var root = document.RootElement;
                if (root.GetProperty("secret").GetString() != expectedSecret)
                    throw new InvalidOperationException("Management command authentication failed.");
                id = root.GetProperty("id").GetString() ?? id;
                var type = root.GetProperty("type").GetString() ?? "";
                var payload = root.TryGetProperty("payload", out var payloadValue)
                    ? payloadValue
                    : default;
                object? result = type switch
                {
                    "import-license" => ImportLicenseCommand(payload, fingerprint),
                    "backup" => new { path = await BackupAsync(log) },
                    "restore" => await RestoreCommandAsync(payload, log),
                    "restore-upload" => await RestoreUploadCommandAsync(payload, log),
                    "firewall" => await FirewallCommandAsync(log),
                    _ => throw new InvalidOperationException("Unsupported management command."),
                };
                WriteCommandResult(id, new { id, state = "completed", completedAt = DateTime.UtcNow, result });
            }
            catch (Exception error)
            {
                log($"Management command failed: {error.Message}");
                WriteCommandResult(id, new
                {
                    id,
                    state = "failed",
                    completedAt = DateTime.UtcNow,
                    message = error.Message,
                });
            }
            finally
            {
                File.Delete(commandPath);
            }
        }
    }

    private object ImportLicenseCommand(JsonElement payload, FingerprintDocument fingerprint)
    {
        if (!payload.TryGetProperty("document", out var licenseDocument))
            throw new InvalidOperationException("License document is missing.");
        var temporary = Path.Combine(LicenseDirectory, $"license-{Guid.NewGuid():N}.json");
        File.WriteAllText(temporary, licenseDocument.GetRawText());
        try
        {
            ImportLicense(temporary, fingerprint);
            var validation = LicenseService.Validate(LicensePath, fingerprint);
            return new { validation.Allowed, validation.Message };
        }
        finally
        {
            File.Delete(temporary);
        }
    }

    private async Task<object> RestoreCommandAsync(JsonElement payload, Action<string> log)
    {
        var backup = payload.GetProperty("backup").GetString() ?? "";
        if (Path.GetFileName(backup) != backup)
            throw new InvalidOperationException("Invalid backup name.");
        var backupPath = Path.Combine(BackupDirectory, backup);
        await RestoreAsync(backupPath, log);
        return new { backup };
    }

    private async Task<object> RestoreUploadCommandAsync(JsonElement payload, Action<string> log)
    {
        var fileName = payload.GetProperty("fileName").GetString() ?? "";
        if (!Guid.TryParse(Path.GetFileNameWithoutExtension(fileName), out _) ||
            !string.Equals(Path.GetExtension(fileName), ".sqlite", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid uploaded backup name.");
        var uploadDirectory = Path.Combine(DataDirectory, "restore-uploads");
        var uploadPath = Path.Combine(uploadDirectory, fileName);
        try
        {
            await RestoreAsync(uploadPath, log);
            return new { fileName };
        }
        finally
        {
            File.Delete(uploadPath);
        }
    }

    private async Task<object> FirewallCommandAsync(Action<string> log)
    {
        await ConfigureFirewallAsync(log);
        return new { configured = true };
    }

    private static void WriteCommandResult(string id, object result)
    {
        var path = Path.Combine(ResultDirectory, $"{id}.json");
        var temporary = $"{path}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(result, JsonOptions.Default));
        File.Move(temporary, path, true);
        foreach (var oldResult in new DirectoryInfo(ResultDirectory)
                     .GetFiles("*.json")
                     .Where(file => file.LastWriteTimeUtc < DateTime.UtcNow.AddDays(-7)))
            oldResult.Delete();
    }

    internal void ImportLicense(string sourcePath, FingerprintDocument fingerprint)
    {
        var temporaryPath = Path.Combine(LicenseDirectory, "license.importing.json");
        File.Copy(sourcePath, temporaryPath, true);
        var validation = LicenseService.Validate(temporaryPath, fingerprint);
        if (!validation.Allowed)
        {
            File.Delete(temporaryPath);
            throw new InvalidOperationException(validation.Message);
        }
        File.Move(temporaryPath, LicensePath, true);
    }

    internal string ExportFingerprintRequest(FingerprintDocument fingerprint, string destinationDirectory)
    {
        var path = Path.Combine(destinationDirectory,
            $"TexTradeOS-Fingerprint-{Environment.MachineName}.json");
        File.WriteAllText(path, JsonSerializer.Serialize(fingerprint, JsonOptions.Default));
        return path;
    }

    internal string LocalUrl => "https://127.0.0.1:8443";
    internal string LanUrl => $"https://{GetLanAddress()}:8443";

    internal void OpenApplication(bool setup = false) =>
        Process.Start(new ProcessStartInfo(setup ? $"{LanUrl}/setup" : LanUrl)
        {
            UseShellExecute = true,
        });

    internal async Task ConfigureFirewallAsync(Action<string> log)
    {
        var command =
            "New-NetFirewallRule -DisplayName 'TexTradeOS LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080,8443 -Profile Private -ErrorAction SilentlyContinue";
        var arguments =
            $"-NoProfile -Command \"Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"\"{command}\"\"'\"";
        await RunAsync("powershell.exe", arguments, log);
    }

    private async Task<ProcessResult> ComposeAsync(string arguments, Action<string> log) =>
        await RunAsync("docker",
            $"compose --env-file {Quote(EnvironmentPath)} -f {Quote(ComposePath)} {arguments}", log);

    private async Task<bool> WaitForHealthAsync(TimeSpan timeout)
    {
        var started = DateTime.UtcNow;
        while (DateTime.UtcNow - started < timeout)
        {
            try
            {
                using var response = await _http.GetAsync($"{LocalUrl}/api/health");
                if (response.IsSuccessStatusCode) return true;
            }
            catch { }
            await Task.Delay(1500);
        }
        return false;
    }

    private static async Task<ProcessResult> RunAsync(
        string fileName, string arguments, Action<string> log, bool emitOutput = true)
    {
        var startInfo = new ProcessStartInfo(fileName, arguments)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var process = Process.Start(startInfo);
        if (process is null) return new ProcessResult(-1, "", "Could not start process");
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        var output = await outputTask;
        var error = await errorTask;
        if (emitOutput)
        {
            if (!string.IsNullOrWhiteSpace(output)) log(output.Trim());
            if (!string.IsNullOrWhiteSpace(error)) log(error.Trim());
        }
        return new ProcessResult(process.ExitCode, output, error);
    }

    private Dictionary<string, string> ReadEnvironment() =>
        File.ReadAllLines(EnvironmentPath)
            .Where(line => !string.IsNullOrWhiteSpace(line) && !line.TrimStart().StartsWith('#'))
            .Select(line => line.Split('=', 2))
            .Where(parts => parts.Length == 2)
            .ToDictionary(parts => parts[0].Trim(), parts => parts[1].Trim());

    private void WriteEnvironment(Dictionary<string, string> values) =>
        File.WriteAllLines(EnvironmentPath, values.Select(item => $"{item.Key}={item.Value}"));

    private async Task<bool> StartLauncherUpdateIfNeededAsync(UpdateMetadata update, Action<string> log)
    {
        try
        {
            var launcherVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0);
            if (!Version.TryParse(update.Version, out var updateVersion))
                return false;
            var launcherUpdateRequired = update.LauncherUpdateRequired ?? launcherVersion < updateVersion;
            if (!launcherUpdateRequired) return false;

            var setupUrl = string.IsNullOrWhiteSpace(update.LauncherSetupUrl)
                ? BuildLauncherSetupUrl(update)
                : update.LauncherSetupUrl;
            if (!IsTrustedLauncherSetupUrl(setupUrl))
            {
                log("Launcher setup URL is not trusted; skipping launcher self-update.");
                return false;
            }

            Directory.CreateDirectory(DataDirectory);
            var installerPath = Path.Combine(DataDirectory, $"TexTradeOS-PRO-Setup-{update.Version}.exe");
            var temporaryPath = $"{installerPath}.download";

            log($"Downloading TexTradeOS launcher {update.Version}...");
            using (var client = new HttpClient { Timeout = TimeSpan.FromMinutes(10) })
            using (var response = await client.GetAsync(setupUrl))
            {
                response.EnsureSuccessStatusCode();
                await using var source = await response.Content.ReadAsStreamAsync();
                await using var destination = File.Create(temporaryPath);
                await source.CopyToAsync(destination);
            }
            File.Move(temporaryPath, installerPath, true);

            log($"Starting TexTradeOS launcher installer {update.Version}...");
            var launcherPath = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "TexTradeOS.exe");
            var script = $"""
                $ErrorActionPreference = 'Stop'
                Start-Process -FilePath '{PowerShellLiteral(installerPath)}' -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS' -Wait
                Start-Process -FilePath '{PowerShellLiteral(launcherPath)}'
                """;
            var encodedScript = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            Process.Start(new ProcessStartInfo(
                "powershell.exe",
                $"-NoProfile -ExecutionPolicy Bypass -EncodedCommand {encodedScript}")
            {
                UseShellExecute = true,
                Verb = "runas",
            });
            return true;
        }
        catch (Exception error)
        {
            log($"Launcher self-update could not be started: {error.Message}");
            return false;
        }
    }

    private static string BuildLauncherSetupUrl(UpdateMetadata update) =>
        $"https://github.com/Spark-Pair/TexTradeOS-PRO-Backend/releases/download/v{update.Version}/TexTradeOS-PRO-Setup-{update.Version}.exe";

    private static bool IsTrusted(UpdateMetadata update) =>
        Version.TryParse(update.Version, out _) &&
        update.ReleaseUrl.StartsWith("https://github.com/Spark-Pair/", StringComparison.OrdinalIgnoreCase) &&
        (string.IsNullOrWhiteSpace(update.LauncherSetupUrl) ||
         IsTrustedLauncherSetupUrl(update.LauncherSetupUrl)) &&
        update.FrontendImage.StartsWith("ghcr.io/spark-pair/textradeos-frontend@sha256:", StringComparison.OrdinalIgnoreCase) &&
        update.BackendImage.StartsWith("ghcr.io/spark-pair/textradeos-backend@sha256:", StringComparison.OrdinalIgnoreCase);

    private static bool IsTrustedLauncherSetupUrl(string url) =>
        url.StartsWith(
            "https://github.com/Spark-Pair/TexTradeOS-PRO-Backend/releases/download/",
            StringComparison.OrdinalIgnoreCase) &&
        url.EndsWith(".exe", StringComparison.OrdinalIgnoreCase);

    private static int CompareVersions(string left, string right)
    {
        if (!Version.TryParse(left, out var a) || !Version.TryParse(right, out var b)) return 0;
        return a.CompareTo(b);
    }

    private static string GetLanAddress()
    {
        var address = NetworkInterface.GetAllNetworkInterfaces()
            .Where(item => item.OperationalStatus == OperationalStatus.Up &&
                           item.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                           item.NetworkInterfaceType != NetworkInterfaceType.Tunnel)
            .SelectMany(item => item.GetIPProperties().UnicastAddresses)
            .Select(item => item.Address)
            .Where(item => item.AddressFamily == AddressFamily.InterNetwork &&
                           !IPAddress.IsLoopback(item) &&
                           !item.ToString().StartsWith("169.254.", StringComparison.Ordinal))
            .OrderByDescending(item => item.ToString().StartsWith("192.168.", StringComparison.Ordinal))
            .ThenByDescending(item => item.ToString().StartsWith("10.", StringComparison.Ordinal))
            .FirstOrDefault();
        return address?.ToString() ?? "SERVER-IP";
    }

    private static void EnsureLanCertificate()
    {
        var lanAddress = GetLanAddress();
        var certificatePath = Path.Combine(CertificateDirectory, "server.crt");
        var keyPath = Path.Combine(CertificateDirectory, "server.key");
        var addressPath = Path.Combine(CertificateDirectory, "lan-address.txt");

        try
        {
            if (File.Exists(certificatePath) && File.Exists(keyPath) &&
                File.Exists(addressPath) &&
                string.Equals(File.ReadAllText(addressPath).Trim(), lanAddress, StringComparison.Ordinal))
                return;
        }
        catch
        {
            // A damaged or old certificate is replaced below.
        }

        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=TexTradeOS LAN", rsa,
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var san = new SubjectAlternativeNameBuilder();
        if (IPAddress.TryParse(lanAddress, out var ip)) san.AddIpAddress(ip);
        san.AddIpAddress(IPAddress.Loopback);
        san.AddDnsName("localhost");
        san.AddDnsName(Environment.MachineName);
        request.CertificateExtensions.Add(san.Build());
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, false));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, false));
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(
            new OidCollection { new("1.3.6.1.5.5.7.3.1") }, false));

        using var certificate = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(2));
        File.WriteAllText(certificatePath, certificate.ExportCertificatePem());
        File.WriteAllText(keyPath, rsa.ExportPkcs8PrivateKeyPem());
        File.WriteAllText(addressPath, lanAddress);
    }

    private static void DeleteWalFiles()
    {
        File.Delete(Path.Combine(DataDirectory, "textradeos.sqlite-wal"));
        File.Delete(Path.Combine(DataDirectory, "textradeos.sqlite-shm"));
    }

    private static void PruneBackups()
    {
        foreach (var file in new DirectoryInfo(BackupDirectory)
                     .GetFiles("textradeos-*.sqlite")
                     .Where(file => System.Text.RegularExpressions.Regex.IsMatch(
                         file.Name, "^textradeos-\\d{8}-\\d{6}\\.sqlite$",
                         System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                     .OrderByDescending(file => file.CreationTimeUtc)
                     .Skip(10))
            file.Delete();
    }

    private static string Quote(string value) => $"\"{value.Replace("\"", "\\\"")}\"";
    private static string PowerShellLiteral(string value) => value.Replace("'", "''");
    private sealed record ProcessResult(int ExitCode, string Output, string Error);
}
