import { describe, expect, it } from 'vitest';
import { analyzeSamples, compareStyle, createProfile, defaultPreferences, recordFeedback, trainProfile } from './style.mjs';

const sampleTexts = [
  'I think this lesson helped me understand business. For example, clear decisions matter.\n\nI learned from practice.',
  'I think clear decisions matter because people need reasons. For example, we can explain costs.',
  'I think this lesson helped my team. We made clear decisions together.',
  'I learned from practice because it showed me new options. For example, a budget can help.',
  'I think the lesson matters. Clear decisions help us explain what we choose.',
];
const samples = sampleTexts.map((text, i) => ({ id: String(i), name: `Sample ${i + 1}`, category: 'Academic Essays', text, createdAt: '2026-10-24T00:00:00Z' }));

describe('writing profiles', () => {
  it('starts with the required preservation defaults and independent mutable arrays', () => {
    expect(defaultPreferences()).toEqual({ useProfile: true, preserveStyle: true, strength: 85, preserveVocabulary: true, preserveStructure: true, meaningVerification: true, rules: [] });
    const first = createProfile('Academic');
    const second = createProfile('Personal');
    first.preferences.rules.push('Use straightforward English.');
    first.approvedExpressions.push('I think');
    expect(second.preferences.rules).toEqual([]);
    expect(second.approvedExpressions).toEqual([]);
    expect(second.id).not.toBe(first.id);
    expect(second.trainedAt).toBeNull();
  });

  it('requires five nonempty samples, while allowing more than ten', () => {
    const profile = createProfile('Academic');
    expect(() => trainProfile({ ...profile, samples: [...samples.slice(0, 4), { text: '   ' }] })).toThrow(/at least 5/);
    const trained = trainProfile({ ...profile, samples });
    expect(trained.trainedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(trained.metrics.sampleCount).toBe(5);
    expect(trainProfile({ ...profile, samples: [...samples, ...samples, ...samples] }).metrics.sampleCount).toBe(15);
    expect(profile.trainedAt).toBeNull();
  });

  it('derives actual sentence, paragraph, vocabulary, and expression observations', () => {
    const result = analyzeSamples(samples);
    expect(result.metrics.wordCount).toBeGreaterThan(60);
    expect(result.metrics.paragraphCount).toBe(6);
    expect(result.metrics.averageSentenceLength).toBeGreaterThan(2);
    expect(result.metrics.frequentWords.some(({ word }) => word === 'lesson')).toBe(true);
    expect(result.metrics.transitions.find(({ phrase }) => phrase === 'for example')?.count).toBe(3);
    expect(result.metrics.commonExpressions.some(({ phrase }) => phrase.includes('clear decisions'))).toBe(true);
    expect(result.characteristics.vocabulary).toContain('cannot be assumed');
    expect(result.characteristics.grammar).toContain('correct clear spelling and grammar errors');
    expect(Object.values(result.characteristics)).toHaveLength(9);
    expect(Object.values(result.characteristics).every(value => typeof value === 'string' && value.length > 0)).toBe(true);
  });

  it('provides descriptive comparisons with no authenticity score', () => {
    const profile = createProfile('Academic');
    expect(compareStyle('Hello.', profile)[0]).toMatch(/Train this profile/);
    const trained = trainProfile({ ...profile, samples });
    expect(compareStyle('', trained)[0]).toMatch(/Add text/);
    const comparison = compareStyle('I think this lesson helped me.', trained);
    expect(comparison.some(line => line.startsWith('Average sentence length:'))).toBe(true);
    expect(comparison.at(-1)).toMatch(/not a score of authenticity/);
  });

  it('records feedback without learning unless permission is explicitly true', () => {
    const profile = trainProfile({ ...createProfile('Academic'), samples });
    const feedback = { kind: 'This sounds like me', original: 'My idea.', suggested: 'A generated alternative.', expression: 'I think', learn: false };
    const updated = recordFeedback(profile, feedback);
    expect(updated.feedback).toHaveLength(1);
    expect(updated.approvedExpressions).toEqual([]);
    expect(updated.characteristics).toEqual(profile.characteristics);
    expect(updated.preferences).toEqual(profile.preferences);
    expect(updated.samples).toEqual(samples);
    expect(profile.feedback).toEqual([]);
    expect(recordFeedback(profile, { ...feedback, learn: 'true' }).approvedExpressions).toEqual([]);
  });

  it('applies approved expressions or feedback rules only after consent without adding training text', () => {
    const profile = { ...createProfile('Academic'), samples };
    const liked = recordFeedback(profile, { kind: 'sounds_like_me', original: 'Old.', suggested: 'I think this matters.', learn: true });
    expect(liked.approvedExpressions).toEqual(['I think this matters.']);
    const disliked = recordFeedback(profile, { kind: 'does_not_sound_like_me', original: 'Old.', suggested: 'A profound realization.', learn: true });
    expect(disliked.preferences.rules[0]).toContain('Avoid wording like');
    const original = recordFeedback(profile, { kind: 'I prefer the original', original: 'My sentence.', suggested: 'New sentence.', learn: true });
    expect(original.preferences.rules[0]).toContain('My sentence.');
    const expression = recordFeedback(profile, { kind: 'Save this expression', expression: 'clear decisions', learn: true });
    expect(expression.approvedExpressions).toEqual(['clear decisions']);
    for (const updated of [liked, disliked, original, expression]) expect(updated.samples).toEqual(samples);
  });
});
