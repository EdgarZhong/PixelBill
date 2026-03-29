
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
import { classifyTrigger } from '../ai_engine/ClassifyTrigger';
import { normalizeToDateKey } from '../ai_engine/DateNormalizer';

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

      const newMemory = this.applyPatch(patch, prevMemory);

      // 在 applyPatch 之后处理实例库写入，确保获取的是更新后的记录
      // 检查 patch 是否包含 user_category 更新（用户修正分类）
      const hasUserCategoryUpdate = patch.updates.user_category !== undefined && patch.updates.user_category !== '';
      console.log(`[LedgerService] Checking example store write for ${patch.id}:`, {
        hasUserCategoryUpdate,
        user_category: patch.updates.user_category,
        prev_user_category: prevMemory.records[patch.id]?.user_category
      });

      if (hasUserCategoryUpdate) {
        const ledgerName = this.getCurrentLedgerName();
        console.log(`[LedgerService] Ledger name: ${ledgerName}`);

        if (ledgerName) {
          const updatedRecord = newMemory.records[patch.id];
          if (updatedRecord) {
            // 判断是否为修正：如果有 AI 分类且 AI 分类与新分类不同，视为修正
            const prevRecord = prevMemory.records[patch.id];
            const newCategory = patch.updates.user_category;
            const aiCategory = patch.updates.ai_category !== undefined
              ? patch.updates.ai_category
              : prevRecord?.ai_category;
            const isCorrection = !!aiCategory && aiCategory !== newCategory;

            console.log(`[LedgerService] Writing to example store:`, {
              txId: patch.id,
              category: updatedRecord.category,
              aiCategory,
              userCategory: patch.updates.user_category,
              isCorrection
            });

            ExampleStore.addOrUpdate(ledgerName, updatedRecord, isCorrection)
              .then(() => {
                console.log(`[LedgerService] Example store updated for ${patch.id}, isCorrection=${isCorrection}`);
              })
              .catch(e => {
                console.error('[LedgerService] Failed to write to example store:', e);
              });
          } else {
            console.warn(`[LedgerService] Updated record not found in newMemory: ${patch.id}`);
          }
        } else {
          console.warn('[LedgerService] Cannot write to example store: no ledger name');
        }
      }

      // 处理锁定确认时的实例库写入
      // 只要 is_verified 被设为 true，就写入实例库（无论是否同时更新 user_category）
      if (patch.updates.is_verified === true && !hasUserCategoryUpdate) {
        const ledgerName = this.getCurrentLedgerName();
        if (ledgerName) {
          const updatedRecord = newMemory.records[patch.id];
          if (updatedRecord) {
            // 锁定确认不是修正，AI 分对时保留 ai_reasoning
            ExampleStore.addOrUpdate(ledgerName, updatedRecord, false)
              .then(() => {
                console.log(`[LedgerService] Example store updated for lock confirmation ${patch.id}`);
              })
              .catch(e => {
                console.error('[LedgerService] Failed to write to example store:', e);
              });
          }
        }
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
      const loadedMemory = await readMemoryFile(this.memoryFileHandle);
      const { memory: newMemory, migrated } = this.normalizeLedgerMemoryForRuntime(loadedMemory);
      if (migrated) {
        console.log('[LedgerService] Detected legacy categories during reload, writing migrated memory once...');
        await writeMemoryFile(this.memoryFileHandle, newMemory);
      }
      
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
    // 防御式读取：任何路径都先标准化分类映射，避免旧数组结构污染合法性校验
    const validCategories = Object.keys(this.getDefinedCategoriesMap(memory));

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

  /**
   * 计算标签页列表
   * 从 defined_categories 映射中提取所有标签名
   */
  private computeTabs(memory: LedgerMemory | null): string[] {
    const defaultTabs = ['ALL', 'uncategorized'];
    if (!memory) return defaultTabs;

    // 防御式读取：确保标签列表永远来自语义分类名而不是数组索引
    const defined = Object.keys(this.getDefinedCategoriesMap(memory));
    const tabs = ['ALL', ...defined];

    // 如果定义的标签中不包含 'others'，则自动添加作为兜底
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

            const ledgerName = this.getCurrentLedgerName();
            if (ledgerName) {
              const importedTxIds = parsedData.map(tx => tx.id);
              const triggerResult = await classifyTrigger.enqueueCsvImport(ledgerName, newMemory, importedTxIds);
              console.log('[LedgerService] CSV auto-trigger result:', {
                ledger: ledgerName,
                attempted: triggerResult.attempted,
                enqueued: triggerResult.enqueued,
                failed: triggerResult.failedDates.length
              });
            }
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

        const ledgerName = this.getCurrentLedgerName();
        if (ledgerName) {
          const importedTxIds = parsedData.map(tx => tx.id);
          const triggerResult = await classifyTrigger.enqueueCsvImport(ledgerName, newMemory, importedTxIds);
          console.log('[LedgerService] CSV auto-trigger result:', {
            ledger: ledgerName,
            attempted: triggerResult.attempted,
            enqueued: triggerResult.enqueued,
            failed: triggerResult.failedDates.length
          });
        }
    } catch (error) {
        console.error('[LedgerService] Ingest raw failed:', error);
    } finally {
        this.setState({ isLoading: false });
    }
  }

  public async enqueueReclassifyForConfirmedDates(dates: string[], reason: string = 'user_confirmed'): Promise<boolean> {
    const ledgerName = this.getCurrentLedgerName();
    if (!ledgerName || dates.length === 0) {
      return false;
    }
    const result = await classifyTrigger.enqueueConfirmedDates(ledgerName, dates, reason);
    console.log('[LedgerService] User-confirmed trigger result:', {
      ledger: ledgerName,
      attempted: result.attempted,
      enqueued: result.enqueued,
      failed: result.failedDates.length
    });
    return result.failedDates.length === 0;
  }

  public collectDirtyDatesForTxIds(txIds: string[]): string[] {
    const memory = this.state.ledgerMemory;
    if (!memory || txIds.length === 0) {
      return [];
    }
    const dates = new Set<string>();
    for (const txId of txIds) {
      const record = memory.records[txId];
      if (!record?.time) {
        continue;
      }
      dates.add(normalizeToDateKey(record.time));
    }
    return Array.from(dates).sort();
  }

  /**
   * 收集所有未锁定交易的脏日期（全量路径）
   * 供 UI 渐进式确认对话框”全量（未锁定的交易）”按钮使用。
   */
  public collectDirtyDatesForAll(): string[] {
    return this.collectDirtyDatesByPredicate((record) => !record.is_verified);
  }

  /**
   * 按条件从当前账本记录中提取脏日期集合
   * 用于”标签变更即入队”场景，保证触发层与消费层解耦。
   */
  public collectDirtyDatesByPredicate(predicate: (record: FullTransactionRecord) => boolean): string[] {
    const memory = this.state.ledgerMemory;
    if (!memory) {
      return [];
    }
    const dates = new Set<string>();
    for (const record of Object.values(memory.records)) {
      if (!record?.time || !predicate(record as FullTransactionRecord)) {
        continue;
      }
      dates.add(normalizeToDateKey(record.time));
    }
    return Array.from(dates).sort();
  }

  private async syncWithLedger(
    parsedData: Transaction[],
    memoryHandle: StorageHandle | null,
    currentMemory: LedgerMemory,
    forceUncategorized: boolean = false
  ) {
    if (!memoryHandle) return currentMemory;

    // 数据迁移：统一复用归一化逻辑，避免多个入口实现不一致
    const normalized = this.normalizeLedgerMemoryForRuntime(currentMemory);
    currentMemory = normalized.memory;
    const needsMigration = normalized.migrated;

    let hasUpdates = needsMigration; // 如果需要迁移，强制更新
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
  // 数据迁移辅助方法
  // ============================================

  /**
   * 获取分类的默认描述
   * 用于数据迁移时从旧格式（数组）转换到新格式（映射）
   */
  private getDefaultCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      meal: '日常正餐支出（早午晚），如快餐、正餐、工作餐',
      snack: '零食、饮品、小吃等非正餐食品',
      transport: '公共交通、打车、加油、停车等出行费用',
      entertainment: '电影、游戏、演出、会员订阅等娱乐消费',
      feast: '聚餐、大餐、宴请、高档餐厅等特殊餐饮',
      health: '医疗、药品、保健品、健身器材等健康支出',
      shopping: '日用品、服装、电子产品、网购等购物消费',
      education: '书籍、课程、培训、考试等教育支出',
      housing: '房租、水电煤、物业、维修等居住费用',
      travel: '旅游、酒店、机票、景点门票等旅行支出',
      others: '其他未分类支出'
    };
    return descriptions[category] || `${category} 相关支出`;
  }

  // ============================================
  // 标签管理 API - Category Management
  // ============================================

  /**
   * 获取当前所有标签
   * @returns 标签映射 { 标签名: 描述 }
   */
  public getCategories(): Record<string, string> {
    if (!this.state.ledgerMemory) return {};
    return this.getDefinedCategoriesMap(this.state.ledgerMemory);
  }

  /**
   * 添加新标签
   * @param name 标签名称
   * @param description 标签描述
   * @returns 是否成功添加
   */
  public async addCategory(name: string, description: string): Promise<{ success: boolean; dirtyDates: string[]; enqueueSuccess: boolean }> {
    if (!this.memoryFileHandle || !this.state.ledgerMemory) {
      console.error('[LedgerService] Cannot add category: no ledger loaded');
      return { success: false, dirtyDates: [], enqueueSuccess: false };
    }

    // 验证名称
    const sanitizedName = this.sanitizeCategoryName(name);
    if (!sanitizedName) {
      console.error('[LedgerService] Invalid category name:', name);
      return { success: false, dirtyDates: [], enqueueSuccess: false };
    }

    // 检查是否已存在
    const currentCategories = this.state.ledgerMemory.defined_categories;
    if (currentCategories[sanitizedName]) {
      console.error('[LedgerService] Category already exists:', sanitizedName);
      return { success: false, dirtyDates: [], enqueueSuccess: false };
    }

    // 更新 defined_categories
    const newCategories = {
      ...currentCategories,
      [sanitizedName]: description || `${sanitizedName} 相关支出`
    };

    const newMemory: LedgerMemory = {
      ...this.state.ledgerMemory,
      defined_categories: newCategories,
      last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };

    // 保存到文件
    await writeMemoryFile(this.memoryFileHandle, newMemory);

    // 更新状态
    this.setState({
      ledgerMemory: newMemory,
      TABS: this.computeTabs(newMemory)
    });

    /**
     * v5.1 冻结口径：标签新增只负责写入标签定义，不自动入队重分类。
     * 入队时机由 UI 层渐进式范围确认对话框负责：用户选择范围后当场入队并自动启动消费。
     * 返回 dirtyDates 供 UI 层参考受影响规模，但不执行实际入队。
     */
    console.log('[LedgerService] Added category:', sanitizedName);
    return { success: true, dirtyDates: [], enqueueSuccess: true };
  }

  /**
   * 删除标签
   * @param name 标签名称
   * @returns 删除结果，包含受影响的交易 ID 列表
   */
  public async deleteCategory(name: string): Promise<{ success: boolean; affectedTxIds: string[]; dirtyDates: string[]; enqueueSuccess: boolean }> {
    if (!this.memoryFileHandle || !this.state.ledgerMemory) {
      console.error('[LedgerService] Cannot delete category: no ledger loaded');
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 不能删除 others（兜底标签）
    if (name === 'others') {
      console.error('[LedgerService] Cannot delete "others" category');
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 检查标签是否存在
    const currentCategories = this.state.ledgerMemory.defined_categories;
    if (!currentCategories[name]) {
      console.error('[LedgerService] Category not found:', name);
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 收集受影响的交易
    const affectedTxIds: string[] = [];
    const updatedRecords = { ...this.state.ledgerMemory.records };

    Object.entries(updatedRecords).forEach(([txId, record]) => {
      if (record.category === name) {
        affectedTxIds.push(txId);
        // 重置为未分类，强制解锁
        updatedRecords[txId] = {
          ...record,
          category: 'uncategorized',
          ai_category: '',
          ai_reasoning: '',
          user_category: '',
          user_note: '',
          is_verified: false,
          updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        };
      }
    });

    // 从 defined_categories 中删除
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [name]: _removed, ...remainingCategories } = currentCategories;

    // 构建新内存状态
    const newMemory: LedgerMemory = {
      ...this.state.ledgerMemory,
      defined_categories: remainingCategories,
      records: updatedRecords,
      last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };

    // 清理实例库中相关记录
    const ledgerName = this.getCurrentLedgerName();
    if (ledgerName) {
      const { ExampleStore } = await import('./ExampleStore');
      const examples = await ExampleStore.load(ledgerName);
      const filteredExamples = examples.filter(ex => ex.category !== name);
      if (filteredExamples.length !== examples.length) {
        await ExampleStore.save(ledgerName, filteredExamples);
        console.log(`[LedgerService] Removed ${examples.length - filteredExamples.length} examples for category ${name}`);
      }
    }

    // 保存到文件
    await writeMemoryFile(this.memoryFileHandle, newMemory);

    // 清空缓存并更新状态
    this.transactionCache.clear();
    const computed = this.recomputeTransactions(this.state.rawTransactions, newMemory);

    this.setState({
      ledgerMemory: newMemory,
      computedTransactions: computed,
      TABS: this.computeTabs(newMemory)
    });

    /**
     * v5.1 冻结口径：删除标签后，前置改写（重置分类+解锁+清理实例库）已同步完成。
     * 不自动入队重分类，由 UI 层渐进式范围确认对话框负责：用户选择范围后当场入队并启动消费。
     * affectedTxIds 供 UI 层展示受影响规模并用于"仅受影响"路径的 dirtyDates 计算。
     */
    const affectedDirtyDates = this.collectDirtyDatesForTxIds(affectedTxIds);
    console.log('[LedgerService] Deleted category:', name, {
      affectedCount: affectedTxIds.length,
      affectedDirtyDates
    });
    return { success: true, affectedTxIds, dirtyDates: affectedDirtyDates, enqueueSuccess: true };
  }

  /**
   * 重命名标签
   * @param oldName 旧标签名
   * @param newName 新标签名
   * @returns 是否成功
   */
  public async renameCategory(oldName: string, newName: string): Promise<{ success: boolean; affectedTxIds: string[]; dirtyDates: string[]; enqueueSuccess: boolean }> {
    if (!this.memoryFileHandle || !this.state.ledgerMemory) {
      console.error('[LedgerService] Cannot rename category: no ledger loaded');
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 验证新名称
    const sanitizedNewName = this.sanitizeCategoryName(newName);
    if (!sanitizedNewName) {
      console.error('[LedgerService] Invalid new category name:', newName);
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 检查旧标签是否存在
    const currentCategories = this.state.ledgerMemory.defined_categories;
    if (!currentCategories[oldName]) {
      console.error('[LedgerService] Old category not found:', oldName);
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 检查新名称是否已存在
    if (currentCategories[sanitizedNewName] && oldName !== sanitizedNewName) {
      console.error('[LedgerService] New category name already exists:', sanitizedNewName);
      return { success: false, affectedTxIds: [], dirtyDates: [], enqueueSuccess: false };
    }

    // 更新 defined_categories
    const { [oldName]: oldDesc, ...restCategories } = currentCategories;
    const newCategories = {
      ...restCategories,
      [sanitizedNewName]: oldDesc
    };

    // 批量更新交易记录
    const affectedTxIds: string[] = [];
    const updatedRecords = { ...this.state.ledgerMemory.records };
    Object.entries(updatedRecords).forEach(([txId, record]) => {
      if (record.category === oldName) {
        affectedTxIds.push(txId);
        updatedRecords[txId] = { ...record, category: sanitizedNewName };
      }
      // 同时更新元数据中的分类字段
      if (record.ai_category === oldName) {
        updatedRecords[txId] = { ...updatedRecords[txId], ai_category: sanitizedNewName };
      }
      if (record.user_category === oldName) {
        updatedRecords[txId] = { ...updatedRecords[txId], user_category: sanitizedNewName };
      }
    });

    const newMemory: LedgerMemory = {
      ...this.state.ledgerMemory,
      defined_categories: newCategories,
      records: updatedRecords,
      last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };

    // 保存到文件
    await writeMemoryFile(this.memoryFileHandle, newMemory);

    // 清空缓存并更新状态
    this.transactionCache.clear();
    const computed = this.recomputeTransactions(this.state.rawTransactions, newMemory);

    this.setState({
      ledgerMemory: newMemory,
      computedTransactions: computed,
      TABS: this.computeTabs(newMemory)
    });

    /**
     * v5.1 冻结口径：重命名标签只做字符串改名，不触发重分类，不改动锁定状态。
     * 同步更新实例库中对应的 category 字段，保持实例库与当前标签体系一致。
     */
    const ledgerName = this.getCurrentLedgerName();
    if (ledgerName) {
      const { ExampleStore } = await import('./ExampleStore');
      const examples = await ExampleStore.load(ledgerName);
      const renamedExamples = examples.map(ex =>
        ex.category === oldName ? { ...ex, category: sanitizedNewName } : ex
      );
      if (renamedExamples.some((ex, i) => ex.category !== examples[i].category)) {
        await ExampleStore.save(ledgerName, renamedExamples);
        console.log(`[LedgerService] Updated ExampleStore: renamed category ${oldName} -> ${sanitizedNewName}`);
      }
    }

    console.log('[LedgerService] Renamed category:', oldName, '->', sanitizedNewName, {
      affectedCount: affectedTxIds.length
    });
    // 不入队重分类，dirtyDates 恒为空（冻结口径）
    return { success: true, affectedTxIds, dirtyDates: [], enqueueSuccess: true };
  }

  /**
   * 更新标签描述
   * @param name 标签名称
   * @param description 新描述
   * @returns 是否成功
   */
  public async updateCategoryDescription(name: string, description: string): Promise<{ success: boolean; dirtyDates: string[]; enqueueSuccess: boolean }> {
    if (!this.memoryFileHandle || !this.state.ledgerMemory) {
      console.error('[LedgerService] Cannot update category description: no ledger loaded');
      return { success: false, dirtyDates: [], enqueueSuccess: false };
    }

    // 检查标签是否存在
    const currentCategories = this.state.ledgerMemory.defined_categories;
    if (!currentCategories[name]) {
      console.error('[LedgerService] Category not found:', name);
      return { success: false, dirtyDates: [], enqueueSuccess: false };
    }

    // 更新描述
    const newCategories = {
      ...currentCategories,
      [name]: description
    };

    const newMemory: LedgerMemory = {
      ...this.state.ledgerMemory,
      defined_categories: newCategories,
      last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };

    // 保存到文件
    await writeMemoryFile(this.memoryFileHandle, newMemory);

    // 更新状态
    this.setState({ ledgerMemory: newMemory });

    /**
     * v5.1 冻结口径：修改标签描述只负责写入描述变更，不自动入队重分类。
     * 入队时机由 UI 层渐进式范围确认对话框负责：用户选择范围后当场入队并启动消费。
     */
    console.log('[LedgerService] Updated category description:', name);
    return { success: true, dirtyDates: [], enqueueSuccess: true };
  }

  /**
   * 验证并清理标签名称
   */
  private sanitizeCategoryName(name: string): string | null {
    if (!name || name.trim().length === 0) {
      return null;
    }

    const trimmed = name.trim().toLowerCase();
    if (trimmed.length > 50) {
      return null;
    }

    // 仅允许小写字母、数字、下划线
    const validPattern = /^[a-z0-9_]+$/;
    if (!validPattern.test(trimmed)) {
      return null;
    }

    return trimmed;
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
    const normalized = this.normalizeLedgerMemoryForRuntime(memory);
    const runtimeMemory = normalized.memory;
    if (normalized.migrated) {
      console.log('[LedgerService] Legacy categories detected in loadFromHandle, runtime normalized');
    }

    this.memoryFileHandle = handle;
    this.transactionCache.clear();
    globalArbiter.clearAllProposals();

    // 水合 Arbiter
    this.hydrateArbiter(runtimeMemory);

    // 恢复交易
    const restoredTransactions: Transaction[] = Object.values(runtimeMemory.records).map(record => ({
      ...record,
      originalDate: parse(record.time, 'yyyy-MM-dd HH:mm:ss', new Date())
    }));

    if (restoredTransactions.length > 0) {
      restoredTransactions.sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
    }

    const computed = this.recomputeTransactions(restoredTransactions, runtimeMemory);
    const tabs = this.computeTabs(runtimeMemory);
    const range = this.computeDateRange(computed);

    this.setState({
      ledgerMemory: runtimeMemory,
      rawTransactions: restoredTransactions,
      computedTransactions: computed,
      TABS: tabs,
      dateRange: range,
      memoryFileHandle: handle
    });

    this.flushPendingPatches();
    console.log('[LedgerService] Loaded', restoredTransactions.length, 'transactions from handle');
  }

  /**
   * 对外暴露的加载前归一化入口
   * 由 LedgerManager 在读取后、加载前调用，用于决定是否执行一次性迁移回写
   */
  public normalizeLoadedMemory(memory: LedgerMemory): { memory: LedgerMemory; migrated: boolean } {
    return this.normalizeLedgerMemoryForRuntime(memory);
  }

  /**
   * 提取并标准化分类映射
   * - 输入是映射：直接返回
   * - 输入是旧数组：转换为映射，值使用默认描述
   * - 输入异常：回落到默认分类映射，避免业务链路出现数字索引标签
   */
  private normalizeDefinedCategories(
    definedCategories: LedgerMemory['defined_categories'] | string[] | null | undefined
  ): { categories: Record<string, string>; migrated: boolean } {
    if (Array.isArray(definedCategories)) {
      const migratedCategories: Record<string, string> = {};
      for (const rawCategory of definedCategories) {
        const category = (rawCategory || '').trim();
        if (!category) continue;
        migratedCategories[category] = this.getDefaultCategoryDescription(category);
      }
      if (Object.keys(migratedCategories).length === 0) {
        return { categories: { ...DEFAULT_MEMORY.defined_categories }, migrated: true };
      }
      return { categories: migratedCategories, migrated: true };
    }

    if (definedCategories && typeof definedCategories === 'object') {
      const normalizedEntries = Object.entries(definedCategories)
        .filter(([key]) => key.trim().length > 0)
        .map(([key, value]) => [key, value || this.getDefaultCategoryDescription(key)] as const);
      if (normalizedEntries.length === 0) {
        return { categories: { ...DEFAULT_MEMORY.defined_categories }, migrated: false };
      }
      return { categories: Object.fromEntries(normalizedEntries), migrated: false };
    }

    return { categories: { ...DEFAULT_MEMORY.defined_categories }, migrated: true };
  }

  /**
   * 将账本内存归一化为运行态可安全消费结构
   * 当检测到旧结构时，version 升级为 1.1，供调用方决定是否回写
   */
  private normalizeLedgerMemoryForRuntime(memory: LedgerMemory): { memory: LedgerMemory; migrated: boolean } {
    const normalized = this.normalizeDefinedCategories(memory.defined_categories as LedgerMemory['defined_categories'] | string[]);
    if (!normalized.migrated) {
      return { memory, migrated: false };
    }
    return {
      memory: {
        ...memory,
        defined_categories: normalized.categories,
        version: '1.1'
      },
      migrated: true
    };
  }

  /**
   * 获取可用于业务逻辑的分类映射
   * 该方法只做读取级防御，不改变传入对象，确保计算链路稳定
   */
  private getDefinedCategoriesMap(memory: LedgerMemory): Record<string, string> {
    return this.normalizeDefinedCategories(memory.defined_categories as LedgerMemory['defined_categories'] | string[]).categories;
  }
}
