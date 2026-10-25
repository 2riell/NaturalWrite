/** Local observations are descriptive heuristics, not a model of authorship. */
const STOP_WORDS = new Set('a an and are as at be been being but by can could did do does for from had has have he her here him his how i if in into is it its me might more most my no not of on one or our out she should so some than that the their them there these they this those to too up us was we were what when where which who will with would you your'.split(' '));
const TRANSITIONS = ['for example', 'in addition', 'as a result', 'on the other hand', 'in conclusion', 'however', 'therefore', 'because', 'although', 'also', 'finally', 'first', 'then', 'overall'];
export const PROFILE_CATEGORIES = ['Academic Essays', 'Learning Journals', 'Personal Reflections', 'Research Writing', 'Casual Messages', 'Custom Writing Style'];
const mean = (values) => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
const rounded = (n) => Math.round(n * 10) / 10;
export const wordsOf = (text) => String(text ?? '').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? [];
const sentencesOf = (text) => String(text).match(/[^.!?]+(?:[.!?]+["”']?|$)/g)?.map(s => s.trim()).filter(s => wordsOf(s).length) ?? [];
const paragraphsOf = (text) => String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
function counts(items) {
  const count = new Map();
  for (const item of items) count.set(item, (count.get(item) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function repeatedPhrases(samples) {
  const perSample = samples.map(sample => {
    const words = wordsOf(sample.text).map(w => w.toLowerCase());
    const phrases = new Set();
    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i <= words.length - size; i += 1) {
        const part = words.slice(i, i + size);
        if (part.some(w => !STOP_WORDS.has(w))) phrases.add(part.join(' '));
      }
    }
    return phrases;
  });
  const candidates = counts(perSample.flatMap(s => [...s])).filter(([, n]) => n >= 2);
  return candidates.filter(([phrase, count]) => !candidates.some(([other, otherCount]) => other !== phrase && other.includes(phrase) && otherCount >= count)).slice(0, 8).map(([phrase, sampleCount]) => ({ phrase, sampleCount }));
}

export function defaultPreferences() {
  return { useProfile: true, preserveStyle: true, strength: 85, preserveVocabulary: true, preserveStructure: true, meaningVerification: true, rules: [] };
}

export function createProfile(name, category = 'Academic Essays') {
  return {
    id: crypto.randomUUID(), name: String(name ?? '').trim() || 'My writing style', category,
    samples: [], trainedAt: null, metrics: null,
    characteristics: { summary: '', vocabulary: '', sentenceStructure: '', grammar: '', expressions: '', paragraphOrganization: '', formality: '', tone: '', examples: '' },
    preferences: defaultPreferences(), approvedExpressions: [], feedback: [],
  };
}

export function analyzeSamples(samples) {
  const valid = samples.filter(s => typeof s.text === 'string' && s.text.trim());
  if (!valid.length) throw new Error('Add writing samples before analyzing your style.');
  const text = valid.map(s => s.text).join('\n\n');
  const words = wordsOf(text);
  const lower = words.map(w => w.toLowerCase());
  const sentences = valid.flatMap(s => sentencesOf(s.text));
  const paragraphs = valid.flatMap(s => paragraphsOf(s.text));
  const averageSentenceLength = rounded(mean(sentences.map(s => wordsOf(s).length)));
  const averageParagraphLength = rounded(mean(paragraphs.map(p => wordsOf(p).length)));
  const frequentWords = counts(lower.filter(w => !STOP_WORDS.has(w))).slice(0, 12).map(([word, count]) => ({ word, count }));
  const sentenceOpenings = counts(sentences.map(s => wordsOf(s).slice(0, 2).join(' ').toLowerCase())).slice(0, 5).map(([phrase, count]) => ({ phrase, count }));
  const transitions = TRANSITIONS.map(phrase => ({ phrase, count: (text.match(new RegExp(`\\b${phrase}\\b`, 'gi')) ?? []).length })).filter(p => p.count).sort((a, b) => b.count - a.count);
  const commonExpressions = repeatedPhrases(valid);
  const punctuation = {
    commas: (text.match(/,/g) ?? []).length, semicolons: (text.match(/;/g) ?? []).length,
    colons: (text.match(/:/g) ?? []).length, dashes: (text.match(/[—–]/g) ?? []).length,
    exclamations: (text.match(/!/g) ?? []).length, questions: (text.match(/\?/g) ?? []).length,
  };
  const complexSentenceRatio = rounded(100 * sentences.filter(s => /\b(because|although|while|whereas|unless|which|who|that|since|if)\b/i.test(s)).length / Math.max(sentences.length, 1));
  const personalPronounRate = rounded(100 * lower.filter(w => /^(i|me|my|mine|we|us|our|ours)$/.test(w)).length / Math.max(words.length, 1));
  const longWordRatio = rounded(100 * words.filter(w => w.length >= 8).length / Math.max(words.length, 1));
  const vocabularyDiversity = rounded(100 * new Set(lower).size / Math.max(lower.length, 1));
  const contractions = words.filter(w => /['’]/.test(w)).length;
  const metrics = { sampleCount: valid.length, wordCount: words.length, sentenceCount: sentences.length, paragraphCount: paragraphs.length, averageSentenceLength, averageParagraphLength, vocabularyDiversity, complexSentenceRatio, personalPronounRate, longWordRatio, contractions, punctuation, frequentWords, sentenceOpenings, transitions, commonExpressions };
  const vocabularyList = frequentWords.map(w => w.word).join(', ') || 'No recurring vocabulary yet';
  const endingPhrases = counts(paragraphs.map(p => sentencesOf(p).at(-1)).filter(Boolean).map(s => wordsOf(s).slice(0, 3).join(' ').toLowerCase())).slice(0, 3).map(([p]) => p).join('; ');
  return {
    metrics,
    characteristics: {
      summary: `Based on ${valid.length} samples (${words.length} words), sentences average ${averageSentenceLength} words and paragraphs average ${averageParagraphLength} words. These local observations are approximate; edit them to describe your actual preferences.`,
      vocabulary: `Observed words: ${vocabularyList}. ${longWordRatio}% of words have 8 or more characters (a rough length measure, not reading level). Words absent from these samples cannot be assumed to be words you avoid.`,
      sentenceStructure: `Average ${averageSentenceLength} words per sentence. About ${complexSentenceRatio}% contain a common subordinate connector. Frequent openings: ${sentenceOpenings.map(o => `“${o.phrase}”`).join(', ')}. Keep sentence structure when it is clear.`,
      grammar: `Observed punctuation: ${Object.entries(punctuation).map(([name, n]) => `${n} ${name}`).join(', ')}. ${contractions} contractions or possessive forms. Treat punctuation patterns as preferences only when intentional; correct clear spelling and grammar errors.`,
      expressions: commonExpressions.length ? `Repeated across samples: ${commonExpressions.map(p => `“${p.phrase}” (${p.sampleCount} samples)`).join('; ')}. Confirm expressions before treating them as preferences.` : 'No repeated multiword expressions were found across different samples. Add your preferred expressions manually.',
      paragraphOrganization: `Average ${averageParagraphLength} words per paragraph. Common final-sentence openings: ${endingPhrases || 'not enough text'}. Retain paragraph order and organization unless I request a change.`,
      formality: personalPronounRate > 3 || contractions > words.length / 100 ? 'The samples include personal or conversational signals. Keep familiar language; this is an editable estimate, not a definitive formality rating.' : 'The samples use relatively few personal or conversational signals. Keep clear, measured language; this is an editable estimate, not a definitive formality rating.',
      tone: `First-person pronouns account for ${personalPronounRate}% of words. ${personalPronounRate > 2 ? 'Personal perspective appears regularly.' : 'An impersonal explanatory voice appears more often.'} Preserve opinions and do not add claims. Transitions observed: ${transitions.map(t => t.phrase).join(', ') || 'none of the common phrases checked'}.`,
      examples: sentences.slice(0, 3).map(s => s.slice(0, 350)).join('\n\n'),
    },
  };
}

export function trainProfile(profile) {
  const usable = profile.samples.filter(s => typeof s.text === 'string' && s.text.trim());
  if (usable.length < 5) throw new Error('Add at least 5 of your own writing samples before training. You can add more than 10.');
  const result = analyzeSamples(usable);
  return { ...profile, ...result, trainedAt: new Date().toISOString() };
}

export function compareStyle(text, profile) {
  if (!profile.trainedAt || !profile.metrics) return ['Train this profile with at least 5 samples to compare your writing.'];
  if (!String(text).trim()) return ['Add text to the editor to compare it with your writing profile.'];
  const { metrics: current } = analyzeSamples([{ text }]);
  const trained = profile.metrics;
  const lines = [];
  const compare = (label, now, before, unit = '') => {
    if (!Number.isFinite(before)) return;
    const difference = rounded(now - before);
    lines.push(`${label}: ${now}${unit}, compared with ${before}${unit} in your samples${Math.abs(difference) < 0.1 ? ' (similar)' : ` (${Math.abs(difference)}${unit} ${difference > 0 ? 'higher' : 'lower'})`}.`);
  };
  compare('Average sentence length', current.averageSentenceLength, trained.averageSentenceLength, ' words');
  compare('Average paragraph length', current.averageParagraphLength, trained.averageParagraphLength, ' words');
  compare('First-person language', current.personalPronounRate, trained.personalPronounRate, '%');
  compare('Words of 8 or more characters', current.longWordRatio, trained.longWordRatio, '%');
  const familiar = new Set((trained.frequentWords ?? []).map(w => w.word));
  const recurring = current.frequentWords.filter(w => familiar.has(w.word)).map(w => w.word);
  lines.push(recurring.length ? `Shared frequent vocabulary: ${recurring.join(', ')}.` : 'The frequent vocabulary differs from your samples; this can reflect a different topic.');
  lines.push('These are approximate descriptive comparisons, not a score of authenticity or quality.');
  return lines;
}

export function recordFeedback(profile, feedback) {
  const entry = { ...feedback, id: feedback.id || crypto.randomUUID(), learn: feedback.learn === true, createdAt: feedback.createdAt || new Date().toISOString() };
  const next = { ...profile, feedback: [...profile.feedback, entry], approvedExpressions: [...profile.approvedExpressions], preferences: { ...profile.preferences, rules: [...profile.preferences.rules] } };
  if (!entry.learn) return next;
  const expression = typeof entry.expression === 'string' ? entry.expression.trim() : '';
  if (expression && !next.approvedExpressions.includes(expression)) next.approvedExpressions.push(expression);
  const kind = String(entry.kind).toLowerCase().replace(/[-_]+/g, ' ');
  if (!expression && kind.includes('original') && entry.original?.trim()) {
    const rule = `Prefer my original wording “${entry.original.trim()}” over “${String(entry.suggested ?? '').trim()}” in this context.`;
    if (!next.preferences.rules.includes(rule)) next.preferences.rules.push(rule);
  } else if (!expression && (kind.includes('not sound') || kind.includes('doesn’t') || kind.includes('does not') || kind.includes('dislike')) && entry.suggested?.trim()) {
    const rule = `Avoid wording like “${entry.suggested.trim()}”; it does not sound like me in this context.`;
    if (!next.preferences.rules.includes(rule)) next.preferences.rules.push(rule);
  } else if (!expression && (kind.includes('sounds like') || kind.includes('sounds_like') || kind === 'like') && entry.suggested?.trim()) {
    next.approvedExpressions.push(entry.suggested.trim());
    next.approvedExpressions = [...new Set(next.approvedExpressions)];
  }
  return next;
}
