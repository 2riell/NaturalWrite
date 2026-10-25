import { packager } from '@electron/packager';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(root, 'release');
const stage = path.join(release, '.stage');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const requested = process.argv.slice(2);
const targets = requested.length ? requested : ['win32-x64', 'darwin-arm64', 'darwin-x64'];
const supported = new Set(['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64']);
for (const target of targets) if (!supported.has(target)) throw new Error(`Unsupported package target: ${target}`);
await stat(path.join(root, 'dist/index.html')).catch(() => { throw new Error('Run npm run build before packaging.'); });
await mkdir(release, { recursive: true });
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

// Copy an explicit runtime allowlist. Never package the workspace, tests,
// API credentials, development dependencies, or previously built packages.
for (const directory of ['dist', 'core', 'desktop']) {
  await cp(path.join(root, directory), path.join(stage, directory), {
    recursive: true,
    filter: filename => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(filename),
  });
}
const runtimeMetadata = { ...metadata };
delete runtimeMetadata.devDependencies;
delete runtimeMetadata.scripts;
await writeFile(path.join(stage, 'package.json'), JSON.stringify(runtimeMetadata, null, 2));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const modules = execFileSync(npm, ['ls', '--all', '--omit=dev', '--omit=optional', '--parseable'], {
  cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
}).trim().split(/\r?\n/).filter(filename => filename !== root);
for (const directory of new Set(modules)) {
  const relative = path.relative(root, directory);
  if (!relative.startsWith(`node_modules${path.sep}`) || relative.includes(`@napi-rs${path.sep}canvas`)) continue;
  await cp(directory, path.join(stage, relative), {
    recursive: true,
    filter: filename => filename === directory || !path.relative(directory, filename).split(path.sep).includes('node_modules'),
  });
}
await writeFile(path.join(stage, 'THIRD-PARTY-NOTICE.txt'),
  'NaturalWrite includes Electron/Chromium, React, sql.js/SQLite, PDF.js, Mammoth, DOMMatrix, Lucide and their dependencies. Their license and notice files are included alongside the packages. Electron LICENSE and LICENSES.chromium.html are retained in the app distribution.\n');

async function zipDirectory(directory, output) {
  await rm(output, { force: true });
  // -y stores symlinks as symlinks; Unix executable permissions are preserved.
  execFileSync('zip', ['-q', '-y', '-r', output, '.'], { cwd: directory, stdio: 'inherit' });
}
async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

const checksums = [];
for (const target of targets) {
  const [platform, arch] = target.split('-');
  console.log(`Packaging NaturalWrite ${metadata.version} for ${target} with Electron ${electronVersion}`);
  const packages = await packager({
    dir: stage,
    out: release,
    overwrite: true,
    name: 'NaturalWrite',
    executableName: 'NaturalWrite',
    appBundleId: 'app.naturalwrite.desktop',
    appCategoryType: 'public.app-category.productivity',
    appVersion: metadata.version,
    buildVersion: metadata.version,
    electronVersion,
    platform,
    arch,
    asar: true,
    prune: false,
    icon: path.join(root, 'assets', platform === 'darwin' ? 'icon.icns' : platform === 'win32' ? 'icon.ico' : 'icon.png'),
    download: { cacheRoot: process.env.ELECTRON_CACHE || path.join(release, '.electron-cache') },
    darwinDarkModeSupport: true,
    extendInfo: { NSHumanReadableCopyright: 'NaturalWrite development preview', LSMinimumSystemVersion: '12.0' },
    win32metadata: { CompanyName: 'NaturalWrite', FileDescription: 'NaturalWrite personal writing studio', ProductName: 'NaturalWrite' },
  });
  const directory = packages[0];
  if (!directory) throw new Error(`No package created for ${target}.`);
  if (platform === 'darwin') {
    const app = path.join(directory, 'NaturalWrite.app');
    const entitlements = path.join(root, 'assets/entitlements.mac.plist');
    if (process.env.RCODESIGN) {
      execFileSync(process.env.RCODESIGN, ['sign', '--timestamp-url', 'none', '--entitlements-xml-file', `main:${entitlements}`, app], { stdio: 'inherit' });
      // rcodesign verify expects a CMS certificate even for ad-hoc signatures.
      // Independently verify code-page hashes, special slots and resource seals.
      execFileSync('python3', [path.join(root, 'scripts/verify-mac.py'), app], { stdio: 'inherit' });
    } else if (process.platform === 'darwin') {
      execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--entitlements', entitlements, app], { stdio: 'inherit' });
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
    } else {
      throw new Error('Mac previews require RCODESIGN pointing to rcodesign on Linux, or packaging on macOS, to apply development signatures.');
    }
  }
  const install = platform === 'darwin'
    ? 'MAC: Unzip the archive, move NaturalWrite.app to Applications, then open it. This development preview has an ad-hoc signature, not an Apple Developer ID signature or notarization. macOS may require approval in System Settings > Privacy & Security after the first open attempt. Do not disable system-wide security settings. Apple silicon uses arm64; Intel uses x64. macOS 12 or later is required.\n'
    : platform === 'win32'
      ? 'WINDOWS: Extract the entire ZIP to a folder, then open NaturalWrite.exe inside it. Keep all files beside the executable. This development preview is unsigned; Windows may show an unknown-publisher or reputation warning. Windows 10/11 x64 is required.\n'
      : 'LINUX: Extract the entire ZIP and open NaturalWrite. This package is intended for development testing.\n';
  await writeFile(path.join(directory, 'START-HERE.txt'),
    `NaturalWrite ${metadata.version} — development preview\n\n${install}\nWriting profiles and documents are stored locally in SQLite under the operating system app-data directory. The default proofreading engine works offline and is limited; optional AI revisions need your provider configuration in Settings. No edits are applied without review. Keep backups of important documents.\n\nThis package was assembled in a Linux build environment. Windows/macOS installation and native keychain behavior require testing on their respective systems.\n`);
  const platformName = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux';
  const archive = path.join(release, `NaturalWrite-${metadata.version}-${platformName}-${arch}.zip`);
  await zipDirectory(directory, archive);
  checksums.push(`${await sha256(archive)}  ${path.basename(archive)}`);
  console.log(`Created ${archive}`);
}
await writeFile(path.join(release, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log('Package checksums written to release/SHA256SUMS.txt');
