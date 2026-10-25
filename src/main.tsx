import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Leaf, PenLine, BookOpen, UsersRound, SlidersHorizontal, ShieldCheck, Sparkles, Plus, Upload, FileText, Check, X, Trash2, Download, Save, LockKeyhole, FolderOpen, RefreshCw, AlertCircle } from 'lucide-react';
import { createProfile, trainProfile, compareStyle, recordFeedback, PROFILE_CATEGORIES, wordsOf } from '../core/style.mjs';
import { applySuggestions } from '../core/revision.mjs';
import type { AppState, Profile, Document, Preferences, Characteristics, Suggestion, RevisionResult, ProviderConfig, Sample } from './types';
import './style.css';

type Page = 'editor' | 'training' | 'profiles' | 'settings';
type Decision = 'accepted' | 'rejected';
type Notice = { text: string; error?: boolean } | null;
const api = window.naturalwrite;
const now = () => new Date().toISOString();
const newDocument = (): Document => ({ id: crypto.randomUUID(), title: 'Untitled document', text: '', updatedAt: now() });
const categories = PROFILE_CATEGORIES as string[];
const labels: Record<keyof Characteristics, string> = { summary: 'Writing style summary', vocabulary: 'Vocabulary preferences', sentenceStructure: 'Sentence structure', grammar: 'Grammar preferences', expressions: 'Common expressions', paragraphOrganization: 'Paragraph organization', formality: 'Formality level', tone: 'Tone and voice', examples: 'Writing examples' };
const errorText = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error);
const level = (n: number) => n <= 20 ? 'Flexible editing' : n <= 40 ? 'Moderate preservation' : n <= 60 ? 'Balanced preservation' : n <= 80 ? 'Strong preservation' : 'Maximum preservation';

function Toggle({ label, description, value, onChange, disabled }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="switch-row"><div className="toggle-copy"><strong>{label}</strong>{description && <small>{description}</small>}</div><button type="button" role="switch" aria-label={label} aria-checked={value} disabled={disabled} className={`switch ${value ? 'active' : ''}`} onClick={() => onChange(!value)} /></div>;
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState<Page>('editor');
  const [doc, setDoc] = useState<Document | null>(null);
  const [savedText, setSavedText] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [instructions, setInstructions] = useState('');
  const [revision, setRevision] = useState<RevisionResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [comparison, setComparison] = useState<string[] | null>(null);
  const [modal, setModal] = useState<{ kind: 'newProfile' | 'renameProfile' | 'deleteProfile' | 'deleteDocument'; profile?: Profile } | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileCategory, setProfileCategory] = useState(categories[0]);
  const [reviewVersion, setReviewVersion] = useState(0);
  const latestReviewVersion = useRef(0);
  const latestDoc = useRef<Document | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deletingDocuments = useRef(new Set<string>());
  const profile = state?.profiles.find(p => p.id === state.activeProfileId) ?? state?.profiles[0];
  const stateRef = useRef(state);
  stateRef.current = state;
  latestDoc.current = doc;

  const flash = (text: string, error = false) => setNotice({ text, error });
  const invalidate = () => { latestReviewVersion.current += 1; setReviewVersion(latestReviewVersion.current); setRevision(null); setDecisions({}); setComparison(null); };
  const work = async (name: string, fn: () => Promise<void>, success?: string) => {
    setBusy(name);
    try { await fn(); if (success) flash(success); }
    catch (error) { flash(errorText(error), true); }
    finally { setBusy(''); }
  };
  useEffect(() => {
    if (!api) return;
    api.load().then(async initial => {
      if (!initial.documents.length) initial.documents = [await api.saveDocument(newDocument())];
      setState(initial); setDoc(initial.documents[0]); setSavedText(JSON.stringify([initial.documents[0].title, initial.documents[0].text]));
    }).catch(error => setLoadError(errorText(error)));
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), notice.error ? 12000 : 5000); return () => clearTimeout(timer); }, [notice]);

  async function saveDoc(value = latestDoc.current) {
    if (!value || deletingDocuments.current.has(value.id)) return;
    const normalized = { ...value, title: value.title.trim() || 'Untitled document' };
    const nextSave = saving.current.catch(() => {}).then(() => api.saveDocument(normalized));
    saving.current = nextSave;
    const saved = await nextSave as Document;
    setState(previous => previous ? { ...previous, documents: previous.documents.some(d => d.id === saved.id) ? previous.documents.map(d => d.id === saved.id ? saved : d) : [...previous.documents, saved] } : previous);
    if (latestDoc.current?.id === saved.id && latestDoc.current.text === value.text && latestDoc.current.title === value.title) setSavedText(JSON.stringify([value.title, value.text]));
  }
  useEffect(() => {
    if (!doc || JSON.stringify([doc.title, doc.text]) === savedText) return;
    autoSaveTimer.current = setTimeout(() => { void saveDoc(doc).catch(error => flash(`Your document could not be saved: ${errorText(error)}`, true)); }, 700);
    return () => clearTimeout(autoSaveTimer.current);
  }, [doc?.id, doc?.title, doc?.text, savedText]);
  useEffect(() => {
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      const current = latestDoc.current;
      if (!current || deletingDocuments.current.has(current.id) || JSON.stringify([current.title, current.text]) === savedText) return;
      event.preventDefault();
      event.returnValue = '';
      clearTimeout(autoSaveTimer.current);
      flash('Saving your latest writing before you leave…');
      void saveDoc(current).then(() => flash('Your writing is saved. You can close NaturalWrite now.')).catch(error => flash(`Keep this window open: ${errorText(error)}`, true));
    };
    window.addEventListener('beforeunload', protectUnsaved);
    return () => window.removeEventListener('beforeunload', protectUnsaved);
  }, [savedText]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void work('Saving', () => saveDoc(), 'Saved on this device.'); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);

  async function saveProfile(value: Profile, clearReview = true) {
    const saved = await api.saveProfile(value);
    setState(previous => previous ? { ...previous, profiles: previous.profiles.some(p => p.id === saved.id) ? previous.profiles.map(p => p.id === saved.id ? saved : p) : [...previous.profiles, saved] } : previous);
    if (clearReview) invalidate();
    return saved;
  }
  async function selectProfile(id: string) {
    await api.setActiveProfile(id); setState(previous => previous ? { ...previous, activeProfileId: id } : previous); invalidate();
  }
  function changeDoc(patch: Partial<Document>) { if (!doc) return; setDoc({ ...doc, ...patch }); invalidate(); }
  async function selectDocument(id: string) { clearTimeout(autoSaveTimer.current); await saveDoc(); const next = stateRef.current?.documents.find(d => d.id === id); if (next) { setDoc(next); setSavedText(JSON.stringify([next.title, next.text])); invalidate(); } }
  async function addDocument() { clearTimeout(autoSaveTimer.current); await saveDoc(); const next = newDocument(); await saveDoc(next); setDoc(next); setSavedText(JSON.stringify([next.title, next.text])); invalidate(); }
  async function revise() {
    if (!doc || !profile) return;
    const version = latestReviewVersion.current;
    const snapshot = { text: doc.text, profileId: profile.id, instructions };
    await saveDoc(doc);
    if (version !== latestReviewVersion.current) { flash('Your document or preferences changed. Request suggestions again.'); return; }
    const result = await api.revise(snapshot);
    if (version !== latestReviewVersion.current) { flash('Your document or preferences changed. Request suggestions again.'); return; }
    setRevision(result); setDecisions({});
  }
  async function applyAccepted() {
    if (!doc || !revision) return;
    clearTimeout(autoSaveTimer.current);
    const accepted = revision.suggestions.filter(s => decisions[s.id] === 'accepted');
    const updated = { ...doc, text: applySuggestions(doc.text, accepted), updatedAt: now() };
    await saveDoc(updated); setDoc(updated); setSavedText(JSON.stringify([updated.title, updated.text])); invalidate(); flash(`${accepted.length} accepted ${accepted.length === 1 ? 'change' : 'changes'} applied and saved.`);
  }
  function openNewProfile() { setProfileName(''); setProfileCategory(categories[0]); setModal({ kind: 'newProfile' }); }
  async function completeModal() {
    if (!modal || !state) return;
    if (modal.kind === 'newProfile') { const created = await saveProfile(createProfile(profileName, profileCategory) as Profile); await selectProfile(created.id); }
    if (modal.kind === 'renameProfile' && modal.profile) await saveProfile({ ...modal.profile, name: profileName.trim(), category: profileCategory });
    if (modal.kind === 'deleteProfile' && modal.profile) { await api.deleteProfile(modal.profile.id); const next = await api.load(); setState(next); invalidate(); }
    if (modal.kind === 'deleteDocument' && doc) {
      clearTimeout(autoSaveTimer.current);
      deletingDocuments.current.add(doc.id);
      await saving.current.catch(() => {});
      try { await api.deleteDocument(doc.id); }
      catch (error) { deletingDocuments.current.delete(doc.id); throw error; }
      const remaining = state.documents.filter(d => d.id !== doc.id);
      if (!remaining.length) remaining.push(await api.saveDocument(newDocument()));
      setState(previous => previous ? { ...previous, documents: remaining } : previous);
      setDoc(remaining[0]); setSavedText(JSON.stringify([remaining[0].title, remaining[0].text])); invalidate();
    }
    setModal(null);
  }

  if (!api) return <div className="loading-screen"><Leaf size={46} /><h1>NaturalWrite</h1><p>This is the desktop application. Open the installed NaturalWrite app on your Mac or Windows computer to use local profiles and documents.</p></div>;
  if (loadError) return <div className="loading-screen"><AlertCircle size={40} /><h1>We couldn’t open your writing</h1><p>{loadError}</p><button className="button" onClick={() => location.reload()}>Try again</button></div>;
  if (!state || !profile || !doc) return <div className="loading-screen"><Leaf size={46} /><h1>NaturalWrite</h1><p>Opening your personal writing studio…</p></div>;

  const isSaved = JSON.stringify([doc.title, doc.text]) === savedText;
  const editorLocked = ['Applying changes', 'Opening document', 'Creating document', 'Updating workspace'].includes(busy);
  const titles = { editor: ['YOUR PERSONAL WRITING STUDIO', 'Your words. Your voice.', 'Make your writing clearer while keeping what makes it yours.'], training: ['PERSONALIZATION', 'Train my writing style', 'A collection of your own writing is the starting point for a more personal edit.'], profiles: ['YOUR WRITING IDENTITIES', 'A voice for every purpose.', 'Keep distinct preferences for essays, reflections, research, and everyday writing.'], settings: ['MAKE YOURSELF AT HOME', 'Your studio, your settings.', 'Choose how NaturalWrite helps, and stay in control of your writing.'] };
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Leaf /></div><div><div className="brand-name">NaturalWrite</div><div className="brand-caption">Stay true to your voice</div></div></div>
      <nav className="nav" aria-label="Main navigation">{([['editor', PenLine, 'Writing editor'], ['training', BookOpen, 'Train my writing style'], ['profiles', UsersRound, 'Writing profiles'], ['settings', SlidersHorizontal, 'Settings']] as const).map(([id, Icon, name]) => <button className={`nav-button ${page === id ? 'active' : ''}`} key={id} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}><Icon />{name}</button>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><span>ACTIVE WRITING PROFILE</span><strong>{profile.name}</strong><span>{profile.trainedAt ? `${profile.samples.length} writing samples · Trained` : 'Ready for your first samples'}</span></div><div className="privacy-note"><LockKeyhole size={14} /><span>Your documents stay on this device. AI sharing happens only when you request it.</span></div></div>
    </aside>
    <main className="main-area"><header className="page-header"><div><div className="eyebrow">{titles[page][0]}</div><h1 className="page-title">{titles[page][1]}</h1><p className="page-subtitle">{titles[page][2]}</p></div><div className="header-actions">{page === 'editor' ? <button className="button" onClick={() => void work('Exporting', async () => { if (await api.exportDocument({ title: doc.title || 'Untitled', text: doc.text })) flash('Document exported.'); })} disabled={!!busy}><Download />Export</button> : page === 'profiles' ? <button className="button primary" onClick={openNewProfile}><Plus />New profile</button> : <span className="badge"><ShieldCheck /> Local workspace</span>}</div></header>
      {page !== 'settings' && <div className="toolbar"><label className="profile-select">Writing profile <select aria-label="Active writing profile" value={profile.id} disabled={!!busy} onChange={e => void work('Switching profile', () => selectProfile(e.target.value))}>{state.profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><span className={`badge ${profile.trainedAt ? 'success' : ''}`}>{profile.trainedAt ? <Check /> : <Leaf />}{profile.trainedAt ? 'Personal style ready' : 'Not trained yet'}</span></div>}
      {page === 'editor' && <><div className="workspace-grid"><div><section className="panel editor-panel"><div className="document-toolbar"><FileText size={16} /><select className="document-select" aria-label="Current document" value={doc.id} disabled={!!busy} onChange={e => void work('Opening document', () => selectDocument(e.target.value))}>{state.documents.map(d => <option key={d.id} value={d.id}>{d.id === doc.id ? doc.title || 'Untitled document' : d.title}</option>)}</select><button className="icon-button" title="New document" aria-label="New document" disabled={!!busy} onClick={() => void work('Creating document', addDocument)}><Plus /></button><button className="icon-button" title="Delete document" aria-label="Delete document" disabled={!!busy} onClick={() => setModal({ kind: 'deleteDocument' })}><Trash2 /></button><span className="document-toolbar-spacer" /><span className="badge">{state.provider.provider === 'offline' ? 'Offline proofreading' : 'AI revision'}</span></div>
        <input aria-label="Document title" className="title-input" maxLength={300} value={doc.title} disabled={editorLocked} onChange={e => changeDoc({ title: e.target.value })} placeholder="Give your writing a title" />
        <textarea aria-label="Writing editor" className="editor-textarea" maxLength={200000} value={doc.text} disabled={editorLocked} onChange={e => changeDoc({ text: e.target.value })} placeholder={'Every good piece of writing starts with your own words.\n\nWrite here, or paste a draft you’d like to work on…'} spellCheck />
        <div className="editor-footer"><span>{wordsOf(doc.text).length.toLocaleString()} words · {doc.text.length.toLocaleString()} characters</span><span aria-live="polite">{isSaved ? 'Saved on this device' : 'Saving…'}</span><button className="button ghost small" disabled={!!busy} onClick={() => void work('Saving', () => saveDoc(), 'Saved on this device.')}><Save />Save</button></div></section>
        <div className="revision-request"><div className="field"><label htmlFor="instructions">What would you like to improve? <span className="optional-label">Optional</span></label><textarea id="instructions" rows={2} maxLength={4000} value={instructions} onChange={e => { setInstructions(e.target.value); invalidate(); }} placeholder={state.provider.provider === 'offline' ? 'Offline: try Replace "old wording" with "new wording".' : 'For example: improve clarity in the second paragraph.'} /></div><div className="request-actions"><button className="button" onClick={() => setComparison(compareStyle(doc.text, profile))}><UsersRound />Compare with my writing</button><button className="button primary" disabled={!!busy || !doc.text.trim()} onClick={() => void work('Finding suggestions', revise)}><Sparkles />{busy === 'Finding suggestions' ? 'Reviewing your writing…' : 'Suggest improvements'}</button></div><p className="field-hint request-hint">{state.provider.provider === 'offline' ? 'A small set of local spelling and clarity checks. Connect an AI provider in Settings for broader revision.' : `This sends your draft, instructions, and enabled style profile to ${new URL(state.provider.endpoint).hostname}.`} Every change needs your approval.</p></div>
        {comparison && <section className="panel comparison-panel"><div className="panel-heading"><h2>Compare with my writing</h2><button className="icon-button" aria-label="Close style comparison" onClick={() => setComparison(null)}><X /></button></div><div className="panel-body"><ul className="comparison-list">{comparison.map(line => <li key={line}>{line}</li>)}</ul></div></section>}
        {revision && <section className="review-section" key={reviewVersion} aria-label="Suggested revisions"><h2>A little clearer. Still you.</h2><p className="field-hint">{revision.engine} · {revision.suggestions.length} {revision.suggestions.length === 1 ? 'suggestion' : 'suggestions'}</p><div className="notice"><ShieldCheck /><p>{revision.verification}</p></div>{revision.suggestions.length === 0 ? <div className="empty-state panel"><Check size={30} /><h3>No suggestions from this check</h3><p>Your wording is unchanged. This limited check does not guarantee that the document is free of errors.</p></div> : <><div className="revision-list">{revision.suggestions.map((suggestion, index) => <RevisionCard key={suggestion.id} suggestion={suggestion} index={index} decision={decisions[suggestion.id]} decide={decision => setDecisions(previous => ({ ...previous, [suggestion.id]: decision }))} onFeedback={async feedback => { setBusy('Saving feedback'); try { await saveProfile(recordFeedback(profile, feedback) as Profile, feedback.learn); flash(feedback.learn ? 'Preference saved. Request new suggestions to use your updated profile.' : 'Feedback saved. Your style preferences are unchanged.'); } finally { setBusy(''); } }} busy={!!busy} />)}</div><div className="request-actions"><p className="field-hint">{Object.values(decisions).filter(d => d === 'accepted').length} accepted · {Object.values(decisions).filter(d => d === 'rejected').length} rejected. Unreviewed suggestions stay unchanged.</p><button className="button primary" disabled={!!busy || !Object.values(decisions).includes('accepted')} onClick={() => void work('Applying changes', applyAccepted)}><Check />Apply accepted changes</button></div></>}</section>}
        </div><Preservation profile={profile} disabled={!!busy} onSave={p => void work('Saving preferences', async () => { await saveProfile(p); })} /></div></>}
      {page === 'training' && <Training key={profile.id} profile={profile} busy={!!busy} work={work} saveProfile={saveProfile} flash={flash} />}
      {page === 'profiles' && <><div className="profile-grid">{state.profiles.map(item => <article key={item.id} className={`profile-card ${item.id === profile.id ? 'selected' : ''}`}><div className="eyebrow">{item.category}</div><h2>{item.name}</h2><p>{item.samples.length} samples · {item.trainedAt ? `Trained ${new Date(item.trainedAt).toLocaleDateString()}` : 'Not trained yet'}</p><span className="badge">{level(item.preferences.strength)} · {item.preferences.strength}</span><div className="profile-card-actions"><button className="button small secondary" disabled={!!busy} onClick={() => void work('Switching profile', async () => { await selectProfile(item.id); setPage('training'); })}>{item.id === profile.id ? 'Edit & train' : 'Use profile'}</button><button className="button small" disabled={!!busy} onClick={() => { setProfileName(item.name); setProfileCategory(item.category); setModal({ kind: 'renameProfile', profile: item }); }}>Rename</button><button className="icon-button" aria-label={`Delete ${item.name}`} disabled={!!busy || state.profiles.length === 1} title={state.profiles.length === 1 ? 'Keep at least one writing profile' : 'Delete profile'} onClick={() => setModal({ kind: 'deleteProfile', profile: item })}><Trash2 /></button></div></article>)}</div><div className="notice"><BookOpen /><p>Each profile keeps its own samples, writing characteristics, preservation settings, approved expressions, and feedback. Your documents remain available across profiles.</p></div><CharacteristicsEditor profile={profile} busy={!!busy} onSave={p => work('Saving characteristics', async () => { await saveProfile(p); }, 'Writing characteristics saved.')} /><FeedbackHistory profile={profile} /></>}
      {page === 'settings' && <Settings provider={state.provider} profile={profile} busy={!!busy} work={work} onProvider={provider => setState(previous => previous ? { ...previous, provider } : previous)} onProfile={p => work('Saving preferences', async () => { await saveProfile(p); })} />}
    </main>
    {notice && <div role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'error' : ''}`}>{notice.error ? <AlertCircle size={17} /> : <Check size={17} />}<span>{notice.text}</span><button className="toast-dismiss" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    {modal && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="modal"><h2 id="modal-title">{modal.kind === 'newProfile' ? 'A new writing profile' : modal.kind === 'renameProfile' ? 'Edit profile details' : modal.kind === 'deleteProfile' ? 'Delete this profile?' : 'Delete this document?'}</h2>{modal.kind === 'newProfile' || modal.kind === 'renameProfile' ? <><div className="field"><label htmlFor="profile-name">Profile name</label><input id="profile-name" autoFocus maxLength={120} value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="For example: My learning journals" /></div><div className="field"><label htmlFor="profile-category">Writing category</label><select id="profile-category" value={profileCategory} onChange={e => setProfileCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></div></> : <p>{modal.kind === 'deleteProfile' ? `“${modal.profile?.name}” and its training samples, preferences, and feedback will be permanently removed from this device.` : `“${doc.title || 'Untitled document'}” will be permanently removed from this device.`}</p>}<div className="modal-actions"><button className="button" disabled={!!busy} onClick={() => setModal(null)}>Cancel</button><button className={`button ${modal.kind.startsWith('delete') ? 'danger' : 'primary'}`} disabled={!!busy || (!modal.kind.startsWith('delete') && !profileName.trim())} onClick={() => void work('Updating workspace', completeModal)}>{modal.kind.startsWith('delete') ? 'Delete permanently' : 'Save profile'}</button></div></section></div>}
  </div>;
}

function Preservation({ profile, onSave, disabled }: { profile: Profile; onSave: (p: Profile) => void; disabled: boolean }) {
  const prefs = profile.preferences;
  const [strength, setStrength] = useState(prefs.strength);
  const [rule, setRule] = useState('');
  const [editingRule, setEditingRule] = useState<number | null>(null);
  useEffect(() => setStrength(prefs.strength), [prefs.strength, profile.id]);
  const update = (patch: Partial<Preferences>) => onSave({ ...profile, preferences: { ...prefs, ...patch } });
  const saveStrength = () => { if (strength !== prefs.strength) update({ strength }); };
  const addRule = () => { const value = rule.trim(); if (!value) return; const rules = [...prefs.rules]; if (editingRule === null) rules.push(value); else rules[editingRule] = value; update({ rules }); setRule(''); setEditingRule(null); };
  return <aside className="panel inspector-panel"><div className="panel-heading"><h2><ShieldCheck size={17} /> Writing preferences</h2></div><div className="panel-body"><Toggle label="Preserve my writing style" description="Keep the character of your original draft." value={prefs.preserveStyle} disabled={disabled} onChange={preserveStyle => update({ preserveStyle })} />
    <div className="range-control"><label className="range-label" htmlFor="preservation-strength">Preservation strength <strong>{strength}<small> /100</small></strong></label><input id="preservation-strength" aria-label="Preservation strength" type="range" min="0" max="100" step="1" value={strength} disabled={disabled || !prefs.preserveStyle} onChange={e => setStrength(Number(e.target.value))} onPointerUp={saveStrength} onKeyUp={saveStrength} onBlur={saveStrength} /><p className="preservation-description"><strong>{level(strength)}</strong><br />{strength >= 81 ? 'Focus on necessary corrections and explicitly requested changes.' : strength >= 61 ? 'Prioritize your vocabulary, sentence structure, and organization.' : strength >= 41 ? 'Keep your structure where possible, with moderate improvements.' : strength >= 21 ? 'Keep most writing characteristics while improving readability.' : 'Allow broader wording changes while preserving your meaning.'}</p></div>
    <Toggle label="Preserve my vocabulary" value={prefs.preserveVocabulary} disabled={disabled} onChange={preserveVocabulary => update({ preserveVocabulary })} /><Toggle label="Preserve sentence structure" value={prefs.preserveStructure} disabled={disabled} onChange={preserveStructure => update({ preserveStructure })} /><Toggle label="Meaning preservation check" description="Check for possible changes to your argument." value={prefs.meaningVerification} disabled={disabled} onChange={meaningVerification => update({ meaningVerification })} /><Toggle label="Use my trained writing style" description={profile.trainedAt ? 'Use your selected writing profile.' : 'Add at least 5 samples to train this profile.'} value={prefs.useProfile && !!profile.trainedAt} disabled={disabled || !profile.trainedAt} onChange={useProfile => update({ useProfile })} />
    <h3 className="subheading">Your permanent writing rules</h3><div className="rules-list">{prefs.rules.map((item, index) => <div className="rule-row" key={`${index}-${item}`}><span>{item}</span><button className="icon-button" aria-label={`Edit rule ${index + 1}`} disabled={disabled} onClick={() => { setRule(item); setEditingRule(index); }}><PenLine /></button><button className="icon-button" aria-label={`Remove rule ${index + 1}`} disabled={disabled} onClick={() => update({ rules: prefs.rules.filter((_, i) => i !== index) })}><X /></button></div>)}</div><form className="rule-input" onSubmit={e => { e.preventDefault(); addRule(); }}><input aria-label="Writing rule" placeholder="Use straightforward English…" maxLength={2000} value={rule} onChange={e => setRule(e.target.value)} /><button className="button small" disabled={disabled || !rule.trim() || (editingRule === null && prefs.rules.length >= 100)} aria-label={editingRule === null ? 'Add writing rule' : 'Save writing rule'}>{editingRule === null ? <Plus /> : <Check />}</button></form>{editingRule !== null && <button className="button ghost small" onClick={() => { setRule(''); setEditingRule(null); }}>Cancel edit</button>}<p className="field-hint preference-footnote">Rules guide connected AI revisions. Offline proofreading applies a limited set of supported rules. Changes always require your approval.</p></div></aside>;
}

function RevisionCard({ suggestion, index, decision, decide, onFeedback, busy }: { suggestion: Suggestion; index: number; decision?: Decision; decide: (d: Decision) => void; onFeedback: (feedback: any) => Promise<void>; busy: boolean }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [kind, setKind] = useState('This sounds like me');
  const [learn, setLearn] = useState(false);
  const [expression, setExpression] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async () => { setSending(true); setMessage(''); try { await onFeedback({ id: crypto.randomUUID(), kind, original: suggestion.original, suggested: suggestion.replacement, expression: kind === 'Save this expression as a preference' ? expression.trim() : undefined, learn, createdAt: now() }); setMessage('Feedback saved.'); setFeedbackOpen(false); setLearn(false); } catch (error) { setMessage(errorText(error)); } finally { setSending(false); } };
  return <article className={`revision-card ${decision || ''}`}><div className="revision-header"><strong>{String(index + 1).padStart(2, '0')} · {suggestion.reason}</strong><span className="badge">{decision || suggestion.kind}</span></div><div className="revision-diff"><div className="original"><small>Original wording</small><p>{suggestion.original || '(insertion)'}</p></div><div className="replacement"><small>Suggested wording</small><p>{suggestion.replacement || '(remove this wording)'}</p></div></div>{suggestion.warnings.length > 0 && <ul className="warning-list" aria-label="Potential meaning changes">{suggestion.warnings.map(warning => <li key={warning}>{warning}</li>)}<li>Choose “Keep original” to preserve your wording.</li></ul>}<div className="revision-actions"><button className="button ghost small" onClick={() => setFeedbackOpen(!feedbackOpen)}>Give style feedback</button><button className="button small" onClick={() => decide('rejected')} aria-label={`Keep original suggestion ${index + 1}`}><X />Keep original</button><button className="button small secondary" onClick={() => decide('accepted')} aria-label={`Accept suggestion ${index + 1}`}><Check />Accept suggestion</button></div>{feedbackOpen && <div className="feedback-panel"><h3>Does this sound like you?</h3><div className="feedback-options">{['This sounds like me', 'This does not sound like me', 'I prefer the original', 'Save this expression as a preference'].map(option => <button key={option} className={`button small ${kind === option ? 'selected' : ''}`} onClick={() => setKind(option)}>{option}</button>)}</div>{kind === 'Save this expression as a preference' && <div className="field feedback-expression"><label htmlFor={`expression-${suggestion.id}`}>Expression to remember</label><input id={`expression-${suggestion.id}`} maxLength={2000} value={expression} onChange={e => setExpression(e.target.value)} /></div>}<label className="checkbox-row"><input type="checkbox" checked={learn} onChange={e => setLearn(e.target.checked)} />Update my writing profile with this preference. Generated revisions are never added as training samples.</label><button className="button small" disabled={busy || sending || (kind === 'Save this expression as a preference' && (!expression.trim() || !learn))} onClick={() => void submit()}>{sending ? 'Saving…' : learn ? 'Save feedback & preference' : 'Save feedback only'}</button></div>}{message && <p className="field-hint" role="status">{message}</p>}</article>;
}

type Work = (name: string, fn: () => Promise<void>, success?: string) => Promise<void>;
function Training({ profile, busy, work, saveProfile, flash }: { profile: Profile; busy: boolean; work: Work; saveProfile: (p: Profile, clearReview?: boolean) => Promise<Profile>; flash: (text: string, error?: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(profile.samples[0]?.id ?? null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(profile.category);
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'samples' | 'style'>('samples');
  const [remove, setRemove] = useState<Sample | null>(null);
  const sample = profile.samples.find(s => s.id === selected);
  const changedSamples = (samples: Sample[]) => ({ ...profile, samples, trainedAt: null, metrics: null });
  async function pasteSample() { const sample = { id: crypto.randomUUID(), name: name.trim() || `Writing sample ${profile.samples.length + 1}`, category, text: text.trim(), createdAt: now() }; await saveProfile(changedSamples([...profile.samples, sample])); setSelected(sample.id); setName(''); setText(''); flash('Writing sample added. Train the profile when your collection is ready.'); }
  async function importFiles() { const imported = await api.importSamples(); if (imported.length) { await saveProfile(changedSamples([...profile.samples, ...imported.map(s => ({ ...s, category }))])); setSelected(imported[0].id); flash(`${imported.length} writing ${imported.length === 1 ? 'sample' : 'samples'} imported.`); } }
  return <><div className="tabs"><button className={`tab ${tab === 'samples' ? 'active' : ''}`} onClick={() => setTab('samples')}>Writing samples <span className="sample-count">{profile.samples.length}</span></button><button className={`tab ${tab === 'style' ? 'active' : ''}`} onClick={() => setTab('style')}>My style profile</button></div>{tab === 'samples' ? <><div className="training-intro"><div><h2>Let your writing introduce you.</h2><p className="page-subtitle">Add 5–10 documents you wrote yourself. Essays, reflections, and journals all help; you can add more whenever you like.</p></div><button className="button primary" disabled={busy || profile.samples.length < 5} onClick={() => void work('Training writing style', async () => { await saveProfile(trainProfile(profile) as Profile); setTab('style'); }, 'Your writing profile is ready. You can review and edit every observation.')}><Sparkles />{profile.trainedAt ? 'Retrain my profile' : 'Train my profile'}</button></div><div className="training-layout"><section className="panel sample-library"><div className="panel-heading"><h2>Your sample collection</h2><span className="badge">{profile.samples.length} / 5 minimum</span></div><div className="panel-body"><button className="button secondary full-width" disabled={busy || profile.samples.length >= 200} onClick={() => void work('Importing samples', importFiles)}><Upload />Import documents</button><p className="field-hint import-hint">PDF, DOCX, TXT, Markdown · text PDFs only</p><div className="sample-list">{profile.samples.map(item => <button key={item.id} className={`sample-card ${item.id === selected ? 'selected' : ''}`} onClick={() => setSelected(item.id)}><FileText size={16} /><div className="sample-card-copy"><strong>{item.name}</strong><div className="sample-meta">{item.category}<br />{wordsOf(item.text).length.toLocaleString()} words</div></div></button>)}</div>{!profile.samples.length && <p className="field-hint">Your collection is empty. Import a document or paste your first sample.</p>}<button className="button ghost small" onClick={() => setSelected(null)}><Plus />Paste a new sample</button></div></section><section className="panel sample-editor">{sample ? <><div className="panel-heading"><h2>{sample.name}</h2><button className="icon-button" aria-label="Remove writing sample" disabled={busy} onClick={() => setRemove(sample)}><Trash2 /></button></div><div className="panel-body"><div className="field"><label htmlFor="sample-category">Writing category</label><select id="sample-category" value={sample.category} disabled={busy} onChange={e => void work('Saving category', async () => { await saveProfile(changedSamples(profile.samples.map(s => s.id === sample.id ? { ...s, category: e.target.value } : s))); })}>{categories.map(c => <option key={c}>{c}</option>)}</select></div><pre className="sample-preview">{sample.text}</pre></div></> : <form className="paste-form" onSubmit={e => { e.preventDefault(); void work('Adding sample', pasteSample); }}><h2>Paste something you wrote</h2><p className="field-hint">Use your own original work. AI-generated revisions are not automatically treated as your writing.</p><div className="field"><label htmlFor="sample-name">Sample title</label><input id="sample-name" maxLength={500} placeholder="For example: A reflection on this week’s lesson" value={name} onChange={e => setName(e.target.value)} /></div><div className="field"><label htmlFor="paste-category">Writing category</label><select id="paste-category" value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="sample-text">Your writing sample</label><textarea id="sample-text" maxLength={200000} value={text} onChange={e => setText(e.target.value)} placeholder="Paste your original writing here…" /></div><button className="button primary" disabled={busy || !text.trim() || profile.samples.length >= 200}><Plus />Add writing sample</button></form>}</section></div><div className="notice"><LockKeyhole /><p>Training analyzes your samples locally. Adding, removing, or recategorizing a sample marks this profile as needing retraining. A connected AI provider receives the style summary during a requested revision, not your complete sample library.</p></div></> : <><div className="training-intro"><div><h2>{profile.trainedAt ? 'A portrait of your writing.' : 'Your style, in your own words.'}</h2><p className="page-subtitle">These observations are editable estimates. Refine anything that doesn’t feel like you.</p></div><button className="button" disabled={busy || profile.samples.length < 5} onClick={() => void work('Retraining', async () => { await saveProfile(trainProfile(profile) as Profile); }, 'Profile retrained from your samples.')}><RefreshCw />Retrain</button></div>{profile.metrics && <div className="stat-grid"><div className="stat-card"><strong>{profile.metrics.averageSentenceLength}</strong><span>words per sentence, on average</span></div><div className="stat-card"><strong>{profile.metrics.averageParagraphLength}</strong><span>words per paragraph, on average</span></div><div className="stat-card"><strong>{Number(profile.metrics.wordCount).toLocaleString()}</strong><span>words in your sample collection</span></div></div>}<CharacteristicsEditor profile={profile} busy={busy} onSave={p => work('Saving characteristics', async () => { await saveProfile(p); }, 'Your style characteristics have been saved.')} /><ApprovedExpressions profile={profile} busy={busy} onSave={p => work('Saving expressions', async () => { await saveProfile(p); })} /><FeedbackHistory profile={profile} /></>}{remove && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="remove-sample-title" className="modal"><h2 id="remove-sample-title">Remove this sample?</h2><p>“{remove.name}” will be removed from this profile. You’ll need to retrain after changing the sample collection.</p><div className="modal-actions"><button className="button" disabled={busy} onClick={() => setRemove(null)}>Cancel</button><button className="button danger" disabled={busy} onClick={() => void work('Removing sample', async () => { await saveProfile(changedSamples(profile.samples.filter(s => s.id !== remove.id))); setSelected(null); setRemove(null); })}>Remove sample</button></div></section></div>}</>;
}

function CharacteristicsEditor({ profile, busy, onSave }: { profile: Profile; busy: boolean; onSave: (p: Profile) => Promise<void> }) {
  const [values, setValues] = useState(profile.characteristics);
  useEffect(() => setValues(profile.characteristics), [profile.id, profile.characteristics]);
  const dirty = JSON.stringify(values) !== JSON.stringify(profile.characteristics);
  return <section className="panel"><div className="panel-heading"><h2>Your writing characteristics</h2><span className="badge">{profile.trainedAt ? 'Editable profile' : 'Train to enable personalization'}</span></div><form className="panel-body" onSubmit={e => { e.preventDefault(); void onSave({ ...profile, characteristics: values }); }}><div className="characteristics-grid">{(Object.entries(labels) as [keyof Characteristics, string][]).map(([key, label]) => <div className="field characteristic-field" key={key}><label htmlFor={`characteristic-${key}`}>{label}</label><textarea id={`characteristic-${key}`} maxLength={20000} value={values[key]} onChange={e => setValues({ ...values, [key]: e.target.value })} placeholder="Add your preferences, or train with your own writing samples." /></div>)}</div><div className="request-actions"><p className="field-hint">Retraining replaces these observations. Approved expressions and custom rules are kept.</p><button className="button primary" disabled={busy || !dirty}><Save />Save characteristics</button></div></form></section>;
}

function ApprovedExpressions({ profile, busy, onSave }: { profile: Profile; busy: boolean; onSave: (p: Profile) => Promise<void> }) {
  const [expression, setExpression] = useState('');
  return <section className="panel spaced-panel"><div className="panel-heading"><h2>Approved expressions</h2><span className="badge">{profile.approvedExpressions.length} saved</span></div><div className="panel-body"><p className="field-hint">These expressions are protected during revision unless you explicitly request a change.</p><div className="rules-list">{profile.approvedExpressions.map((value, index) => <div className="rule-row" key={`${index}-${value}`}><span>{value}</span><button className="icon-button" aria-label={`Remove expression ${index + 1}`} disabled={busy} onClick={() => void onSave({ ...profile, approvedExpressions: profile.approvedExpressions.filter((_, i) => index !== i) })}><X /></button></div>)}</div><form className="rule-input" onSubmit={e => { e.preventDefault(); if (expression.trim()) { void onSave({ ...profile, approvedExpressions: [...new Set([...profile.approvedExpressions, expression.trim()])] }); setExpression(''); } }}><input aria-label="New approved expression" maxLength={2000} value={expression} onChange={e => setExpression(e.target.value)} placeholder="An expression you want to keep…" /><button className="button" disabled={busy || !expression.trim() || profile.approvedExpressions.length >= 500}><Plus />Save preference</button></form></div></section>;
}

function FeedbackHistory({ profile }: { profile: Profile }) {
  return <details className="panel spaced-panel feedback-history"><summary>Feedback history <span className="badge">{profile.feedback.length} entries</span></summary><div className="panel-body">{profile.feedback.length ? profile.feedback.slice().reverse().slice(0, 100).map(entry => <div className="history-entry" key={entry.id}><strong>{entry.kind}</strong><p>{entry.expression || entry.suggested || entry.original}</p><small>{new Date(entry.createdAt).toLocaleString()} · {entry.learn ? 'Approved for learning' : 'Feedback only; profile unchanged'}</small></div>) : <p className="field-hint">When you review suggestions, tell NaturalWrite what sounds like you. Your profile changes only when you explicitly approve learning.</p>}{profile.feedback.length > 100 && <p className="field-hint">Showing your 100 most recent entries. All feedback remains stored locally.</p>}</div></details>;
}

function Settings({ provider, profile, busy, work, onProvider, onProfile }: { provider: ProviderConfig; profile: Profile; busy: boolean; work: Work; onProvider: (p: ProviderConfig) => void; onProfile: (p: Profile) => Promise<void> }) {
  const [engine, setEngine] = useState(provider.provider);
  const [endpoint, setEndpoint] = useState(provider.endpoint);
  const [model, setModel] = useState(provider.model);
  const [key, setKey] = useState('');
  const [deleteKey, setDeleteKey] = useState(false);
  const save = () => work('Saving provider', async () => { const updated = await api.saveProviderConfig({ provider: engine, endpoint: endpoint.trim(), model: model.trim(), ...(deleteKey ? { apiKey: '' } : key.trim() ? { apiKey: key.trim() } : {}) }); onProvider(updated); setKey(''); setDeleteKey(false); }, 'Revision settings saved.');
  return <div className="settings-grid"><div><form className="settings-card" onSubmit={e => { e.preventDefault(); void save(); }}><h2>Your revision engine</h2><p>Start with offline proofreading, or connect your own AI provider for more detailed suggestions.</p><div className="field"><label htmlFor="engine">Revision engine</label><select id="engine" value={engine} onChange={e => setEngine(e.target.value as ProviderConfig['provider'])}><option value="offline">Offline proofreading · no account needed</option><option value="openai">Connected AI · OpenAI-compatible API</option></select></div><div className="field"><label htmlFor="endpoint">API endpoint</label><input id="endpoint" type="url" maxLength={2000} value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" /><p className="field-hint">A chat-completions-compatible endpoint. HTTPS is required, except for localhost models.</p></div><div className="field"><label htmlFor="model">Model name</label><input id="model" maxLength={200} value={model} onChange={e => setModel(e.target.value)} placeholder="Enter the model offered by your provider" /></div><div className="field"><label htmlFor="api-key">API key {provider.hasApiKey && <span className="badge">Stored securely</span>}</label><input id="api-key" type="password" autoComplete="off" value={key} onChange={e => { setKey(e.target.value); setDeleteKey(false); }} placeholder={provider.hasApiKey ? 'Leave blank to keep the saved key' : 'Enter your provider’s API key'} /><p className="field-hint">Stored using your operating system’s secure credential storage. Changing the endpoint clears the old key unless you provide a new one.</p></div>{provider.hasApiKey && <label className="checkbox-row"><input type="checkbox" checked={deleteKey} onChange={e => { setDeleteKey(e.target.checked); if (e.target.checked) setKey(''); }} />Remove my saved API key</label>}<button className="button primary" disabled={busy}><Save />Save revision settings</button><div className="notice"><LockKeyhole /><p>Connected AI sends the draft, your instructions, preservation rules, and enabled profile summary to your chosen provider when you click “Suggest improvements.” Meaning verification makes a separate request. Provider charges and policies apply.</p></div></form><section className="settings-card spaced-panel"><h2>Your local workspace</h2><p>Documents, training samples, profiles, and feedback are stored in a SQLite database on this device. The writing database is not encrypted; protect access to your computer.</p><button className="button" disabled={busy} onClick={() => void work('Opening data folder', () => api.openDataFolder())}><FolderOpen />Open local data folder</button><p className="field-hint storage-hint">To back up your writing, quit NaturalWrite and copy the data folder. API keys are tied to your operating system account and may need to be entered again on another computer.</p></section></div><div><Preservation profile={profile} disabled={busy} onSave={p => void onProfile(p)} /><div className="notice"><ShieldCheck /><p>Automatic rewriting is off. Your original draft stays intact until you apply accepted changes. Meaning checks can miss changes; always review suggestions. NaturalWrite makes no promise about AI-detector results.</p></div></div></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
