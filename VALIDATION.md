# Validation — 0.1.0 development preview

- Production TypeScript/Vite build passed.
- 46 core, SQLite, import, and provider-boundary tests passed.
- Actual Electron tests passed for editing, accept/reject, consent-based feedback, export, restart persistence, importing samples, training, and profile isolation.
- One additional desktop test covering settings persistence, stale suggestions, and renderer isolation timed out. This remains unresolved; do not treat the full end-to-end suite as passing.
- Both Mac packages passed independent checks of 15 ad-hoc Mach-O code signatures and 247 resource entries. ZIP integrity, executable permissions and symlink preservation were checked.
- Packages were built in Linux. Native macOS/Windows installation, Keychain/DPAPI behavior and Gatekeeper/SmartScreen flows have not been tested.
- Mac packages have ad-hoc signatures, with no Developer ID signing or notarization. Windows packages are unsigned.
- AI integration was tested with deterministic mocks, not a live paid provider.

These are development previews, not a production release.

## Native release validation — v0.1.0-preview.3

GitHub run https://github.com/2riell/NaturalWrite/actions/runs/40178108374 passed all 46 tests and production builds on Windows, Intel macOS, and Apple silicon macOS. Native installers were built. Both packaged Mac apps passed an automated launch check that opened the editor and loaded SQLite storage. This does not establish Gatekeeper approval for downloaded files, interactive installation, or Keychain/API-key operation. The previously documented additional Linux desktop test timeout remains unresolved.
