const { _electron } = require('playwright');
const path = require('node:path');
(async () => {
  const app = await _electron.launch({ executablePath: path.resolve(process.argv[2]), timeout: 30000 });
  try {
    const page = await app.firstWindow({ timeout: 20000 });
    await page.getByRole('textbox', { name: 'Writing editor', exact: true }).waitFor({ timeout: 20000 });
    const state = await page.evaluate(() => window.naturalwrite.load());
    if (!state.profiles.length) throw new Error('Packaged storage did not initialize');
    console.log('Packaged Mac app opened its editor and loaded local SQLite storage.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exit(1); });
