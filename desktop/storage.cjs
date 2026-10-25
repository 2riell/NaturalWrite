const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');

const MAX_TEXT = 200_000;
const fields = ['summary', 'vocabulary', 'sentenceStructure', 'grammar', 'expressions', 'paragraphOrganization', 'formality', 'tone', 'examples'];
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const string = (value, name, max = MAX_TEXT, allowEmpty = true) => {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`Invalid ${name}.`);
  return value;
};
const identifier = value => string(value, 'identifier', 100, false);

function validateProfile(input) {
  if (!isObject(input)) throw new Error('Invalid writing profile.');
  const profile = structuredClone(input);
  identifier(profile.id);
  string(profile.name, 'profile name', 120, false);
  string(profile.category, 'category', 100, false);
  if (!isObject(profile.characteristics)) throw new Error('Invalid style characteristics.');
  for (const field of fields) string(profile.characteristics[field], field, 20_000);
  if (profile.trainedAt !== null) string(profile.trainedAt, 'training date', 60, false);
  if (profile.metrics !== null && !isObject(profile.metrics)) throw new Error('Invalid profile metrics.');
  const prefs = profile.preferences;
  if (!isObject(prefs)) throw new Error('Invalid preservation preferences.');
  for (const key of ['useProfile', 'preserveStyle', 'preserveVocabulary', 'preserveStructure', 'meaningVerification']) {
    if (typeof prefs[key] !== 'boolean') throw new Error(`Invalid ${key} preference.`);
  }
  if (!Number.isFinite(prefs.strength) || prefs.strength < 0 || prefs.strength > 100) throw new Error('Preservation strength must be between 0 and 100.');
  if (!Array.isArray(prefs.rules) || prefs.rules.length > 100) throw new Error('Too many writing rules.');
  prefs.rules.forEach(rule => string(rule, 'writing rule', 2000, false));
  if (!Array.isArray(profile.approvedExpressions) || profile.approvedExpressions.length > 500) throw new Error('Invalid approved expressions.');
  profile.approvedExpressions.forEach(value => string(value, 'approved expression', 2000, false));
  if (!Array.isArray(profile.samples) || profile.samples.length > 200) throw new Error('A profile can contain up to 200 samples.');
  const ids = new Set();
  for (const sample of profile.samples) {
    if (!isObject(sample)) throw new Error('Invalid writing sample.');
    identifier(sample.id);
    if (ids.has(sample.id)) throw new Error('Duplicate writing sample.');
    ids.add(sample.id);
    string(sample.name, 'sample name', 500, false);
    string(sample.category, 'sample category', 100, false);
    string(sample.text, 'sample text', MAX_TEXT, false);
    string(sample.createdAt, 'sample date', 60, false);
  }
  if (!Array.isArray(profile.feedback) || profile.feedback.length > 5000) throw new Error('Invalid feedback history.');
  const feedbackIds = new Set();
  for (const item of profile.feedback) {
    if (!isObject(item)) throw new Error('Invalid feedback.');
    identifier(item.id);
    if (feedbackIds.has(item.id)) throw new Error('Duplicate feedback.');
    feedbackIds.add(item.id);
    string(item.kind, 'feedback kind', 100, false);
    string(item.original, 'feedback original');
    string(item.suggested, 'feedback suggestion');
    if (item.expression !== undefined) string(item.expression, 'feedback expression', 2000);
    if (typeof item.learn !== 'boolean') throw new Error('Feedback requires an explicit learning preference.');
    string(item.createdAt, 'feedback date', 60, false);
  }
  if (JSON.stringify(profile).length > 20_000_000) throw new Error('This profile is too large. Remove some samples first.');
  return profile;
}

function validateDocument(input) {
  if (!isObject(input)) throw new Error('Invalid document.');
  return {
    id: identifier(input.id),
    title: string(input.title, 'document title', 300, false),
    text: string(input.text, 'document text'),
    updatedAt: new Date().toISOString(),
  };
}

async function createStore({ directory, initialProfile, initialDocument }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'naturalwrite.sqlite');
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  let db;
  try {
    db = fs.existsSync(filename) ? new SQL.Database(fs.readFileSync(filename)) : new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    const version = db.exec('PRAGMA user_version;')[0]?.values[0][0] || 0;
    if (version > 1) throw new Error('This database was created by a newer version of NaturalWrite.');
    db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        trained_at TEXT, characteristics_json TEXT NOT NULL, metrics_json TEXT,
        preferences_json TEXT NOT NULL, expressions_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS samples (
        id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL, category TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL,
        position INTEGER NOT NULL, PRIMARY KEY(profile_id, id)
      );
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(profile_id, id)
      );
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
    const integrity = db.exec('PRAGMA quick_check;')[0]?.values[0][0];
    if (integrity !== 'ok') throw new Error('The writing database could not pass its integrity check.');
  } catch (error) {
    db?.close();
    throw new Error(`Unable to open the local writing database. Your existing file has not been overwritten. ${error.message}`);
  }

  function query(sql, values = []) {
    const statement = db.prepare(sql);
    try {
      statement.bind(values);
      const result = [];
      while (statement.step()) result.push(statement.getAsObject());
      return result;
    } finally { statement.free(); }
  }

  function persist() {
    const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(fd, Buffer.from(db.export())); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temporary, filename);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    db.run('PRAGMA foreign_keys = ON;');
  }

  function mutate(action) {
    const previous = db.export();
    db.run('PRAGMA foreign_keys = ON; BEGIN TRANSACTION;');
    try {
      const result = action();
      db.run('COMMIT;');
      persist();
      return result;
    } catch (error) {
      db.close();
      db = new SQL.Database(previous);
      db.run('PRAGMA foreign_keys = ON;');
      throw error;
    }
  }

  function getSetting(key, fallback = null) {
    const row = query('SELECT value_json FROM settings WHERE key = ?', [key])[0];
    return row ? JSON.parse(row.value_json) : fallback;
  }
  function writeSetting(key, value) {
    db.run('INSERT INTO settings(key, value_json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json', [key, JSON.stringify(value)]);
  }
  function readProfile(row) {
    return {
      id: row.id, name: row.name, category: row.category, trainedAt: row.trained_at,
      characteristics: JSON.parse(row.characteristics_json), metrics: row.metrics_json ? JSON.parse(row.metrics_json) : null,
      preferences: JSON.parse(row.preferences_json), approvedExpressions: JSON.parse(row.expressions_json),
      samples: query('SELECT * FROM samples WHERE profile_id=? ORDER BY position', [row.id]).map(sample => ({ id: sample.id, name: sample.name, category: sample.category, text: sample.text, createdAt: sample.created_at })),
      feedback: query('SELECT data_json FROM feedback WHERE profile_id=? ORDER BY position', [row.id]).map(item => JSON.parse(item.data_json)),
    };
  }

  const store = {
    filename,
    getProfile(id) {
      const row = query('SELECT * FROM profiles WHERE id=?', [identifier(id)])[0];
      if (!row) throw new Error('This writing profile no longer exists.');
      return readProfile(row);
    },
    load() {
      return {
        profiles: query('SELECT * FROM profiles ORDER BY rowid').map(readProfile),
        activeProfileId: getSetting('activeProfileId', ''),
        documents: query('SELECT id, title, text, updated_at AS updatedAt FROM documents ORDER BY updated_at DESC'),
        provider: getSetting('provider', { provider: 'offline', endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }),
      };
    },
    saveProfile(input) {
      const profile = validateProfile(input);
      return mutate(() => {
        db.run(`INSERT INTO profiles(id,name,category,trained_at,characteristics_json,metrics_json,preferences_json,expressions_json)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category,
          trained_at=excluded.trained_at, characteristics_json=excluded.characteristics_json, metrics_json=excluded.metrics_json,
          preferences_json=excluded.preferences_json, expressions_json=excluded.expressions_json`,
        [profile.id, profile.name, profile.category, profile.trainedAt, JSON.stringify(profile.characteristics), JSON.stringify(profile.metrics), JSON.stringify(profile.preferences), JSON.stringify(profile.approvedExpressions)]);
        db.run('DELETE FROM samples WHERE profile_id=?', [profile.id]);
        db.run('DELETE FROM feedback WHERE profile_id=?', [profile.id]);
        profile.samples.forEach((sample, index) => db.run('INSERT INTO samples VALUES(?,?,?,?,?,?,?)', [sample.id, profile.id, sample.name, sample.category, sample.text, sample.createdAt, index]));
        profile.feedback.forEach((item, index) => db.run('INSERT INTO feedback VALUES(?,?,?,?)', [item.id, profile.id, JSON.stringify(item), index]));
        if (!getSetting('activeProfileId')) writeSetting('activeProfileId', profile.id);
        return profile;
      });
    },
    deleteProfile(id) {
      store.getProfile(id);
      if (query('SELECT id FROM profiles').length <= 1) throw new Error('Keep at least one writing profile. Create another before deleting this one.');
      mutate(() => {
        db.run('DELETE FROM profiles WHERE id=?', [id]);
        if (getSetting('activeProfileId') === id) writeSetting('activeProfileId', query('SELECT id FROM profiles ORDER BY rowid LIMIT 1')[0].id);
      });
    },
    setActiveProfile(id) { store.getProfile(id); mutate(() => writeSetting('activeProfileId', id)); },
    saveDocument(input) {
      const document = validateDocument(input);
      return mutate(() => {
        db.run('INSERT INTO documents(id,title,text,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,text=excluded.text,updated_at=excluded.updated_at', [document.id, document.title, document.text, document.updatedAt]);
        return document;
      });
    },
    deleteDocument(id) { mutate(() => db.run('DELETE FROM documents WHERE id=?', [identifier(id)])); },
    saveProvider(config) { return mutate(() => { writeSetting('provider', config); return config; }); },
    close() { db.close(); },
  };
  if (query('SELECT id FROM profiles').length === 0 && initialProfile) store.saveProfile(initialProfile);
  if (query('SELECT id FROM documents').length === 0 && initialDocument) store.saveDocument(initialDocument);
  persist();
  return store;
}

module.exports = { createStore, validateProfile, validateDocument, MAX_TEXT };
