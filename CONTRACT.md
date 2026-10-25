# Implementation contract
Shared data interfaces are src/types.ts. Core modules are plain ESM .mjs (no Node APIs; browser-compatible). IDs use global crypto.randomUUID().

core/style.mjs exports:
- defaultPreferences() -> new Preferences (useProfile true, preserveStyle true, strength 85, preserveVocabulary true, preserveStructure true, meaningVerification true, rules []).
- createProfile(name, category='Academic Essays') -> Profile.
- analyzeSamples(samples) -> {characteristics, metrics}; local heuristic analysis, identify limitations honestly.
- trainProfile(profile) -> updated Profile; require >=5 nonempty samples, trainedAt timestamp.
- compareStyle(text, profile) -> string[] human-readable differences, handle untrained.
- recordFeedback(profile, feedback) -> Profile; feedback always recorded, only learn===true changes approvedExpressions/preferences. Never add generated text as samples.

core/revision.mjs exports:
- buildRevisionPrompt({text,profile,instructions}) -> {system,user}; ask provider for JSON {suggestions:[{start,end,original,replacement,reason,kind}]}.
- buildVerificationPrompt({text,suggestions}) -> {system,user}; ask independent call for JSON {findings:[{id,warnings:string[]}]}.
- offlineSuggestions(text, preferences, instructions='') -> Suggestion[]; explicitly limited deterministic proofreading, honors constraints and strength.
- normalizeSuggestions(text, rawSuggestions, preferences, instructions='') -> Suggestion[]; exact offsets, reject wrong anchors/overlaps/invalid outputs, enforce preservation budgets for non-corrections. Add IDs and heuristic warnings.
- verifyMeaning(original,replacement) -> string[]; quote/citation/number/negation and other conservative checks.
- applySuggestions(text, suggestions) -> string; validate anchors and apply descending offsets, reject invalid/overlaps.

desktop/main.cjs starts Electron and imports core/*.mjs dynamically. Desktop IPC methods match src/types.ts. Backend stores structured profiles/documents/provider metadata in SQLite; provider secret OS-safeStorage encrypted separately from data. Renderer can train/update profiles by importing core functions then saveProfile. importSamples returns extracted text samples (dialog selects files). Only explicit revise call sends document/profile to configured AI endpoint. Config default offline. AI separate verifier call; if failed, mark suggestions unverified conspicuously. Do not treat config provider as equivalent to verified AI access.

Renderer UI in src/main.tsx and src/style.css. Build must work loaded via file:// with relative Vite base. Testing browser may inject mock window.naturalwrite. Production should show desktop unavailable notice if API absent, no fake data persistence.

Source /workspace/work/naturalwrite. Avoid modifying unrelated /workspace/2riel.
