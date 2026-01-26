// Mock Capacitor Core
export const Capacitor = {
  isNativePlatform: () => true, // Force TRUE to trick app into "Android Mode"
  getPlatform: () => 'android',
  pluginMethodNoop: () => {}
};
