namespace TexTradeOS.Launcher;

internal static class Program
{
    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        if (args.Length > 0)
        {
            var fingerprint = FingerprintService.Create();
            var deployment = new DeploymentService();
            deployment.EnsureLayout(fingerprint);
            var license = LicenseService.Validate(DeploymentService.LicensePath, fingerprint);
            if (!license.Allowed) return 2;
            if (args.Contains("--validate-license", StringComparer.OrdinalIgnoreCase)) return 0;
            try
            {
                if (args.Contains("--start", StringComparer.OrdinalIgnoreCase))
                {
                    if (!await deployment.EnsureDockerAsync(Console.WriteLine)) return 3;
                    await deployment.StartAsync(Console.WriteLine);
                    return 0;
                }
                if (args.Contains("--stop", StringComparer.OrdinalIgnoreCase))
                {
                    await deployment.StopAsync(Console.WriteLine);
                    return 0;
                }
                if (args.Contains("--backup", StringComparer.OrdinalIgnoreCase))
                {
                    Console.WriteLine(await deployment.BackupAsync(Console.WriteLine));
                    return 0;
                }
                var restoreIndex = Array.FindIndex(
                    args, value => value.Equals("--restore", StringComparison.OrdinalIgnoreCase));
                if (restoreIndex >= 0 && restoreIndex + 1 < args.Length)
                {
                    await deployment.RestoreAsync(args[restoreIndex + 1], Console.WriteLine);
                    return 0;
                }
            }
            catch (Exception error)
            {
                Directory.CreateDirectory(DeploymentService.Home);
                File.AppendAllText(
                    Path.Combine(DeploymentService.Home, "launcher-error.log"),
                    $"[{DateTimeOffset.Now:O}]{Environment.NewLine}{error}{Environment.NewLine}{Environment.NewLine}");
                Console.Error.WriteLine(error);
                return 1;
            }
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
        return 0;
    }
}
