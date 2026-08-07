# SlipSurge desktop releases

Version `0.1.2` is the one-time migration release that enables automatic updates. Users on an older build must install it once; later releases are delivered from inside the desktop app.

## One-time setup

1. Connect a public Vercel Blob store to the `hub` project.
2. Add its `BLOB_READ_WRITE_TOKEN` to the GitHub Actions environment.
3. Add the complete contents of `%USERPROFILE%\.tauri\slipsurge-updater-v2.key` as the GitHub secret `TAURI_SIGNING_PRIVATE_KEY`.
4. Add the complete contents of `%USERPROFILE%\.tauri\slipsurge-updater-v2.password` as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
5. Back up the private key in a secure password manager or secrets vault. Never commit it.

Before publishing, verify that `%USERPROFILE%\.tauri\slipsurge-updater-v2.key.pub` exactly matches `plugins.updater.pubkey` in `desktop/src-tauri/tauri.conf.json`. A copied or mistyped public key permanently breaks automatic updates for clients containing it.

The public key is embedded in `desktop/src-tauri/tauri.conf.json`. A release signed by another key will be rejected by installed clients.

## Publish an update

1. Bump the same version in `desktop/package.json`, `desktop/src-tauri/Cargo.toml`, and `desktop/src-tauri/tauri.conf.json`.
2. Open GitHub Actions and run **SlipSurge desktop release**.
3. Enter optional release notes. The workflow builds and signs Windows installers, uploads them to Vercel Blob, and replaces `desktop/releases/latest.json`.

At launch, the desktop app requests `/api/desktop/update/{target}/{arch}/{currentVersion}`. The endpoint returns `204` when the installed version is current and a signed update payload when a newer release exists.
