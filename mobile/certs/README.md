# iOS Push Notification Credentials (APNs)

This folder holds the Apple Push Notification service (APNs) authentication key
used to authorize push delivery to iOS devices.

## Files

- `AuthKey_9TDWB62L6A.p8` — APNs auth key (private key, PKCS#8 PEM).

## Configuration values

| Field   | Value             |
| ------- | ----------------- |
| Key ID  | `9TDWB62L6A`      |
| Team ID | `X4XGGF6FYA`      |
| Bundle  | `com.postmeplex.app` |

## How the key gets used

The `.p8` file is **not bundled into the app** — it lives here for
convenience so it can be uploaded to the build/publish flow.

To wire it up for real iOS push delivery:

1. Click **Publish** in the top right of the Emergent editor.
2. Deploy the app.
3. Click **Generate build** and select **iOS**.
4. When the build UI prompts for the **APNs auth key**, upload the
   `AuthKey_9TDWB62L6A.p8` file from this folder and enter the Key ID
   (`9TDWB62L6A`) and Team ID (`X4XGGF6FYA`) shown above.

The Emergent push relay (SuprSend) uses this key to authenticate with
Apple's APNs endpoint when delivering pushes to iOS devices.

## Security

- Do **NOT** commit `.p8` files to a public git repository. They are
  ignored via `.gitignore` at the project root.
- Rotate the key via Apple Developer → Certificates, Identifiers &
  Profiles → Keys if compromised.
