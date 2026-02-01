
import { ConfigManager } from '../src/core/config/ConfigManager';
import { AIEnginePlugin } from '../src/core/plugin/AIEnginePlugin';
import { globalArbiter } from '../src/core/arbiter/Arbiter';
import { Filesystem, Directory, Encoding } from './mocks/node-filesystem';
import path from 'path';

// Polyfill for environment
if (!global.crypto) {
  global.crypto = require('crypto');
}

const LEDGER_FILE_PATH = 'PixelBill/default.pixelbill.json';

async function main() {
  console.log('🚀 Starting AI Engine Integration Test (V2)...');
  console.log('------------------------------------------------');

  try {
    // 1. Initialize Config (Load API Key)
    console.log('[Step 1] Initializing Configuration...');
    const configManager = ConfigManager.getInstance();
    await configManager.init();
    const config = await configManager.getConfig();
    
    if (!config.apiKey) {
      console.error('❌ Error: API Key not found in secure_config.bin!');
      console.error('Please configure it via UI or manually edit virtual_android_filesys/sandbox_path/secure_config.bin');
      process.exit(1);
    }
    console.log('✅ Config Loaded. API Key Present.');

    // 2. Initialize Plugins
    console.log('[Step 2] Initializing Plugins...');
    const aiPlugin = new AIEnginePlugin();
    // Register to global arbiter (although we can also use aiPlugin directly, but let's follow the flow)
    globalArbiter.registerPlugin(aiPlugin);
    console.log('✅ AIEnginePlugin Registered.');

    // 3. Setup Persistence Mock (The "Disk Writer")
    console.log('[Step 3] Setting up Mock Persistence Layer...');
    
    globalArbiter.setPatchCallback(async (patch) => {
      console.log(`\n💾 [Persistence] Received Patch for TxID: ${patch.id}`);
      console.log(`   Updates: ${JSON.stringify(patch.updates, null, 2)}`);

      try {
        // Read current file
        const readRes = await Filesystem.readFile({
            path: LEDGER_FILE_PATH,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
        });
        
        const ledger = JSON.parse(readRes.data as string);
        
        // Find transaction
        let targetTx = null;
        let found = false;
        
        // Ledger structure: { records: { "id": { ... } } }
        if (ledger.records && ledger.records[patch.id]) {
            targetTx = ledger.records[patch.id];
            found = true;
        }

        if (found && targetTx) {
            // Apply updates
            Object.assign(targetTx, patch.updates);
            targetTx.updated_at = new Date().toISOString(); // Simulate update time
            
            // Write back
            await Filesystem.writeFile({
                path: LEDGER_FILE_PATH,
                data: JSON.stringify(ledger, null, 2),
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
            console.log('✅ [Persistence] Saved to disk successfully.');
        } else {
            console.warn(`⚠️ [Persistence] Transaction ${patch.id} not found in ledger file.`);
        }

      } catch (e) {
        console.error('❌ [Persistence] Failed to write to disk:', e);
      }
    });
    console.log('✅ Persistence Layer Hooked.');

    // 4. Trigger AI Analysis
    console.log('\n[Step 4] Triggering Batch Analysis...');
    console.log('⏳ AI Engine is thinking... (This may take 10-30 seconds)');
    
    // Subscribe to progress
    aiPlugin.subscribeToProgress((status, progress) => {
        if (status === 'ANALYZING') {
            process.stdout.write(`\r   Progress: ${progress.current}/${progress.total} items...`);
        }
    });

    const result = await aiPlugin.runBatchAnalysis();
    
    console.log('\n\n[Step 5] Analysis Complete.');
    console.log('------------------------------------------------');
    console.log('📊 Result Summary:', JSON.stringify(result, null, 2));

    // 5. Final Verification
    if (result.success && result.processedCount > 0) {
        console.log('\n[Step 6] Verifying Disk Content...');
        // Wait a bit for async persistence
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const readRes = await Filesystem.readFile({
            path: LEDGER_FILE_PATH,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
        });
        const ledger = JSON.parse(readRes.data as string);
        
        // Count how many have ai_category
        let aiCount = 0;
        Object.values(ledger.records).forEach((tx: any) => {
            if (tx.ai_category) aiCount++;
        });
        
        console.log(`✅ Verification Passed: Found ${aiCount} transactions with 'ai_category' in file.`);
    } else {
        console.log('\n⚠️ No transactions processed. Check if you have unverified transactions in the ledger.');
    }

  } catch (e) {
    console.error('\n❌ Test Failed:', e);
    process.exit(1);
  }
}

main();
