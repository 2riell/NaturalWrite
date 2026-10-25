import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createStore } = require('./storage.cjs');

function profile(id = 'one') {
  return {
    id, name: `Profile ${id}`, category: 'Academic Essays', trainedAt: null,
    characteristics: Object.fromEntries(['summary', 'vocabulary', 'sentenceStructure', 'grammar', 'expressions', 'paragraphOrganization', 'formality', 'tone', 'examples'].map(key => [key, ''])),
    metrics: null,
    preferences: { useProfile: true, preserveStyle: true, strength: 85, preserveVocabulary: true, preserveStructure: true, meaningVerification: true, rules: [] },
    approvedExpressions: [], samples: [], feedback: [],
  };
}
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'naturalwrite-store-'));

describe('SQLite persistence', () => {
  it('persists profiles, samples, feedback, preferences, active selection, and final documents across restart', async () => {
    const directory = temp();
    let store = await createStore({ directory, initialProfile: profile() });
    try {
      const second = profile('two');
      second.samples.push({ id: 'sample-1', name: 'My essay', category: 'Academic Essays', text: 'My own writing sample.', createdAt: '2026-10-24T00:00:00Z' });
      second.preferences.rules.push('Keep my personal opinions.');
      second.feedback.push({ id: 'feedback-1', kind: 'This sounds like me.', original: 'teh', suggested: 'the', learn: false, createdAt: '2026-10-24T00:00:00Z' });
      store.saveProfile(second);
      store.setActiveProfile('two');
      const saved = store.saveDocument({ id: 'draft-1', title: 'A reflection', text: 'My final accepted text.', updatedAt: '' });
      store.close();
      store = await createStore({ directory });
      const loaded = store.load();
      expect(loaded.profiles).toHaveLength(2);
      expect(loaded.activeProfileId).toBe('two');
      expect(loaded.profiles[1]).toEqual(second);
      expect(loaded.documents).toEqual([saved]);
      expect(fs.readFileSync(store.filename).subarray(0, 15).toString()).toBe('SQLite format 3');
    } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('isolates sample IDs and cascades only the deleted profile', async () => {
    const directory = temp();
    const store = await createStore({ directory, initialProfile: profile() });
    try {
      for (const id of ['one', 'two']) {
        const value = profile(id);
        value.samples = [{ id: 'shared-id', name: id, category: 'Academic Essays', text: `Sample for ${id}.`, createdAt: new Date().toISOString() }];
        store.saveProfile(value);
      }
      store.setActiveProfile('one');
      store.deleteProfile('one');
      expect(store.load().activeProfileId).toBe('two');
      expect(store.getProfile('two').samples[0].text).toBe('Sample for two.');
      expect(() => store.deleteProfile('two')).toThrow(/at least one/);
    } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('rejects invalid mutations without losing an earlier valid record', async () => {
    const directory = temp();
    const store = await createStore({ directory, initialProfile: profile() });
    try {
      const invalid = profile();
      invalid.preferences.strength = 101;
      expect(() => store.saveProfile(invalid)).toThrow(/between 0 and 100/);
      invalid.preferences.strength = 85;
      invalid.samples.push({ id: 'bad', text: '' });
      expect(() => store.saveProfile(invalid)).toThrow();
      expect(store.getProfile('one')).toEqual(profile());
    } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('does not overwrite a corrupt database', async () => {
    const directory = temp();
    const filename = path.join(directory, 'naturalwrite.sqlite');
    const bytes = Buffer.from('not a SQLite database');
    fs.writeFileSync(filename, bytes);
    try {
      await expect(createStore({ directory, initialProfile: profile() })).rejects.toThrow(/not been overwritten/);
      expect(fs.readFileSync(filename)).toEqual(bytes);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
