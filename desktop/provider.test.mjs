import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateProviderConfig, parseJSONContent, reviseDocument } = require('./provider.cjs');

const profile = { preferences: { strength: 85, meaningVerification: true }, approvedExpressions: [], trainedAt: null };
const input = { text: 'teh example', profileId: 'one', instructions: '' };
const provider = { provider: 'openai', endpoint: 'https://example.com/v1', model: 'sample' };
const suggestion = { id: 'one', start: 0, end: 3, original: 'teh', replacement: 'the', reason: 'Spelling', kind: 'correction', warnings: [] };
const core = {
  offlineSuggestions: () => [structuredClone(suggestion)],
  buildRevisionPrompt: () => ({ system: 'revise', user: 'document' }),
  buildVerificationPrompt: () => ({ system: 'verify', user: 'changes' }),
  normalizeSuggestions: () => [structuredClone(suggestion)],
};

describe('AI provider boundary', () => {
  it('accepts HTTPS and localhost but rejects remote HTTP and embedded credentials', () => {
    expect(validateProviderConfig({ ...provider, endpoint: 'http://127.0.0.1:1234/v1' }).endpoint).toBe('http://127.0.0.1:1234/v1');
    expect(() => validateProviderConfig({ ...provider, endpoint: 'http://example.com/v1' })).toThrow(/HTTPS/);
    expect(() => validateProviderConfig({ ...provider, endpoint: 'https://secret@example.com' })).toThrow(/credentials/);
    expect(() => validateProviderConfig({ ...provider, endpoint: 'https://example.com?key=secret' })).toThrow(/query/);
  });
  it('accepts fenced JSON and fails on malformed output', () => {
    expect(parseJSONContent('```json\n{"suggestions":[]}\n```')).toEqual({ suggestions: [] });
    expect(() => parseJSONContent('I think this is fine')).toThrow(/valid JSON/);
  });
  it('never calls the external provider in local proofreading mode', async () => {
    const request = vi.fn();
    const result = await reviseDocument({ input, profile, provider: { ...provider, provider: 'offline' }, core, request });
    expect(request).not.toHaveBeenCalled();
    expect(result.engine).toBe('Local proofreading');
    expect(result.verification).toMatch(/Local checks only/);
  });
  it('performs a separate independent verification request and merges its warnings', async () => {
    const request = vi.fn().mockResolvedValueOnce({ suggestions: [suggestion] }).mockResolvedValueOnce({ findings: [{ id: 'one', warnings: ['Potential context change.'] }] });
    const result = await reviseDocument({ input, profile, provider, core, request });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][2].system).toBe('revise');
    expect(request.mock.calls[1][2].system).toBe('verify');
    expect(result.suggestions[0].warnings).toContain('Potential context change.');
  });
  it('flags all suggestions if independent meaning verification fails', async () => {
    const request = vi.fn().mockResolvedValueOnce({ suggestions: [suggestion] }).mockRejectedValueOnce(new Error('network failed'));
    const result = await reviseDocument({ input, profile, provider, core, request });
    expect(result.verification).toMatch(/failed/);
    expect(result.suggestions[0].warnings.join(' ')).toMatch(/only basic local checks/);
  });
  it('never treats missing verification findings as cleared', async () => {
    const request = vi.fn().mockResolvedValueOnce({ suggestions: [suggestion] }).mockResolvedValueOnce({ findings: [] });
    const result = await reviseDocument({ input, profile, provider, core, request });
    expect(result.verification).toMatch(/incomplete/);
    expect(result.suggestions[0].warnings.join(' ')).toMatch(/did not check/);
  });
  it('discloses disabled independent review on individual suggestions', async () => {
    const request = vi.fn().mockResolvedValueOnce({ suggestions: [suggestion] });
    const result = await reviseDocument({ input, profile: { ...profile, preferences: { ...profile.preferences, meaningVerification: false } }, provider, core, request });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.suggestions[0].warnings.join(' ')).toMatch(/turned off/);
  });
});
