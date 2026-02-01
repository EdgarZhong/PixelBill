import { BatchProcessor } from '../src/core/ai_engine/BatchProcessor';
import { ConfigManager } from '../src/core/config/ConfigManager';
import { Buffer } from 'node:buffer';

// Polyfill for environment
if (typeof window === 'undefined') {
  (global as any).window = global;
}

if (!global.crypto) {
  // @ts-ignore
  global.crypto = await import('crypto');
}
if (!window.crypto) {
  window.crypto = global.crypto;
}

// Polyfill atob/btoa
if (!window.atob) {
  window.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}
if (!window.btoa) {
  window.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

async function main() {
  console.log('Starting BatchProcessor test (using tsconfig paths to map to node-filesystem)...');

  try {
    const config = ConfigManager.getInstance();
    await config.init();
    
    // In this test environment, ConfigManager should load from virtual_android_filesys/sandbox_path/secure_config.bin
    // thanks to our node-filesystem.ts adapter.
    
    const activeConfig = await config.getActiveModelConfig();
    console.log('Loaded Active Model:', activeConfig.model);
    console.log('Loaded Active BaseURL:', activeConfig.baseUrl);
    console.log('API Key Present:', !!activeConfig.apiKey);

    if (!activeConfig.apiKey) {
      console.warn('⚠️ No API Key found in sandbox config. The test might fail at the network step.');
      // Optionally inject one if you want to test logic without a real file
      // config.saveConfig({ apiKey: 'test-key' });
    }

    const processor = BatchProcessor.getInstance();
    
    processor.subscribe((status, progress) => {
      console.log(`[State Update] Status: ${status}, Progress: ${progress.current}/${progress.total} ${progress.currentDate ? `(${progress.currentDate})` : ''}`);
    });

    console.log('Running processor...');
    const result = await processor.run();
    
    console.log('Processing complete.');
    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (e) {
    console.error('Test failed:', e);
  }
}

main();
