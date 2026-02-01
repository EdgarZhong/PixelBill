import { BatchProcessor } from '../src/core/ai_engine/BatchProcessor';
import { ConfigManager } from '../src/core/config/ConfigManager';

async function main() {
  console.log('Starting BatchProcessor test (using tsconfig paths to map to node-filesystem)...');

  try {
    const config = ConfigManager.getInstance();
    await config.init();
    
    // In this test environment, ConfigManager should load from virtual_android_filesys/sandbox_path/secure_config.bin
    // thanks to our node-filesystem.ts adapter.
    
    const loadedConfig = await config.getConfig();
    console.log('Loaded Config Provider:', loadedConfig.provider);
    console.log('Loaded Config BaseURL:', loadedConfig.baseUrl);
    console.log('API Key Present:', !!loadedConfig.apiKey);

    if (!loadedConfig.apiKey) {
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
