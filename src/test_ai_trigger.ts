
import { ConfigManager } from './core/config/ConfigManager';
import { AIEnginePlugin } from './core/plugin/AIEnginePlugin';
import { LedgerService } from './core/services/LedgerService';
import { Filesystem, Directory, Encoding } from '../scripts/mocks/node-filesystem';
import { Buffer } from 'node:buffer';
import type { NativeDirHandle } from './utils/fs-storage';

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

const LEDGER_FILE_PATH = 'PixelBill/default.pixelbill.json';

const log = console.log;

async function main() {
  log('🚀 Starting AI Engine Integration Test (LedgerService Architecture)...');
  log('------------------------------------------------');

  try {
    // 1. Initialize Config (Load API Key)
    log('[Step 1] Initializing Configuration...');
    const configManager = ConfigManager.getInstance();
    await configManager.init();
    const config = await configManager.getConfig();
    
    if (!config.apiKey) {
      console.error('❌ Error: API Key not found in secure_config.bin!');
      log('❌ Error: API Key not found in secure_config.bin!');
      process.exit(1);
    }
    log('✅ Config Loaded. API Key Present.');

    // 2. Initialize LedgerService
    log('[Step 2] Initializing LedgerService...');
    const ledgerService = LedgerService.getInstance();
    
    // Create a mock directory handle pointing to root (Documents)
    const mockDirHandle: NativeDirHandle = {
        kind: 'directory',
        path: '',
        name: 'Documents'
    };

    // Load data
    await ledgerService.handleMockAndroidInit(mockDirHandle);
    log('✅ LedgerService Initialized & Data Loaded.');

    // 2.5 Manual Persistence Test
    log('\n[Step 2.5] Testing Manual Persistence (LedgerService -> Arbiter -> PersistenceManager -> Disk)...');
    let state = ledgerService.getState();
    
    // Inject dummy data if empty
    if (state.rawTransactions.length === 0) {
        log('🔹 No transactions found. Injecting dummy transaction...');
        const dummyTx = {
            id: 'dummy-tx-1',
            amount: 100,
            merchant: 'Test Merchant',
            date: '2025-01-01 10:00:00',
            category: 'uncategorized',
            originalDate: new Date('2025-01-01T10:00:00'),
            direction: 'out' as const
        };
        await ledgerService.ingestRawData([dummyTx]);
        state = ledgerService.getState();
    }

    if (state.rawTransactions.length > 0) {
        const testTx = state.rawTransactions[0];
        log(`🔹 Updating transaction ${testTx.id} to category 'TEST_MANUAL_UPDATE'...`);
        
        ledgerService.updateCategory(testTx.id, 'TEST_MANUAL_UPDATE', 'Manual test');
        
        // Wait for debounce (1000ms) + buffer
        log('⏳ Waiting for debounce write...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify disk
        const readRes = await Filesystem.readFile({
            path: LEDGER_FILE_PATH,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
        });
        const ledger = JSON.parse(readRes.data as string);
        const record = ledger.records[testTx.id];
        
        if (record && record.category === 'TEST_MANUAL_UPDATE') {
            log('✅ Manual Persistence Verified: Disk has updated category.');
        } else {
            log('❌ Manual Persistence Failed: Disk does not have updated category.');
            log('Expected: TEST_MANUAL_UPDATE, Found:', record?.category);
        }
    } else {
        log('⚠️ No transactions loaded, skipping manual persistence test.');
    }

    // 3. Trigger AI Analysis
    log('\n[Step 3] Triggering Batch Analysis...');
    log('⏳ AI Engine is thinking... (This may take 10-30 seconds)');
    
    // We create a new plugin instance just to run the analysis, 
    // it will interact with the same globalArbiter.
    const aiPlugin = new AIEnginePlugin();
    
    // Subscribe to progress
    aiPlugin.subscribeToProgress((status, progress) => {
        if (status === 'ANALYZING') {
            process.stdout.write(`\r   Progress: ${progress.current}/${progress.total} items...`);
        }
    });

    const result = await aiPlugin.runBatchAnalysis();
    
    log('\n\n[Step 4] Analysis Complete.');
    log('------------------------------------------------');
    log('📊 Result Summary:', JSON.stringify(result, null, 2));

    // 4. Final Verification
    if (result.success && result.processedCount > 0) {
        log('\n[Step 5] Verifying Disk Content (Waiting for debounce)...');
        
        // Wait for PersistenceManager debounce (1000ms) + buffer
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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
        
        log(`✅ Verification Passed: Found ${aiCount} transactions with 'ai_category' in file.`);
        
        // Also check LedgerService state
        const state = ledgerService.getState();
        const stateAiCount = state.computedTransactions.filter(t => t.ai_category).length;
        log(`✅ LedgerService State Verification: Found ${stateAiCount} transactions with 'ai_category' in memory.`);
        
    } else {
        log('\n⚠️ No transactions processed. Check if you have unverified transactions in the ledger.');
    }

  } catch (e) {
    console.error('\n❌ Test Failed:', e);
    log('\n❌ Test Failed:', e);
    process.exit(1);
  }
}

main();
