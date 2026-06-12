using System.Diagnostics;

namespace TexTradeOS.Launcher;

internal sealed class MainForm : Form
{
    private readonly DeploymentService _deployment = new();
    private readonly FingerprintDocument _fingerprint = FingerprintService.Create();
    private readonly Label _status = new() { AutoSize = true, Font = new Font("Segoe UI", 11, FontStyle.Bold) };
    private readonly Label _urls = new() { AutoSize = true };
    private readonly TextBox _log = new()
    {
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        Dock = DockStyle.Fill,
        Font = new Font("Consolas", 9),
    };
    private readonly System.Windows.Forms.Timer _updateRequestTimer = new() { Interval = 5000 };
    private bool _busy;

    internal MainForm()
    {
        Text = "TexTradeOS";
        Width = 820;
        Height = 610;
        MinimumSize = new Size(720, 520);
        StartPosition = FormStartPosition.CenterScreen;

        var actions = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Top,
            WrapContents = true,
            Padding = new Padding(0, 8, 0, 8),
        };
        actions.Controls.AddRange([
            MakeButton("Start", async () => await StartAppAsync()),
            MakeButton("Stop", async () => await RunBusyAsync("Stopping", () => _deployment.StopAsync(Log))),
            MakeButton("Open", () => { _deployment.OpenApplication(); return Task.CompletedTask; }),
            MakeButton("Check Update", async () => await CheckUpdateAsync(false)),
            MakeButton("Backup", async () => await BackupAsync()),
            MakeButton("Restore", async () => await RestoreAsync()),
            MakeButton("Import License", async () => await ImportLicenseAsync()),
            MakeButton("Fingerprint Request", async () => await ExportFingerprintAsync()),
            MakeButton("Firewall", async () => await RunBusyAsync("Configuring firewall", () => _deployment.ConfigureFirewallAsync(Log))),
            MakeButton("Diagnostics", () => { Process.Start("explorer.exe", DeploymentService.Home); return Task.CompletedTask; }),
        ]);

        var header = new Panel { Dock = DockStyle.Top, Height = 112, Padding = new Padding(16, 14, 16, 8) };
        header.Controls.Add(_urls);
        header.Controls.Add(_status);
        _status.Location = new Point(16, 16);
        _urls.Location = new Point(16, 48);

        var body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16) };
        body.Controls.Add(_log);
        body.Controls.Add(actions);
        Controls.Add(body);
        Controls.Add(header);

        Shown += async (_, _) => await InitializeAsync();
        _updateRequestTimer.Tick += async (_, _) => await ProcessRequestedUpdateAsync();
    }

    private Button MakeButton(string text, Func<Task> action)
    {
        var button = new Button { Text = text, AutoSize = true, Height = 34, Margin = new Padding(0, 0, 8, 8) };
        button.Click += async (_, _) =>
        {
            try { await action(); }
            catch (Exception error) { ShowError(error); }
        };
        return button;
    }

    private async Task InitializeAsync()
    {
        try
        {
            _deployment.EnsureLayout(_fingerprint);
            RefreshLicenseStatus();
            _urls.Text = $"Local: {_deployment.LocalUrl}\r\nLAN:   {_deployment.LanUrl}";
            _updateRequestTimer.Start();

            var license = LicenseService.Validate(DeploymentService.LicensePath, _fingerprint);
            if (!license.Allowed)
            {
                Log("Install a valid device license before starting TexTradeOS.");
                return;
            }
            await StartAppAsync();
        }
        catch (Exception error) { ShowError(error); }
    }

    private async Task StartAppAsync()
    {
        var license = LicenseService.Validate(DeploymentService.LicensePath, _fingerprint);
        if (!license.Allowed) throw new InvalidOperationException(license.Message);
        await RunBusyAsync("Starting Docker", async () =>
        {
            if (!await _deployment.EnsureDockerAsync(Log))
                throw new InvalidOperationException("Docker Desktop is not installed or the engine did not start.");
            var update = await SafeCheckUpdateAsync();
            if (update?.Mandatory == true)
            {
                var answer = MessageBox.Show(
                    $"TexTradeOS {update.Version} is mandatory and must be installed now.\r\n\r\n{update.Notes}",
                    "Mandatory update", MessageBoxButtons.OKCancel, MessageBoxIcon.Warning);
                if (answer != DialogResult.OK) throw new InvalidOperationException("Mandatory update was not approved.");
                await _deployment.InstallUpdateAsync(update, Log);
            }
            else
            {
                await _deployment.StartAsync(Log);
                if (update is not null)
                {
                    var answer = MessageBox.Show(
                        $"TexTradeOS {update.Version} is available. Install it now?\r\n\r\n{update.Notes}",
                        "Update available", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                    if (answer == DialogResult.Yes) await _deployment.InstallUpdateAsync(update, Log);
                }
            }
            _deployment.OpenApplication();
        });
    }

    private async Task CheckUpdateAsync(bool requested)
    {
        await RunBusyAsync("Checking for updates", async () =>
        {
            var update = requested ? _deployment.ReadRequestedUpdate() : await _deployment.CheckForUpdateAsync();
            if (update is null)
            {
                if (!requested) MessageBox.Show("TexTradeOS is up to date.", "Updates");
                return;
            }
            var buttons = update.Mandatory ? MessageBoxButtons.OKCancel : MessageBoxButtons.YesNo;
            var answer = MessageBox.Show(
                $"Install TexTradeOS {update.Version}?\r\n\r\n{update.Notes}",
                update.Mandatory ? "Mandatory update" : "Update available",
                buttons,
                update.Mandatory ? MessageBoxIcon.Warning : MessageBoxIcon.Information);
            if (answer is DialogResult.Yes or DialogResult.OK)
                await _deployment.InstallUpdateAsync(update, Log);
        });
    }

    private async Task ProcessRequestedUpdateAsync()
    {
        if (_busy || !File.Exists(DeploymentService.UpdateRequestPath)) return;
        await CheckUpdateAsync(true);
    }

    private async Task<UpdateMetadata?> SafeCheckUpdateAsync()
    {
        try { return await _deployment.CheckForUpdateAsync(); }
        catch (Exception error)
        {
            Log($"Update check unavailable: {error.Message}");
            return null;
        }
    }

    private async Task BackupAsync()
    {
        await RunBusyAsync("Creating backup", async () =>
        {
            var path = await _deployment.BackupAsync(Log);
            MessageBox.Show($"Backup created:\r\n{path}", "Backup complete");
        });
    }

    private async Task RestoreAsync()
    {
        using var dialog = new OpenFileDialog
        {
            InitialDirectory = DeploymentService.BackupDirectory,
            Filter = "SQLite backups (*.sqlite)|*.sqlite",
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        if (MessageBox.Show("Replace the current database with this backup?", "Restore",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        await RunBusyAsync("Restoring backup", () => _deployment.RestoreAsync(dialog.FileName, Log));
    }

    private Task ImportLicenseAsync()
    {
        using var dialog = new OpenFileDialog { Filter = "TexTradeOS license (*.json)|*.json" };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _deployment.ImportLicense(dialog.FileName, _fingerprint);
            RefreshLicenseStatus();
            MessageBox.Show("License installed successfully.", "License");
        }
        return Task.CompletedTask;
    }

    private Task ExportFingerprintAsync()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Choose where to save the fingerprint request",
            UseDescriptionForTitle = true,
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            var path = _deployment.ExportFingerprintRequest(_fingerprint, dialog.SelectedPath);
            MessageBox.Show($"Fingerprint request created:\r\n{path}", "Fingerprint");
        }
        return Task.CompletedTask;
    }

    private void RefreshLicenseStatus()
    {
        var license = LicenseService.Validate(DeploymentService.LicensePath, _fingerprint);
        _status.Text = license.Allowed ? $"Ready - {license.Message}" : $"License required - {license.Message}";
        _status.ForeColor = license.Allowed ? Color.DarkGreen : Color.DarkRed;
    }

    private async Task RunBusyAsync(string activity, Func<Task> action)
    {
        if (_busy) return;
        _busy = true;
        _status.Text = activity;
        UseWaitCursor = true;
        try
        {
            await action();
            RefreshLicenseStatus();
        }
        finally
        {
            UseWaitCursor = false;
            _busy = false;
        }
    }

    private void Log(string message)
    {
        if (InvokeRequired) { BeginInvoke(() => Log(message)); return; }
        _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\r\n");
    }

    private void ShowError(Exception error)
    {
        Log($"ERROR: {error.Message}");
        MessageBox.Show(error.Message, "TexTradeOS", MessageBoxButtons.OK, MessageBoxIcon.Error);
        RefreshLicenseStatus();
    }
}
