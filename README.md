# NaturalWrite · desktop preview

NaturalWrite helps you review your writing while keeping your own wording and voice. This is version 0.1.0, an unsigned development preview for Windows x64 and macOS (Apple silicon and Intel).

## Download

Download ready-to-run apps from [GitHub Releases](https://github.com/2riell/NaturalWrite/releases). Expand **Assets** on the preview release and choose your Mac architecture or the Windows setup EXE. The automatic **Source code** downloads are not installers.

Ready-to-run preview downloads (no Node.js or source setup needed):

- [Mac — Apple silicon (DMG)](https://github.com/2riell/NaturalWrite/releases/download/v0.1.0-preview.3/NaturalWrite-0.1.0-macOS-arm64.dmg)
- [Mac — Intel (DMG)](https://github.com/2riell/NaturalWrite/releases/download/v0.1.0-preview.3/NaturalWrite-0.1.0-macOS-x64.dmg)
- [Windows x64 installer (EXE)](https://github.com/2riell/NaturalWrite/releases/download/v0.1.0-preview.3/NaturalWrite-0.1.0-Windows-x64-Setup.exe)

## Start using the app

- **Windows:** extract the entire Windows ZIP, open its folder, and run `NaturalWrite.exe`. Keep the other files beside the executable. If a setup EXE is included, it installs the same app for your user account.
- **Mac:** choose the Apple silicon or Intel download to match **Apple menu → About This Mac**. Extract the ZIP and move `NaturalWrite.app` into Applications. These preview packages are not Apple notarized. Gatekeeper may require approval in **System Settings → Privacy & Security → Open Anyway** after your first attempt to open the app.
- Runtime targets: Windows 10/11 x64; macOS 12 or newer. Windows ARM computers need x64 emulation. There is no mobile release.

The packages contain Electron and their application dependencies. You do not need Node.js to run them. The source archive is for development and is not an installer.

## Writing and revision

1. Create a document in **Editor**, then write or paste your draft.
2. Select your writing profile. Preservation starts enabled at **85/100**, with vocabulary, sentence structure, and meaning checks enabled.
3. Request suggestions. Review the original wording, proposed wording, reasons, and any meaning warnings. Accept or reject each proposed change, then apply the changes you chose.
4. Save your document locally or export a TXT/Markdown copy. Suggestions never automatically replace your writing.

The built-in **Local proofreading** engine works offline. It corrects a small set of common errors and offers a few concise alternatives at lower preservation settings. It is not a complete grammar checker or a language model. For broader revision and interpretation of custom instructions, configure a compatible AI provider in **Settings**.

The AI integration uses a Chat Completions endpoint with JSON responses. Enter its API base URL, a model your account can access, and your own API key when required. The provider may charge for usage. Clicking the revision action sends the current document, instructions, preferences, and enabled trained-profile characteristics to that endpoint. Raw training documents are not sent. A separate AI request checks proposed changes when meaning verification is enabled. The app marks failed or incomplete verification rather than silently treating it as successful. It makes no AI-detector promises.

## Train your style

Use **Train My Writing Style** to import PDF, DOCX, UTF-8 TXT, or Markdown files, or paste your own writing. Start with 5–10 samples; you can add more. Preview and categorize samples before training. Each profile has its own samples, settings, expressions, and feedback.

Training computes local writing-pattern observations such as sentence length, frequent words and openings, transitions, punctuation, and paragraph length. These observations form an editable profile; they do not fine-tune a language model. A small sample cannot reliably distinguish every grammar habit from an error or establish what words you never use. Review and edit the profile before relying on it. Comparing a draft with your profile also uses these local measurements.

Feedback is saved as feedback. It changes writing preferences only when you explicitly enable learning for that feedback. Generated revisions never become training samples automatically.

PDF import extracts existing text; it does not perform OCR. Scanned PDFs need OCR first. Password-protected PDFs must be unlocked before import. Formatting is reduced to plain text. Each imported file is limited to 15 MB and 200,000 characters; a profile can hold up to 200 samples.

## Local data and privacy

Profiles, samples, feedback, preferences, and documents are stored in a SQLite database inside Electron's user-data folder:

- Windows: `%APPDATA%\NaturalWrite`
- macOS: `~/Library/Application Support/NaturalWrite`

Use **Open data folder** in Settings to locate the actual folder. Close the app before copying this folder for a backup. The database is not encrypted. Your operating-system account protects local files. API keys are encrypted using the operating system's secure storage and are never exposed to the editor; moving a saved key file to another machine may make it unreadable. There is no account, synchronization, telemetry, or auto-update service.

## Development

Node.js 24 and npm are recommended. From the source folder:

```sh
npm ci
npm test
npm run build
npm start
```

`npm run dev` starts only the web renderer. The application uses its desktop bridge for persistence and imports; use `npm run build && npm start` to run the full app.

```sh
npm run package          # cross-package preview ZIPs
npm run dist:win         # NSIS installer on a Windows build machine
npm run dist:mac         # DMG and ZIP on a Mac build machine
```

See `VALIDATION.md` for the checks actually completed. Native signing and notarization require the appropriate developer credentials. Build workflows save artifacts and do not automatically publish a public release.

## Important preview limits

- Semantic checks are fallible. Always review claims, quotations, citations, and important arguments yourself.
- Only English text has local proofreading rules. Unicode writing is supported, but local style analysis is not language-specialized.
- AI access requires your own endpoint/account. Live external AI behavior has not been verified with a paid provider in this build.
- These are development packages. The release notes distinguish packaging checks from actual macOS/Windows installation and runtime tests.
