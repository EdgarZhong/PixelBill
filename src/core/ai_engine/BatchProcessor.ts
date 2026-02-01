import { AsyncMutex } from '../../utils/AsyncMutex';
import { LLMClient } from '../llm_service/LLMClient';
import { ConfigManager } from '../config/ConfigManager';
import { PromptBuilder } from '../llm_service/prompt/PromptBuilder';
import { 
  getAutoDirectoryHandle, 
  getMemoryFileHandle, 
  readMemoryFile, 
  writeMemoryFile 
} from '../../utils/fs-storage';
import type { LedgerMemory, FullTransactionRecord } from '../../types/metadata';
import type { AIStatus, AIProgress, ProcessingResult } from './types';
import { format, parseISO, compareDesc } from 'date-fns';

export class BatchProcessor {
  private static instance: BatchProcessor;
  private mutex = new AsyncMutex();
  private status: AIStatus = 'IDLE';
  private progress: AIProgress = { total: 0, current: 0, currentDate: '' };
  private listeners: ((status: AIStatus, progress: AIProgress) => void)[] = [];
  private shouldStop = false;

  private constructor() {}

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }

  public subscribe(listener: (status: AIStatus, progress: AIProgress) => void) {
    this.listeners.push(listener);
    // Emit current state immediately
    listener(this.status, this.progress);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private updateState(status: AIStatus, progress?: Partial<AIProgress>) {
    this.status = status;
    if (progress) {
      this.progress = { ...this.progress, ...progress };
    }
    this.listeners.forEach(l => l(this.status, this.progress));
  }

  public stop() {
    this.shouldStop = true;
  }

  /**
   * Run the batch processing logic.
   * Scans the ledger for days with unclassified transactions and processes them.
   */
  public async run(): Promise<ProcessingResult> {
    if (this.status === 'ANALYZING') {
      throw new Error('Processor is already running');
    }

    this.shouldStop = false;
    this.updateState('ANALYZING', { total: 0, current: 0, currentDate: '' });

    return this.mutex.dispatch(async () => {
      try {
        // 1. Initialize dependencies
        const configManager = ConfigManager.getInstance();
        const config = await configManager.getConfig();
        
        const apiKey = config.apiKey;
        const baseUrl = config.baseUrl || 'https://api.deepseek.com';
        const model = config.model || 'deepseek-chat';
        
        if (!apiKey) {
          // For testing purposes, we might proceed if we want to test flow, but generally strict.
          // throw new Error('API Key not configured');
          // Actually, let's keep it strict.
          throw new Error('API Key not configured');
        }

        const client = new LLMClient({ apiKey, baseUrl, model });

        // 2. Load Ledger
        // Note: We re-read the file for each day in a real implementation to support optimistic locking,
        // but for now we read once to get the list of days, then read-lock-write for each day.
        const dirHandle = await getAutoDirectoryHandle();
        const fileHandle = await getMemoryFileHandle(dirHandle, true);
        if (!fileHandle) throw new Error('Could not access ledger file');
        
        let memory = await readMemoryFile(fileHandle);

        // 3. Group transactions by date
        const txs = Object.values(memory.records) as FullTransactionRecord[];
        const txsByDate: Record<string, FullTransactionRecord[]> = {};
        
        txs.forEach(tx => {
          const dateStr = format(parseISO(tx.time), 'yyyy-MM-dd');
          if (!txsByDate[dateStr]) txsByDate[dateStr] = [];
          txsByDate[dateStr].push(tx);
        });

        // 4. Identify target days (Reverse Order)
        const targetDates = Object.keys(txsByDate)
          .filter(date => {
            const dayTxs = txsByDate[date];
            // Process if any transaction is not verified AND (has no AI category OR has empty category)
            return dayTxs.some(tx => !tx.is_verified && (!tx.ai_category || !tx.category));
          })
          .sort((a, b) => compareDesc(parseISO(a), parseISO(b))); // Newest first

        this.updateState('ANALYZING', { total: targetDates.length, current: 0 });
        const result: ProcessingResult = { success: true, processedCount: 0, errors: [] };

        // 5. Process each day
        for (const dateStr of targetDates) {
          if (this.shouldStop) break;

          this.updateState('ANALYZING', { current: result.processedCount + 1, currentDate: dateStr });
          
          try {
            const dayTxs = txsByDate[dateStr];
            
            // Build Prompt
            const messages = await PromptBuilder.build(dayTxs, parseISO(dateStr));
            
            // Call LLM
            const responseText = await client.chat(messages);
            
            // Parse Response
            const aiResult = JSON.parse(responseText);
            if (!aiResult.results || !Array.isArray(aiResult.results)) {
              throw new Error('Invalid AI response structure');
            }

            // Write Back (Critical Section)
            // We re-read the memory to ensure we have the latest version (Optimistic Locking simulation)
            memory = await readMemoryFile(fileHandle);
            let updatesCount = 0;

            aiResult.results.forEach((item: any) => {
              const txId = item.id;
              const tx = memory.records[txId] as FullTransactionRecord;
              
              if (tx && !tx.is_verified) {
                // Only update if not verified by user
                tx.ai_category = item.category;
                tx.ai_reasoning = item.reasoning;
                // We do NOT update the main 'category' field directly, 
                // we leave that to the Arbiter/User to confirm (or Auto-Accept logic if enabled later).
                // But wait, the plan says: "AIProcessor (writes Metadata) -> pixelbill.json"
                // And "AIPlugin ... simply reads ai_category".
                // So we write to ai_category. 
                // If the system is set to auto-apply, Arbiter will pick it up.
                updatesCount++;
              }
            });

            if (updatesCount > 0) {
              await writeMemoryFile(fileHandle, memory);
            }
            
            result.processedCount++;

          } catch (e: any) {
            console.error(`Failed to process date ${dateStr}:`, e);
            result.errors.push(`${dateStr}: ${e.message}`);
          }
        }

        this.updateState('IDLE');
        return result;

      } catch (e: any) {
        this.updateState('ERROR');
        return { success: false, processedCount: 0, errors: [e.message] };
      }
    });
  }
}
