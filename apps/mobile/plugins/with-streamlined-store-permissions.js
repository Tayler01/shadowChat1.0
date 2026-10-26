const { withBaseMod } = require('expo/config-plugins');

// The streamlined store client uses remote HTTPS and ordinary device-only
// Keychain storage. It never requests biometric authentication or LAN discovery.
// Run after the Expo plugins that add their development/default declarations.
function stripUnusedStorePermissions(infoPlist) {
  const result = { ...infoPlist };
  delete result.NSFaceIDUsageDescription;
  delete result.NSLocalNetworkUsageDescription;
  delete result.NSBonjourServices;
  result.NSAppTransportSecurity = { ...result.NSAppTransportSecurity, NSAllowsArbitraryLoads: false };
  delete result.NSAppTransportSecurity.NSAllowsLocalNetworking;
  if (result.NSAppTransportSecurity.NSExceptionDomains?.localhost) {
    result.NSAppTransportSecurity.NSExceptionDomains = { ...result.NSAppTransportSecurity.NSExceptionDomains };
    delete result.NSAppTransportSecurity.NSExceptionDomains.localhost;
    if (Object.keys(result.NSAppTransportSecurity.NSExceptionDomains).length === 0) delete result.NSAppTransportSecurity.NSExceptionDomains;
  }
  return result;
}

function withStreamlinedStorePermissions(config) {
  if (config.extra?.appEdition !== 'streamlined') return config;
  // Base mods merge config.ios.infoPlist after plugin mods, so prune both layers.
  config = { ...config, ios: { ...config.ios, infoPlist: stripUnusedStorePermissions(config.ios?.infoPlist || {}) } };
  return withBaseMod(config, {
    platform: 'ios',
    mod: 'infoPlist',
    isIntrospective: true,
    action: async mod => {
      // Standard mods run in reverse registration order. Await the remaining
      // chain so SecureStore/Dev Launcher cannot reinsert default permissions.
      const completed = await mod.modRequest.nextMod(mod);
      completed.modResults = stripUnusedStorePermissions(completed.modResults);
      return completed;
    },
  });
}

module.exports = withStreamlinedStorePermissions;
module.exports.stripUnusedStorePermissions = stripUnusedStorePermissions;
