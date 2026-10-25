const { MAX_TEXT } = require('./storage.cjs');

function validateProviderConfig(input) {
  if (!input || !['offline', 'openai'].includes(input.provider)) throw new Error('Select a supported revision engine.');
  let url;
  try { url = new URL(input.endpoint); } catch { throw new Error('Enter a valid AI API base URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('AI endpoints require HTTPS, except local models on localhost.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Do not include credentials, query parameters, or fragments in the endpoint URL.');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 200) throw new Error('Enter an AI model name.');
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096)) throw new Error('Invalid API key.');
  return { provider: input.provider, endpoint: url.href.replace(/\/$/, ''), model: input.model.trim() };
}

function parseJSONContent(content) {
  if (typeof content !== 'string' || content.length > 1_000_000) throw new Error('The AI returned an invalid or oversized response.');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { throw new Error('The AI response was not valid JSON. Try again or use local proofreading.'); }
}

async function sendChat(config, apiKey, prompt) {
  const endpoint = config.endpoint.endsWith('/chat/completions') ? config.endpoint : `${config.endpoint}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model: config.model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('The AI request timed out. Your document has not been changed.');
    throw new Error('Could not reach the configured AI endpoint. Check its address and network connection.');
  }
  if (!response.ok) throw new Error(`The AI provider returned HTTP ${response.status}. Check the API key, model, and provider account.`);
  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize > 1_000_000) throw new Error('The AI response was too large.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > 1_000_000) { await reader.cancel(); throw new Error('The AI response was too large.'); }
    chunks.push(Buffer.from(next.value));
  }
  let json;
  try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The AI endpoint did not return a valid chat response.'); }
  return parseJSONContent(json.choices?.[0]?.message?.content);
}

async function reviseDocument({ input, profile, provider, apiKey, core, request = sendChat }) {
  if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > MAX_TEXT) throw new Error('Enter a document with between 1 and 200,000 characters.');
  if (typeof input.instructions !== 'string' || input.instructions.length > 5000) throw new Error('Revision instructions must be at most 5,000 characters.');
  const preferences = { ...profile.preferences, approvedExpressions: profile.approvedExpressions };
  if (provider.provider === 'offline') {
    const suggestions = core.offlineSuggestions(input.text, preferences, input.instructions);
    return {
      suggestions, engine: 'Local proofreading',
      verification: preferences.meaningVerification
        ? 'Local checks only: spelling patterns and basic quote, citation, number, and wording checks. Full semantic review and custom instruction following require an AI provider. Review every suggestion.'
        : 'Meaning checks are turned off. Local proofreading uses limited spelling and wording patterns. Review every suggestion.',
    };
  }
  const raw = await request(provider, apiKey, core.buildRevisionPrompt({ text: input.text, profile, instructions: input.instructions }));
  if (!raw || !Array.isArray(raw.suggestions) || raw.suggestions.length > 500) throw new Error('The AI returned an invalid suggestions list. Your document has not been changed.');
  const suggestions = core.normalizeSuggestions(input.text, raw.suggestions, preferences, input.instructions);
  let verification;
  if (!preferences.meaningVerification) {
    verification = 'Meaning review is turned off. Review every change against the original before accepting it.';
    for (const item of suggestions) item.warnings = [...new Set([...(item.warnings || []), 'Independent meaning review is turned off.'])];
  } else if (!suggestions.length) {
    verification = 'No eligible changes were returned; there is no revised text to verify.';
  } else {
    try {
      const review = await request(provider, apiKey, core.buildVerificationPrompt({ text: input.text, suggestions }));
      if (!review || !Array.isArray(review.findings)) throw new Error('Invalid verification result.');
      const findings = new Map();
      for (const item of review.findings) {
        if (!item || typeof item.id !== 'string' || !Array.isArray(item.warnings) || !item.warnings.every(warning => typeof warning === 'string' && warning.length <= 3000) || item.warnings.length > 30 || findings.has(item.id)) throw new Error('Invalid verification finding.');
        findings.set(item.id, item.warnings);
      }
      let incomplete = false;
      for (const item of suggestions) {
        const warnings = findings.get(item.id);
        if (!warnings) incomplete = true;
        item.warnings = [...new Set([...(item.warnings || []), ...(warnings || ['Independent meaning review did not check this change.'])])];
      }
      verification = incomplete
        ? 'The independent AI review was incomplete. Unchecked changes are marked; review the original wording carefully.'
        : 'A separate AI review checked proposed changes for meaning, claims, opinions, quotes, and citations. This review can miss errors; you decide which changes to accept.';
    } catch {
      for (const item of suggestions) item.warnings = [...new Set([...(item.warnings || []), 'Independent meaning review failed. This suggestion has only basic local checks.'])];
      verification = 'Independent AI meaning review failed. Suggestions remain unverified and require your careful review; the original document is unchanged.';
    }
  }
  return { suggestions, engine: `AI · ${provider.model}`, verification };
}

module.exports = { validateProviderConfig, parseJSONContent, sendChat, reviseDocument };
