module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
  if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
    console.log('Apple notarization skipped: no complete App Store Connect API credentials supplied.');
    return;
  }
  const { notarize } = require('@electron/notarize');
  const path = require('node:path');
  await notarize({
    appPath: path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`),
    appleApiKey: APPLE_API_KEY,
    appleApiKeyId: APPLE_API_KEY_ID,
    appleApiIssuer: APPLE_API_ISSUER,
  });
};
