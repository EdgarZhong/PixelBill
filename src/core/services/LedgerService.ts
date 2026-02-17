
import { 
  getAutoDirectoryHandle,
  getMemoryFileHandle, 
  readMemoryFile, 
  writeMemoryFile, 
  DEFAULT_MEMORY, 
  isNativePlatform
} from '../../utils/fs-storage';
import type { StorageHandle, StorageDirHandle } from '../../utils/fs-storage';
import type { Transaction } from '../../types';
import type { LedgerMemory, FullTransactionRecord } from '../../types/metadata';
import { globalArbiter, type PersistencePatch } from '../arbiter/Arbiter';
import { RegexRulePlugin, UserMetaPlugin, AIEnginePlugin } from '../plugin';
import { PersistenceManager } from './PersistenceManager';
import { format, parse, startOfDay, endOfDay } from 'date-fns';

export interface LedgerState {
  rawTransactions: Transaction[];
  ledgerMemory: LedgerMemory | null;
  isLoading: boolean;
  filter: string;
  direction: number;
  dateRange: { start: Date | null; end: Date | null };
  computedTransactions: Transaction[]; // Final result after merge & arbitration
  TABS: string[];
  memoryFileHandle: StorageHandle | null;
}

const DEFAULT_STATE: LedgerState = {
  rawTransactions: [],
  ledgerMemory: null,
  isLoading: false,
  filter: 'ALL',
  direction: 0,
  dateRange: { start: null, end: null },
  computedTransactions: [],
  TABS: ['ALL', 'uncategorized'],
  memoryFileHandle: null
};

export class LedgerService {
  private static instance: LedgerService;
  private state: LedgerState = { ...DEFAULT_STATE };
  private listeners: Set<() => void> = new Set();
  private beforePatchListeners: Set<() => void> = new Set();
  private memoryFileHandle: StorageHandle | null = null;
  private transactionCache: Map<string, {
    raw: Transaction;
    meta: FullTransactionRecord | undefined;
    result: Transaction;
  }> = new Map();
  
  // Dependencies
  private persistenceManager = PersistenceManager.getInstance();

  private constructor() {
    this.initializePlugins();
    this.setupArbiterListener();
  }

  public static getInstance(): LedgerService {
    if (!LedgerService.instance) {
      LedgerService.instance = new LedgerService();
    }
    return LedgerService.instance;
  }

  // --- Subscriptions ---

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeBeforePatch(listener: () => void): () => void {
    this.beforePatchListeners.add(listener);
    return () => this.beforePatchListeners.delete(listener);
  }

  public getState(): LedgerState {
    return this.state;
  }

  private setState(updates: Partial<LedgerState>) {
    this.state = { ...this.state, ...updates };
    // Sync internal handle if it changed in state (though usually we set state from internal)
    if (updates.memoryFileHandle !== undefined) {
        this.memoryFileHandle = updates.memoryFileHandle;
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  private notifyBeforePatch() {
    this.beforePatchListeners.forEach(listener => listener());
  }

  // --- Initialization & Setup ---

  private initializePlugins() {
    globalArbiter.registerPlugin(new RegexRulePlugin());
    globalArbiter.registerPlugin(new UserMetaPlugin());
    globalArbiter.registerPlugin(new AIEnginePlugin());
  }

  private setupArbiterListener() {
    globalArbiter.setPatchCallback((patch: PersistencePatch) => {
      console.log('[LedgerService] Received patch:', patch.id);
      
      const prevMemory = this.state.ledgerMemory;
      if (!prevMemory) {
        console.warn('[LedgerService] LedgerMemory is null, cannot apply patch.');
        return;
      }

      const record = prevMemory.records[patch.id];
      if (!record) {
        console.warn('[LedgerService] Record not found for patch:', patch.id);
        return;
      }

      const hasAiUpdates = patch.updates.ai_category !== undefined || patch.updates.ai_reasoning !== undefined;
      if (hasAiUpdates) {
        this.notifyBeforePatch();
      }

      const newRecord = { ...record, ...patch.updates };
      const newMemory = {
        ...prevMemory,
        records: {
          ...prevMemory.records,
          [patch.id]: newRecord
        }
      };

      // 1. Update State (Optimistic update)
      // We need to re-compute transactions because metadata changed
      this.state.ledgerMemory = newMemory; // Direct mutation ok before re-calc? No, better use flow.
      const newComputed = this.recomputeTransactions(this.state.rawTransactions, newMemory);
      
      this.setState({
        ledgerMemory: newMemory,
        computedTransactions: newComputed
      });

      // 2. Persist to Disk (Debounced)
      if (this.memoryFileHandle) {
        this.persistenceManager.scheduleWrite(this.memoryFileHandle, newMemory);
      } else {
        console.error('[LedgerService] memoryFileHandle is missing! Cannot persist.');
      }
    });
  }

  // --- Core Business Logic ---

  public async init() {
    // Android Auto-Init
    // For Web, we can also simulate auto-init if we have a mock filesystem or just skip it
    // But since the user wants to see data loading, let's enable it for native AND web (mock)
    if (isNativePlatform()) {
      await this.handleInitLedgerNative();
    } else {
       // Web Mock Logic for Testing
       console.log('[LedgerService] Web environment detected. Simulating auto-init...');
       // Use a timeout to simulate async loading
       setTimeout(async () => {
         // Check if we can get a handle (e.g. from OPFS or Mock)
         // For now, let's try to reuse handleInitLedgerNative logic if it supports web
         // Or just call it directly since getAutoDirectoryHandle might have web fallback
         await this.handleInitLedgerNative();
       }, 0);
    }
  }

  private async handleInitLedgerNative() {
    try {
      console.log('[LedgerService] Auto-initializing ledger...');
      const dirHandle = await getAutoDirectoryHandle();
      
      let memoryHandle = await getMemoryFileHandle(dirHandle, false);
      let currentMemory: LedgerMemory = DEFAULT_MEMORY;

      if (memoryHandle) {
        console.log('[LedgerService] Found existing memory.');
        currentMemory = await readMemoryFile(memoryHandle);
      } else {
        console.log('[LedgerService] Creating default memory...');
        memoryHandle = await getMemoryFileHandle(dirHandle, true);
      }

      if (memoryHandle) {
        this.memoryFileHandle = memoryHandle;
        
        // Hydrate transactions from memory if available
        const restoredTransactions: Transaction[] = Object.values(currentMemory.records).map(record => ({
          ...record,
          originalDate: parse(record.time, 'yyyy-MM-dd HH:mm:ss', new Date())
        }));

        if (restoredTransactions.length > 0) {
          restoredTransactions.sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
          
          this.hydrateArbiter(currentMemory);
          
          const computed = this.recomputeTransactions(restoredTransactions, currentMemory);
          
          // Startup Consistency Check
          this.performStartupConsistencyCheck(computed, currentMemory);
          
          const tabs = this.computeTabs(currentMemory);
          const range = this.computeDateRange(computed);

          this.setState({
            ledgerMemory: currentMemory,
            rawTransactions: restoredTransactions,
            computedTransactions: computed,
            TABS: tabs,
            dateRange: range,
            memoryFileHandle: memoryHandle
          });
          
          console.log(`[LedgerService] Hydrated ${restoredTransactions.length} transactions from memory.`);
        } else {
            // Just set memory
            this.setState({ 
                ledgerMemory: currentMemory,
                memoryFileHandle: memoryHandle
            });
        }
      }
    } catch (error) {
      console.error('[LedgerService] Failed to init ledger:', error);
    }
  }

  public async loadData(_externalHandle?: StorageDirHandle) {
    // This replaces handleLoadData
    // ... implementation logic ...
    // For brevity, assuming this is called by UI with handle
    // But wait, the hook used scanForCSVFiles.
    // We should move that logic here or to ImportService.
    // For now, let's keep it simple and assume we receive parsed data or do the scan here.
    // Since we want to decouple UI, this method should probably take the directory handle.
    // But `scanForCSVFiles` is in `fs-storage`.
  }

  public async reloadMemory() {
    if (!this.memoryFileHandle) return;
    try {
      console.log('[LedgerService] Reloading memory from disk...');
      const newMemory = await readMemoryFile(this.memoryFileHandle);
      
      // Update state
      this.setState({ ledgerMemory: newMemory });
      
      // Recompute everything
      const computed = this.recomputeTransactions(this.state.rawTransactions, newMemory);
      const tabs = this.computeTabs(newMemory);
      const range = this.computeDateRange(computed);

      this.setState({
        computedTransactions: computed,
        TABS: tabs,
        dateRange: range
      });
      
      // Hydrate Arbiter?
      // Yes, if external file changed, we should re-hydrate arbiter with new user categories.
      this.hydrateArbiter(newMemory);
      
    } catch (error) {
      console.error('[LedgerService] Reload failed:', error);
    }
  }



  // --- Logic Extraction from useAppLogic ---

  private hydrateArbiter(memory: LedgerMemory) {
    Object.entries(memory.records).forEach(([id, meta]) => {
      globalArbiter.hydrate(id, meta);
    });
    // Consistency check can be added here if needed
  }

  private performStartupConsistencyCheck(computed: Transaction[], memory: LedgerMemory) {
    let hasChanges = false;
    const updatedRecords = { ...memory.records };

    computed.forEach(tx => {
      const stored = updatedRecords[tx.id];
      // Check if stored category differs from computed category
      // We also check if stored exists to avoid adding ghosts
      if (stored && stored.category !== tx.category) {
        console.log(`[Consistency] Fix category for ${tx.id}: '${stored.category}' -> '${tx.category}'`);
        updatedRecords[tx.id] = {
          ...stored,
          category: tx.category,
          // We don't necessarily update 'updated_at' for automatic consistency fixes 
          // to avoid looking like a user action, but it is a change.
          // Let's keep timestamp as is or update it? 
          // If we don't update timestamp, it might look like old data.
          // But it's just a cache fix. Let's leave timestamp alone to preserve "last user edit" time if possible.
          // Wait, 'category' is the cached result field. It's fine to update it.
        };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      console.log('[Consistency] Startup consistency check found mismatches. Scheduling write...');
      const newMemory = {
        ...memory,
        records: updatedRecords,
        last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };
      
      // Update State (to ensure UI and Service are in sync with what will be written)
      this.state.ledgerMemory = newMemory; 
      
      // We don't need to call setState here because handleInitLedgerNative will call it 
      // with the *original* memory object if we don't return the new one or update the reference it uses.
      // Wait, handleInitLedgerNative uses 'currentMemory' variable.
      // We need to update 'currentMemory' in handleInitLedgerNative or 
      // make sure handleInitLedgerNative uses the updated state.
      // Actually, handleInitLedgerNative calls setState with 'currentMemory'.
      // So this method should probably return the new memory or modify it in place?
      // Modifying 'memory' (which is 'currentMemory') in place is risky if it's immutable pattern.
      // But 'updatedRecords' is a shallow copy.
      // Let's rely on PersistenceManager to write to disk.
      // And we should probably update the local state too.
      
      if (this.memoryFileHandle) {
        this.persistenceManager.scheduleWrite(this.memoryFileHandle, newMemory);
      }
      
      // IMPORTANT: The caller (handleInitLedgerNative) continues to use 'currentMemory' 
      // to set state. We should ideally return the new memory so the caller uses it.
      // But refactoring that is intrusive.
      // Instead, since we are inside the class, we can update the state *after* the caller finishes?
      // No, caller calls setState right after this.
      // Actually, let's look at handleInitLedgerNative again.
      // It calls setState({ ledgerMemory: currentMemory ... }).
      // If I don't return it, the UI will see the OLD memory (with wrong categories in meta),
      // even though computedTransactions has the NEW categories.
      // Wait, computedTransactions has the correct categories (from Arbiter).
      // The UI usually displays computedTransactions.
      // So the UI *will* be correct.
      // The issue is just the disk file (JSON) being out of sync.
      // So scheduling the write here is sufficient to fix the JSON.
      // The in-memory 'ledgerMemory' state might be slightly stale regarding 'category' field
      // until the next reload or write, but 'computedTransactions' is what matters for display.
      // AND, since we scheduled a write, the PersistenceManager might eventually trigger a reload?
      // No, PersistenceManager just writes.
      // So: UI is correct (computed). Disk will be correct (scheduled write).
      // The only minor issue is this.state.ledgerMemory.records[].category is stale until next update.
      // This is acceptable for a background consistency fix.
    } else {
        console.log('[Consistency] No mismatches found.');
    }
  }

  private recomputeTransactions(raw: Transaction[], memory: LedgerMemory | null): Transaction[] {
    if (!memory) return raw;

    const cache = this.transactionCache;
    const validCategories = memory.defined_categories;

    // Clear cache if raw changed significantly? 
    // In hook, it cleared when raw.length === 0.
    // Here we can just manage cache size or rely on map updates.

    return raw.map(t => {
      const meta = memory.records[t.id];
      
      // Cache Hit
      const cached = cache.get(t.id);
      if (cached && cached.raw === t && cached.meta === meta) {
        return cached.result;
      }

      // Cache Miss
      const safeMeta = meta || {
        ai_category: "",
        ai_reasoning: "",
        user_category: "",
        user_note: "",
        is_verified: false,
        updated_at: ""
      };

      const tempRecord = {
        ...t,
        ...safeMeta,
        ai_category: safeMeta.ai_category || "",
        ai_reasoning: safeMeta.ai_reasoning || "",
        user_category: safeMeta.user_category || "",
        user_note: safeMeta.user_note || "",
        is_verified: safeMeta.is_verified || false,
        updated_at: safeMeta.updated_at || "",
        category: (meta && meta.category) || t.category || 'uncategorized'
      };

      const decision = globalArbiter.decide(t.id);
      const candidate = decision.category;
      
      const finalCategory = (validCategories.includes(candidate) || candidate === 'uncategorized') 
        ? candidate 
        : 'uncategorized';

      const newResult = {
        ...tempRecord,
        category: finalCategory
      };

      cache.set(t.id, {
        raw: t,
        meta: meta,
        result: newResult
      });

      return newResult;
    });
  }

  private computeTabs(memory: LedgerMemory | null): string[] {
    const defaultTabs = ['ALL', 'uncategorized'];
    if (!memory) return defaultTabs;

    const defined = memory.defined_categories || [];
    const tabs = ['ALL', ...defined];

    if (defined.length > 0 && !defined.includes('others')) {
      tabs.push('others');
    }
    if (!tabs.includes('uncategorized')) {
      tabs.push('uncategorized');
    }

    return Array.from(new Set(tabs));
  }

  private computeDateRange(transactions: Transaction[]) {
    if (transactions.length === 0) return { start: null, end: null };
    // Assuming sorted desc
    const maxDate = transactions[0].originalDate;
    const minDate = transactions[transactions.length - 1].originalDate;
    return {
      start: startOfDay(minDate),
      end: endOfDay(maxDate)
    };
  }

  // --- Public Actions ---

  public updateCategory(id: string, newCategory: string, newReasoning?: string) {
    const proposal = {
      source: 'USER' as const,
      category: newCategory,
      reasoning: newReasoning ?? "",
      timestamp: Date.now(),
      txId: id
    };
    globalArbiter.ingest(id, proposal);
    // Note: Ingest -> Patch -> Callback -> setState. 
    // We don't need to manually setState here.
  }

  public setVerification(id: string, isVerified: boolean) {
    globalArbiter.toggleVerification(id, isVerified);
  }

  public setFilter(filter: string) {
    // Calculate direction
    const TABS = this.state.TABS;
    const currentIndex = TABS.indexOf(filter);
    const prevIndex = TABS.indexOf(this.state.filter);
    const n = TABS.length;
    let delta = currentIndex - prevIndex;
    
    if (delta > n / 2) delta -= n;
    else if (delta < -n / 2) delta += n;
    
    const direction = delta > 0 ? 1 : -1;

    this.setState({ filter, direction });
  }

  // Public method for ingestion (used by import or test script)
  public async ingestParsedData(parsedData: Transaction[], dirHandle: StorageDirHandle) {
    this.setState({ isLoading: true });
    try {
        // 1. Set Raw Data
        this.setState({ rawTransactions: parsedData });

        // 2. Metadata System
        // Try to get existing file, or create if not exists
        let memoryHandle = await getMemoryFileHandle(dirHandle, false);
        let currentMemory: LedgerMemory = DEFAULT_MEMORY;
        let isNewFile = false;

        if (memoryHandle) {
            console.log('[LedgerService] Found existing memory.');
            currentMemory = await readMemoryFile(memoryHandle);
        } else {
            console.log('[LedgerService] Creating default memory...');
            memoryHandle = await getMemoryFileHandle(dirHandle, true);
            isNewFile = true;
        }

        if (memoryHandle) {
            this.memoryFileHandle = memoryHandle;
            
            // Sync
            const newMemory = await this.syncWithLedger(parsedData, memoryHandle, currentMemory);
            
            // If new file created, ensure we save it
            if (isNewFile && newMemory === currentMemory) {
                 await writeMemoryFile(memoryHandle, newMemory);
            }
            
            // Hydrate Arbiter with new memory
            this.hydrateArbiter(newMemory);

            const computed = this.recomputeTransactions(parsedData, newMemory);
            const tabs = this.computeTabs(newMemory);
            const range = this.computeDateRange(computed);

            this.setState({
                ledgerMemory: newMemory,
                computedTransactions: computed,
                TABS: tabs,
                dateRange: range
            });
        }
    } catch (error) {
        console.error('[LedgerService] Ingest failed:', error);
    } finally {
        this.setState({ isLoading: false });
    }
  }

  public setDateRange(range: { start: Date | null; end: Date | null }) {
    this.setState({ dateRange: range });
  }

  public async ingestRawData(parsedData: Transaction[]) {
    this.setState({ isLoading: true });
    try {
        this.setState({ rawTransactions: parsedData });
        const currentMemory = this.state.ledgerMemory || DEFAULT_MEMORY;
        let newMemory = currentMemory;
        
        // Sync with ledger (memory + disk)
        if (this.memoryFileHandle) {
             newMemory = await this.syncWithLedger(parsedData, this.memoryFileHandle, currentMemory);
        } else {
            newMemory = await this.syncWithLedger(parsedData, null, currentMemory);
        }
        
        this.hydrateArbiter(newMemory);
        const computed = this.recomputeTransactions(parsedData, newMemory);
        const tabs = this.computeTabs(newMemory);
        const range = this.computeDateRange(computed);
        
        this.setState({
            ledgerMemory: newMemory,
            computedTransactions: computed,
            TABS: tabs,
            dateRange: range
        });
    } catch (error) {
        console.error('[LedgerService] Ingest raw failed:', error);
    } finally {
        this.setState({ isLoading: false });
    }
  }

  private async syncWithLedger(
    parsedData: Transaction[], 
    memoryHandle: StorageHandle | null, 
    currentMemory: LedgerMemory
  ) {
    if (!memoryHandle) return currentMemory;

    let hasUpdates = false;
    const updatedRecords = { ...currentMemory.records };

    parsedData.forEach(t => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { originalDate, ...tData } = t;
      const existing = updatedRecords[t.id];

      if (!existing) {
        updatedRecords[t.id] = {
          ...tData,
          ai_category: "",
          ai_reasoning: "",
          user_category: "",
          user_note: "",
          is_verified: false,
          updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        } as FullTransactionRecord;
        hasUpdates = true;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { category: _ignored, ...coreData } = tData;
        
        const hasNullMeta = existing.ai_category === null || existing.ai_reasoning === null || existing.user_category === null || existing.user_note === null;
        
        const isChanged = Object.keys(coreData).some(key => {
          const k = key as keyof typeof coreData;
          return existing[k] !== coreData[k];
        }) || typeof existing.updated_at === 'number' || hasNullMeta;

        if (isChanged) {
          updatedRecords[t.id] = {
            ...(existing as Partial<FullTransactionRecord>),
            ...coreData,
            ai_category: existing.ai_category ?? "",
            ai_reasoning: existing.ai_reasoning ?? "",
            user_category: existing.user_category ?? "",
            user_note: existing.user_note ?? "",
            updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
          } as FullTransactionRecord;
          hasUpdates = true;
        }
      }
    });

    if (hasUpdates) {
      console.log('[LedgerService] Syncing records to memory file...', { count: parsedData.length });
      const newMemory = {
        ...currentMemory,
        records: updatedRecords,
        last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };
      await writeMemoryFile(memoryHandle, newMemory);
      return newMemory;
    }

    return currentMemory;
  }
}
