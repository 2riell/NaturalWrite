const { spawnSync } = require('node:child_process');
const [platform, arch] = process.argv.slice(2);
if (!['mac', 'win'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported build target');
const env = { ...process.env };
// An empty certificate secret must not be interpreted as the current directory.
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
  if (!env[name]) delete env[name];
}
const args = [require.resolve('electron-builder/cli.js'), `--${platform}`, `--${arch}`, '--publish', 'never'];
if (platform === 'mac' && !env.CSC_LINK) args.push('--config.mac.identity=-');
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
