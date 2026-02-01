
import { ConfigManager } from '../src/core/config/ConfigManager';
import { AIEnginePlugin } from '../src/core/plugin/AIEnginePlugin';
import { LedgerService } from '../src/core/services/LedgerService';
import { Filesystem, Directory, Encoding } from './mocks/node-filesystem';
import { Buffer } from 'node:buffer';
import type { NativeDirHandle } from '../src/utils/fs-storage';
import { _setNativePlatform, _setFilesystemImpl } from '../src/utils/fs-storage';

// --- Environment Polyfills ---
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

if (!window.atob) {
  window.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}
if (!window.btoa) {
  window.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

const LEDGER_FILE_PATH = 'PixelBill/default.pixelbill.json';
const log = console.log;

async function main() {
  log('🚀 Starting E2E AI Analysis Trigger (Zero-Intrusion Mode)...');
  log('------------------------------------------------');

  try {
    // 0. Configure Mock Environment
    log('[Step 0] Configuring Mock Environment (Android Simulation)...');
    _setNativePlatform(true);
    _setFilesystemImpl(Filesystem);

    // 1. Initialize Config (Load API Key)
    log('[Step 1] Initializing Configuration...');
    const configManager = ConfigManager.getInstance();
    await configManager.init();
    const llmConfig = await configManager.getActiveModelConfig();
    
    if (!llmConfig.apiKey) {
      console.error('❌ Error: API Key not found in secure_config.bin!');
      log('❌ Error: API Key not found in secure_config.bin!');
      process.exit(1);
    }
    log(`✅ Config Loaded. Active Model: ${llmConfig.model}. API Key Present.`);

    // 2. Initialize LedgerService
    log('[Step 2] Initializing LedgerService (Loading data from disk)...');
    const ledgerService = LedgerService.getInstance();
    
    // Create a mock directory handle pointing to root (Documents)
    const mockDirHandle: NativeDirHandle = {
        kind: 'directory',
        path: '',
        name: 'Documents'
    };

    // Load data NATURALLY from disk
    await ledgerService.handleMockAndroidInit(mockDirHandle);
    
    const state = ledgerService.getState();
    const totalTx = state.rawTransactions.length;
    const pendingTx = state.rawTransactions.filter(t => !state.computedTransactions.find(ct => ct.id === t.id)?.category).length; // Rough check, actually LedgerService handles this logic
    
    log(`✅ LedgerService Initialized. Loaded ${totalTx} transactions.`);

    // 3. Trigger AI Analysis
    log('\n[Step 3] Triggering Batch Analysis via AIEnginePlugin...');
    log('⏳ AI Engine is starting. It will read from memory, request LLM, and propose changes...');
    
    // We create a new plugin instance just to run the analysis.
    // Ideally, in the real app, this is instantiated by the App or Arbiter.
    const aiPlugin = new AIEnginePlugin();
    
    // Subscribe to progress for visibility
    aiPlugin.subscribeToProgress((status, progress) => {
        if (status === 'ANALYZING') {
            process.stdout.write(`\r   Progress: ${progress.current}/${progress.total} items...`);
        }
    });

    const startTime = Date.now();
    const result = await aiPlugin.runBatchAnalysis();
    const endTime = Date.now();
    
    log('\n\n[Step 4] Analysis Request Complete.');
    log(`⏱️  Time taken: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    log('------------------------------------------------');
    log('📊 Engine Result Summary:', JSON.stringify(result, null, 2));

    // 4. Persistence Verification
    if (result.success && result.processedCount > 0) {
        log('\n[Step 5] Verifying Disk Persistence (End-to-End)...');
        log('⏳ Waiting for PersistenceManager debounce (approx 2s)...');
        
        // Wait for PersistenceManager debounce (1000ms) + buffer
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        log('📂 Reading file from disk...');
        const readRes = await Filesystem.readFile({
            path: LEDGER_FILE_PATH,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
        });
        const ledger = JSON.parse(readRes.data as string);
        
        // Count how many have ai_category
        let aiCount = 0;
        let categories = new Set<string>();
        
        Object.values(ledger.records).forEach((tx: any) => {
            if (tx.ai_category) {
                aiCount++;
                categories.add(tx.ai_category);
            }
        });
        
        if (aiCount > 0) {
            log(`✅ VERIFICATION PASSED!`);
            log(`   - Found ${aiCount} transactions with 'ai_category' persisted in file.`);
            log(`   - Categories found: ${Array.from(categories).join(', ')}`);
        } else {
             log(`❌ VERIFICATION FAILED: Analysis reported success, but no 'ai_category' found in file.`);
             process.exit(1);
        }

    } else {
        log('\n⚠️ No transactions were processed by AI. This might be because:');
        log('   1. All transactions are already categorized.');
        log('   2. No transactions exist in the source file.');
        log('   3. The AI Engine skipped them due to internal logic.');
    }

  } catch (e) {
    console.error('\n❌ E2E Test Failed:', e);
    process.exit(1);
  }
}

main();
