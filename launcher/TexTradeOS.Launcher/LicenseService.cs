using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TexTradeOS.Launcher;

internal static class LicenseService
{
    private const string PublicKey = """
-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAoxNcVfvwvVYnaaFx3tll
1w9r2guMFrtXbuaExo9dKpdWRJ5uyv8AyAfuXeBzOFZ0g4px063XgGWyuKR9i6Ms
VkKbjLYKhp8WxVR6KoA/bBML9q6ceY4N4LLRoouFpCXgaalzDTuNvBgfGU6JxvyM
Y0/ndQGc+gNOfqETLY2yOdgrZN5rIp1ru90AWI0ZzQHVLoirSx1LLYGD74l+zEvM
sg7kHoM8MID83CU94bcun7huQS3CQf6xsHZXI1hglUKAashetlDETP8vaoVIuS0A
06ctckQslAscmIoKWy052GWNi1Y/wDvqoJKuOHEeVj9xJb9EzAePTUfCKSTAf/X3
HzPZl+MiZbta5s6DAIJbHCT6KIba6mSk0btHsAe6wMCwBjRX+U5yauqwgccLwLEQ
Razu3CQfnqry18QX9Z9e/COuULdz42MI3YLb1pCHLDZPB3+h35SwPLIfpM4r6TYs
AAer74Gv8iPLHI79QfX8vWlvXnGfomVEuVlLHZV2GdopAgMBAAE=
-----END PUBLIC KEY-----
""";

    internal static (bool Allowed, string Message) Validate(
        string licensePath,
        FingerprintDocument fingerprint)
    {
        if (!File.Exists(licensePath)) return (false, "License is not installed.");
        try
        {
            var document = JsonSerializer.Deserialize<LicenseDocument>(
                File.ReadAllText(licensePath), JsonOptions.Default);
            if (document is null) return (false, "License is invalid.");

            using var rsa = RSA.Create();
            rsa.ImportFromPem(PublicKey);
            var canonical = CanonicalPayload(document.Payload);
            var signatureValid = rsa.VerifyData(
                Encoding.UTF8.GetBytes(canonical),
                Convert.FromBase64String(document.Signature),
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);
            if (!signatureValid) return (false, "License signature is invalid.");

            var matches = document.Payload.Fingerprints.Count(item =>
                fingerprint.Fingerprints.TryGetValue(item.Key, out var actual) &&
                actual == item.Value);
            if (matches < Math.Max(1, document.Payload.MinimumMatches))
                return (false, "License belongs to another server.");

            return (true, $"Licensed to {document.Payload.Customer}");
        }
        catch (Exception error)
        {
            return (false, $"License validation failed: {error.Message}");
        }
    }

    private static string CanonicalPayload(LicensePayload payload) =>
        JsonSerializer.Serialize(new
        {
            schemaVersion = payload.SchemaVersion,
            licenseId = payload.LicenseId,
            customer = payload.Customer,
            issuedAt = payload.IssuedAt,
            minimumMatches = payload.MinimumMatches,
            fingerprints = payload.Fingerprints,
        }, JsonOptions.Compact);
}

internal static class JsonOptions
{
    internal static readonly JsonSerializerOptions Default = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };
    internal static readonly JsonSerializerOptions Compact = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };
}
