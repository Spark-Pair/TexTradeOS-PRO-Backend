# TexTradeOS Device Licensing

TexTradeOS uses a perpetual, signed, device-bound license. It has no expiry
date. The private RSA key is stored only under
`%USERPROFILE%\.textradeos-license-keys` on the developer machine and must
never be committed or distributed.

## Issue a license

1. On the customer server, open the launcher and select **Fingerprint Request**.
2. Transfer the generated JSON request to the developer.
3. In the backend repository run:

```powershell
npm run license:create -- --request "C:\path\request.json" --customer "Customer Name"
```

4. Send the generated file from `%USERPROFILE%\TexTradeOS-Licenses` to the
   customer.
5. Select **Import License** in the launcher.

The license permits one of four hardware fingerprint components to change.
Replacing the server requires issuing a replacement license.
