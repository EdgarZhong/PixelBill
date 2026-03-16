
import {
  getMemoryFileHandle,
  readMemoryFile,
  writeMemoryFile,
  DEFAULT_MEMORY
} from '../../utils/fs-storage';
import type { StorageHandle, StorageDirHandle } from '../../utils/fs-storage';
import type { Transaction } from '../../types';
import type { LedgerMemory, FullTransactionRecord } from '../../types/metadata';
import { globalArbiter, type PersistencePatch } from '../arbiter/Arbiter';
import { RegexRulePlugin, UserMetaPlugin, AIEnginePlugin } from '../plugin';
import { PersistenceManager } from './PersistenceManager';
import { ExampleStore } from './ExampleStore';
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
  private pendingPatches: PersistencePatch[] = [];
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
        this.pendingPatches.push(patch);
        return;
      }

      this.applyPatch(patch, prevMemory);
    });

    // 设置实例库写入回调 - 当用户修正分类或锁定时触发
    globalArbiter.setExampleStoreCallback(async ({ txId, isCorrection }) => {
      const ledgerName = this.getCurrentLedgerName();
      const memory = this.state.ledgerMemory;

      if (!ledgerName || !memory) {
        console.warn('[LedgerService] Cannot write to example store: no ledger loaded');
        return;
      }

      const record = memory.records[txId];
      if (!record) {
        console.warn('[LedgerService] Cannot write to example store: record not found', txId);
        return;
      }

      try {
        await ExampleStore.addOrUpdate(ledgerName, record, isCorrection);
        console.log(`[LedgerService] Example store updated for ${txId}, isCorrection=${isCorrection}`);
      } catch (e) {
        console.error('[LedgerService] Failed to write to example store:', e);
      }
    });
  }

  /**
   * 获取当前账本名称
   * 从 memoryFileHandle 的文件名中提取
   */
  private getCurrentLedgerName(): string | null {
    if (!this.memoryFileHandle) return null;

    // 文件名格式: {ledgerName}.pixelbill.json
    const fileName = this.memoryFileHandle.name;
    const match = fileName.match(/^(.+)\.pixelbill\.json$/);
    return match ? match[1] : null;
  }

  private applyPatch(patch: PersistencePatch, prevMemory: LedgerMemory) {
    const record = prevMemory.records[patch.id];
    if (!record) {
      console.warn('[LedgerService] Record not found for patch:', patch.id);
      return prevMemory;
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

    this.state.ledgerMemory = newMemory;
    const newComputed = this.recomputeTransactions(this.state.rawTransactions, newMemory);
    
    this.setState({
      ledgerMemory: newMemory,
      computedTransactions: newComputed
    });

    if (this.memoryFileHandle) {
      this.persistenceManager.scheduleWrite(this.memoryFileHandle, newMemory);
    } else {
      console.error('[LedgerService] memoryFileHandle is missing! Cannot persist.');
    }

    return newMemory;
  }

  private flushPendingPatches() {
    const currentMemory = this.state.ledgerMemory;
    if (!currentMemory || this.pendingPatches.length === 0) return;
    let memory = currentMemory;
    const patches = this.pendingPatches;
    this.pendingPatches = [];
    patches.forEach(patch => {
      memory = this.applyPatch(patch, memory);
    });
  }

  // --- Core Business Logic ---

  // Removed init() and handleInitLedgerNative() as they are now handled by LedgerManager
  // LedgerService is now purely a content manager, not a resource manager.

  public async loadData(_externalHandle?: StorageDirHandle) {
    void _externalHandle;
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
      this.flushPendingPatches();
      
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

      const shouldFreezeCategory = safeMeta.is_verified && (!safeMeta.user_category || safeMeta.user_category.trim() === '');
      const candidate = shouldFreezeCategory ? tempRecord.category : globalArbiter.decide(t.id).category;
      
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

  public updateUserNote(id: string, userNote: string) {
    // 仅更新用户备注，避免触发 user_category 写入
    globalArbiter.updateUserNote(id, userNote);
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
            this.transactionCache.clear();
            globalArbiter.clearProposals(parsedData.map(tx => tx.id));
            
            // Sync
            const newMemory = await this.syncWithLedger(parsedData, memoryHandle, currentMemory, true);
            
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
            this.flushPendingPatches();
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
        this.transactionCache.clear();
        globalArbiter.clearProposals(parsedData.map(tx => tx.id));
        
        // Sync with ledger (memory + disk)
        if (this.memoryFileHandle) {
             newMemory = await this.syncWithLedger(parsedData, this.memoryFileHandle, currentMemory, true);
        } else {
            newMemory = await this.syncWithLedger(parsedData, null, currentMemory, true);
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
        this.flushPendingPatches();
    } catch (error) {
        console.error('[LedgerService] Ingest raw failed:', error);
    } finally {
        this.setState({ isLoading: false });
    }
  }

  private async syncWithLedger(
    parsedData: Transaction[], 
    memoryHandle: StorageHandle | null, 
    currentMemory: LedgerMemory,
    forceUncategorized: boolean = false
  ) {
    if (!memoryHandle) return currentMemory;

    let hasUpdates = false;
    const updatedRecords = { ...currentMemory.records };

    parsedData.forEach(t => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { originalDate, ...tData } = t;
      const existing = updatedRecords[t.id];
      const normalizedCategory = 'uncategorized';

      if (!existing) {
        updatedRecords[t.id] = {
          ...tData,
          category: normalizedCategory,
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
        const shouldResetMeta = forceUncategorized && (
          existing.category !== normalizedCategory ||
          existing.ai_category !== "" ||
          existing.ai_reasoning !== "" ||
          existing.user_category !== "" ||
          existing.user_note !== "" ||
          existing.is_verified !== false
        );
        
        const isChanged = Object.keys(coreData).some(key => {
          const k = key as keyof typeof coreData;
          return existing[k] !== coreData[k];
        }) || typeof existing.updated_at === 'number' || hasNullMeta || shouldResetMeta;

        if (isChanged) {
          updatedRecords[t.id] = {
            ...(existing as Partial<FullTransactionRecord>),
            ...coreData,
            category: forceUncategorized ? normalizedCategory : (existing.category ?? normalizedCategory),
            ai_category: forceUncategorized ? "" : (existing.ai_category ?? ""),
            ai_reasoning: forceUncategorized ? "" : (existing.ai_reasoning ?? ""),
            user_category: forceUncategorized ? "" : (existing.user_category ?? ""),
            user_note: forceUncategorized ? "" : (existing.user_note ?? ""),
            is_verified: forceUncategorized ? false : (existing.is_verified ?? false),
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

  // ============================================
  // 账本加载接口 - Ledger Loading Interface
  // ============================================

  /**
   * 从指定句柄加载账本数据
   * 由 LedgerManager 调用，传入已解析的账本数据
   * @param handle 账本文件句柄
   * @param memory 账本数据（已预先读取）
   */
  public loadFromHandle(handle: StorageHandle, memory: LedgerMemory): void {
    console.log('[LedgerService] Loading from handle...');

    this.memoryFileHandle = handle;
    this.transactionCache.clear();
    globalArbiter.clearAllProposals();

    // 水合 Arbiter
    this.hydrateArbiter(memory);

    // 恢复交易
    const restoredTransactions: Transaction[] = Object.values(memory.records).map(record => ({
      ...record,
      originalDate: parse(record.time, 'yyyy-MM-dd HH:mm:ss', new Date())
    }));

    if (restoredTransactions.length > 0) {
      restoredTransactions.sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
    }

    const computed = this.recomputeTransactions(restoredTransactions, memory);
    const tabs = this.computeTabs(memory);
    const range = this.computeDateRange(computed);

    this.setState({
      ledgerMemory: memory,
      rawTransactions: restoredTransactions,
      computedTransactions: computed,
      TABS: tabs,
      dateRange: range,
      memoryFileHandle: handle
    });

    this.flushPendingPatches();
    console.log('[LedgerService] Loaded', restoredTransactions.length, 'transactions from handle');
  }
}
