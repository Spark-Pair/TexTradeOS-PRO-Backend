using System.Text.Json.Serialization;

namespace TexTradeOS.Launcher;

internal sealed class FingerprintDocument
{
    [JsonPropertyName("schemaVersion")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("O");
    [JsonPropertyName("fingerprints")] public SortedDictionary<string, string> Fingerprints { get; set; } = [];
}

internal sealed class LicenseDocument
{
    [JsonPropertyName("payload")] public LicensePayload Payload { get; set; } = new();
    [JsonPropertyName("signature")] public string Signature { get; set; } = "";
}

internal sealed class LicensePayload
{
    [JsonPropertyName("schemaVersion")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("licenseId")] public string LicenseId { get; set; } = "";
    [JsonPropertyName("customer")] public string Customer { get; set; } = "";
    [JsonPropertyName("issuedAt")] public string IssuedAt { get; set; } = "";
    [JsonPropertyName("minimumMatches")] public int MinimumMatches { get; set; } = 3;
    [JsonPropertyName("fingerprints")] public SortedDictionary<string, string> Fingerprints { get; set; } = [];
}

internal sealed class UpdateMetadata
{
    [JsonPropertyName("schemaVersion")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("version")] public string Version { get; set; } = "";
    [JsonPropertyName("mandatory")] public bool Mandatory { get; set; }
    [JsonPropertyName("publishedAt")] public string? PublishedAt { get; set; }
    [JsonPropertyName("releaseUrl")] public string ReleaseUrl { get; set; } = "";
    [JsonPropertyName("notes")] public string Notes { get; set; } = "";
    [JsonPropertyName("minimumLauncherVersion")] public string MinimumLauncherVersion { get; set; } = "0.0.0";
    [JsonPropertyName("frontendImage")] public string FrontendImage { get; set; } = "";
    [JsonPropertyName("backendImage")] public string BackendImage { get; set; } = "";
}
