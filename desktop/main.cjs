const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Menu, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createStore, MAX_TEXT } = require('./storage.cjs');
const { extractDocument } = require('./imports.cjs');
const { validateProviderConfig, reviseDocument } = require('./provider.cjs');

app.setName('NaturalWrite');
if (process.env.NATURALWRITE_DATA_DIR && !app.isPackaged) app.setPath('userData', path.resolve(process.env.NATURALWRITE_DATA_DIR));
let store;
let mainWindow;
let revisionBusy = false;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('NaturalWrite could not start', error.message || 'The local writing database could not be opened.');
    app.quit();
  });
}

function secretFile() { return path.join(app.getPath('userData'), 'provider-key.bin'); }
function encryptionAvailable() {
  return safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend?.() !== 'basic_text');
}
function loadKey(endpoint) {
  if (!fs.existsSync(secretFile())) return '';
  if (!encryptionAvailable()) throw new Error('Your operating system key store is unavailable. Unlock it or save a new API key in Settings.');
  try {
    const record = JSON.parse(safeStorage.decryptString(fs.readFileSync(secretFile())));
    return record.endpoint === endpoint ? record.key : '';
  } catch { throw new Error('The saved AI key could not be unlocked. Re-enter it in Settings.'); }
}
function publicProvider() {
  const config = store.load().provider;
  return { ...config, hasApiKey: fs.existsSync(secretFile()) };
}

async function start() {
  const style = await import(pathToFileURL(path.join(__dirname, '../core/style.mjs')).href);
  const core = await import(pathToFileURL(path.join(__dirname, '../core/revision.mjs')).href);
  store = await createStore({ directory: app.getPath('userData'), initialProfile: style.createProfile('My writing', 'Academic Essays') });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerHandlers(core);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

function registerHandlers(core) {
  const methods = {
    load: () => ({ ...store.load(), provider: publicProvider() }),
    saveProfile: profile => store.saveProfile(profile),
    deleteProfile: id => store.deleteProfile(id),
    setActiveProfile: id => store.setActiveProfile(id),
    saveDocument: document => store.saveDocument(document),
    deleteDocument: id => store.deleteDocument(id),
    importSamples: async () => {
      const selected = await dialog.showOpenDialog(mainWindow, { title: 'Import your writing samples', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Writing documents', extensions: ['pdf', 'docx', 'txt', 'md', 'markdown'] }] });
      if (selected.canceled) return [];
      if (selected.filePaths.length > 50) throw new Error('Import up to 50 documents at a time.');
      const results = [];
      for (const filename of selected.filePaths) {
        const extracted = await extractDocument(filename);
        results.push({ id: crypto.randomUUID(), name: extracted.name, category: store.getProfile(store.load().activeProfileId).category, text: extracted.text, createdAt: new Date().toISOString() });
      }
      return results;
    },
    exportDocument: async input => {
      if (!input || typeof input.text !== 'string' || input.text.length > MAX_TEXT || typeof input.title !== 'string') throw new Error('Invalid export document.');
      const basename = input.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 100).trim() || 'Untitled';
      const selected = await dialog.showSaveDialog(mainWindow, { title: 'Export your writing', defaultPath: `${basename}.txt`, filters: [{ name: 'Plain text', extensions: ['txt'] }, { name: 'Markdown', extensions: ['md'] }] });
      if (selected.canceled || !selected.filePath) return false;
      fs.writeFileSync(selected.filePath, input.text, { encoding: 'utf8', mode: 0o600 });
      return true;
    },
    revise: async input => {
      if (revisionBusy) throw new Error('A revision is already running. Please wait for it to finish.');
      const profile = store.getProfile(input?.profileId);
      const provider = store.load().provider;
      revisionBusy = true;
      try { return await reviseDocument({ input, profile, provider, apiKey: provider.provider === 'openai' ? loadKey(provider.endpoint) : '', core }); }
      finally { revisionBusy = false; }
    },
    saveProviderConfig: input => {
      const config = validateProviderConfig(input);
      const previous = store.load().provider;
      const previousBytes = fs.existsSync(secretFile()) ? fs.readFileSync(secretFile()) : null;
      try {
        if (input.apiKey?.trim()) {
          if (!encryptionAvailable()) throw new Error('Secure OS key storage is unavailable. Unlock your keychain or credential store before saving an API key.');
          const encrypted = safeStorage.encryptString(JSON.stringify({ endpoint: config.endpoint, key: input.apiKey.trim() }));
          const temporary = `${secretFile()}.tmp`;
          fs.writeFileSync(temporary, encrypted, { mode: 0o600 });
          fs.renameSync(temporary, secretFile());
        } else if (input.apiKey === '' || previous.endpoint !== config.endpoint) {
          if (fs.existsSync(secretFile())) fs.unlinkSync(secretFile());
        }
        store.saveProvider(config);
      } catch (error) {
        if (previousBytes) fs.writeFileSync(secretFile(), previousBytes, { mode: 0o600 });
        else if (fs.existsSync(secretFile())) fs.unlinkSync(secretFile());
        throw error;
      }
      return publicProvider();
    },
    openDataFolder: async () => {
      const error = await shell.openPath(app.getPath('userData'));
      if (error) throw new Error('Could not open the local data folder.');
    },
  };
  for (const [method, handler] of Object.entries(methods)) ipcMain.handle(`naturalwrite:${method}`, (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('This request is not from the NaturalWrite editor.');
    return handler(...args);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'NaturalWrite', width: 1400, height: 940, minWidth: 1000, minHeight: 700,
    backgroundColor: '#f7f7f2', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { if (store) store.close(); });
