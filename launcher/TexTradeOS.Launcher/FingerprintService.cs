using Microsoft.Win32;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace TexTradeOS.Launcher;

internal static class FingerprintService
{
    internal static FingerprintDocument Create()
    {
        var values = new SortedDictionary<string, string>
        {
            ["machineGuid"] = ReadMachineGuid(),
            ["systemUuid"] = RunPowerShell("(Get-CimInstance Win32_ComputerSystemProduct).UUID"),
            ["biosSerial"] = RunPowerShell("(Get-CimInstance Win32_BIOS).SerialNumber"),
            ["baseboardSerial"] = RunPowerShell("(Get-CimInstance Win32_BaseBoard).SerialNumber"),
        };
        return new FingerprintDocument
        {
            Fingerprints = new SortedDictionary<string, string>(
                values.ToDictionary(item => item.Key, item => Hash(item.Value)))
        };
    }

    private static string ReadMachineGuid() =>
        Registry.GetValue(
            @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography",
            "MachineGuid",
            "")?.ToString() ?? "";

    private static string RunPowerShell(string command)
    {
        var startInfo = new ProcessStartInfo("powershell.exe",
            $"-NoProfile -NonInteractive -Command \"{command}\"")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var process = Process.Start(startInfo);
        if (process is null) return "";
        var output = process.StandardOutput.ReadToEnd().Trim();
        process.WaitForExit(10000);
        return process.ExitCode == 0 ? output : "";
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            value.Trim().ToUpperInvariant()))).ToLowerInvariant();
}
