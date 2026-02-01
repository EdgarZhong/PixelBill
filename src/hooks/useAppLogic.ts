import { useState, useRef, useMemo, useEffect } from 'react';
import { parseFiles } from '../utils/parser';
import { 
  requestDirectoryHandle, 
  getAutoDirectoryHandle,
  scanForCSVFiles, 
  getMemoryFileHandle, 
  readMemoryFile, 
  writeMemoryFile, 
  DEFAULT_MEMORY, 
  isFileSystemSupported,
  isNative
} from '../utils/fs-storage';
import type { StorageHandle, StorageDirHandle } from '../utils/fs-storage';
import type { Transaction } from '../types';
import type { LedgerMemory, FullTransactionRecord } from '../types/metadata';
import { startOfDay, endOfDay, isWithinInterval, format, parse } from 'date-fns';
import { globalArbiter, type PersistencePatch } from '../core/arbiter/Arbiter';
import { useFileWatcher, type FileChangeInfo } from './useFileWatcher';
import { useDebouncedWriter } from './useDebouncedWriter';

// Register default plugins once
// globalArbiter.registerPlugin(new RegexRulePlugin());
// globalArbiter.registerPlugin(new LocalAIMetaPlugin());

export function useAppLogic() {
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  // Ledger Memory (Metadata)
  const [ledgerMemory, setLedgerMemory] = useState<LedgerMemory | null>(null);
  const [arbiterTick, setArbiterTick] = useState(0); // Force re-render when Arbiter updates
  // const [storageStatus, setStorageStatus] = useState<'disconnected' | 'connected' | 'saving'>('disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');
  const [direction, setDirection] = useState(0);
  const TABS = useMemo(() => {
    // Design 3.5 Tag System Specification
    // Structure: [ ALL ] + [ JSON Defined List ] + [ OTHERS (if exists) ] + [ UNCATEGORIZED ]

    const defaultTabs = ['ALL', 'uncategorized'];
    if (!ledgerMemory) return defaultTabs;

    const defined = ledgerMemory.defined_categories || [];
    
    // 1. Start with ALL
    const tabs = ['ALL'];

    // 2. Add JSON Defined List (Strict Order)
    tabs.push(...defined);

    // 3. Add OTHERS if defined list is not empty (Logic Layer rule)
    // Note: Design says "Others Injection: Only when defined_categories is not empty"
    // AND check if 'others' is not already in defined list (avoid dup)
    if (defined.length > 0 && !defined.includes('others')) {
      tabs.push('others');
    }

    // 4. Always end with UNCATEGORIZED
    // Ensure we don't duplicate if it was somehow in defined list (though it shouldn't be)
    if (!tabs.includes('uncategorized')) {
      tabs.push('uncategorized');
    }

    // Deduplicate (Safety net)
    return Array.from(new Set(tabs));
  }, [ledgerMemory]);

  const handleTabChange = (newFilter: string) => {
    if (newFilter === filter) return;
    const currentIndex = TABS.indexOf(newFilter);
    const prevIndex = TABS.indexOf(filter);
    
    // Shortest path circular direction logic
    // N = TABS.length
    // If delta > N/2 => wrap around (go other way)
    const n = TABS.length;
    let delta = currentIndex - prevIndex;
    
    if (delta > n / 2) {
      delta -= n; // e.g. 0 -> 4 (delta=4 > 2.5) => -1 (Left)
    } else if (delta < -n / 2) {
      delta += n; // e.g. 4 -> 0 (delta=-4 < -2.5) => +1 (Right)
    }
    
    setDirection(delta > 0 ? 1 : -1);
    setFilter(newFilter);
  };

  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const memoryFileHandleRef = useRef<StorageHandle | null>(null);
  const lastSaveTimeRef = useRef(0); // 记录最后一次自身写入的时间，防止 Watcher 回环触发
  
  // Persistence Loop (Step 4.2)
  const { scheduleWrite } = useDebouncedWriter();
  
  // --- Arbiter Integration ---

  // 1. Hydrate Arbiter from Ledger Memory
  useEffect(() => {
    if (ledgerMemory) {
      Object.entries(ledgerMemory.records).forEach(([id, meta]) => {
        globalArbiter.hydrate(id, meta);
      });
      setArbiterTick(t => t + 1);

      // --- Consistency Check (Design 5.3.F) ---
      // Runs once after hydration to ensure File == Memory
      if (memoryFileHandleRef.current) {
        console.log('[System] Running Consistency Check...');
        const updates: Record<string, FullTransactionRecord> = {};
        let updateCount = 0;

        Object.keys(ledgerMemory.records).forEach(id => {
          const record = ledgerMemory.records[id];
          const decision = globalArbiter.decide(id);
          
          // Dirty Check: Compare Logic Category vs File Category
          // Note: record.category is the cached "final category" in JSON
          if (decision.category !== record.category) {
            updates[id] = {
              ...record,
              category: decision.category,
              // If AI/Rule changed the outcome, update timestamp? 
              // No, per Dirty Check Principle, we only sync the RESULT to file.
              // Unless we want to persist the AI source fields too?
              // Assuming AI plugin would have triggered its own ingest if it was a new AI result.
              // Here we just fix the "Cached Category" field in JSON.
            };
            updateCount++;
          }
        });

        if (updateCount > 0) {
          console.log(`[System] Consistency Check found ${updateCount} dirty records. Scheduling write...`);
          const newMemory = {
            ...ledgerMemory,
            records: {
              ...ledgerMemory.records,
              ...updates
            }
          };
          scheduleWrite(memoryFileHandleRef.current, newMemory);
          // Note: We don't call setLedgerMemory here to avoid re-triggering this effect immediately.
          // The scheduleWrite will update file, and if we wanted to update UI state we should.
          // But UI is driven by Arbiter (which is already correct), so ledgerMemory state is just for persistence base.
          // Actually, we SHOULD update state so future diffs are correct.
          // But updating state triggers this effect again.
          // However, next time 'decision.category' will equal 'record.category', so updateCount will be 0.
          setLedgerMemory(newMemory); 
        } else {
          console.log('[System] Consistency Check Passed. No writes needed.');
        }
      }
    }
  }, [ledgerMemory]);

  // 2. Handle Arbiter Patches (Persistence)
  useEffect(() => {
    globalArbiter.setPatchCallback((patch: PersistencePatch) => {
      console.log('[AppLogic] Received patch:', patch.id, patch.updates);
      setLedgerMemory(prev => {
        if (!prev) {
            console.warn('[AppLogic] LedgerMemory is null, cannot apply patch.');
            return null;
        }
        const record = prev.records[patch.id];
        // If record doesn't exist, we might need to create it? 
        // Usually patch comes from existing transaction, so record should exist or be created by loader.
        // If arbiter emits patch for unknown ID, ignore.
        if (!record) {
             console.warn('[AppLogic] Record not found for patch:', patch.id);
             return prev; 
        }

        const newRecord = { ...record, ...patch.updates };
        const newMemory = {
          ...prev,
          records: {
            ...prev.records,
            [patch.id]: newRecord
          }
        };

        // 2. Persist to Disk (Debounced)
        if (memoryFileHandleRef.current) {
          console.log('[AppLogic] Scheduling write for patch:', patch.id);
          scheduleWrite(memoryFileHandleRef.current, newMemory);
          lastSaveTimeRef.current = Date.now();
        } else {
          console.error('[AppLogic] memoryFileHandleRef is missing! Cannot persist.');
        }

        return newMemory;
      });
    });
  }, []);

  // 性能优化：缓存上一次的合并结果
  // Key: Transaction ID
  // Value: { raw: 原始对象引用, meta: 元数据对象引用, result: 合并后的结果引用 }
  // 利用 Immutable 特性，只要 raw 和 meta 引用没变，就直接复用 result
  const transactionCacheRef = useRef<Map<string, {
    raw: Transaction;
    meta: FullTransactionRecord | undefined;
    result: Transaction;
  }>>(new Map());

  // 当原始数据被完全替换时（如加载新文件），清空缓存以释放内存
  useEffect(() => {
    if (rawTransactions.length === 0) {
      transactionCacheRef.current.clear();
    }
  }, [rawTransactions]);

  // 合并逻辑: Raw + Meta -> Final Transactions
  const transactions = useMemo(() => {
    // 如果没有元数据，直接返回原始数据（也视为一种缓存未命中或无需合并的状态）
    if (!ledgerMemory) return rawTransactions;

    const cache = transactionCacheRef.current;
    
    return rawTransactions.map(t => {
      const meta = ledgerMemory.records[t.id];
      
      // 1. 缓存命中检查 (极速路径)
      const cached = cache.get(t.id);
      if (cached && cached.raw === t && cached.meta === meta) {
        return cached.result;
      }

      // 2. 缓存未命中，执行完整合并逻辑
      const validCategories = ledgerMemory.defined_categories;
      
      // Default empty meta if not exists
      const safeMeta = meta || {
        ai_category: "",
        ai_reasoning: "",
        user_category: "",
        user_note: "",
        is_verified: false,
        updated_at: ""
      };

      // Construct temporary record for arbitration
      const tempRecord = {
        ...t,
        ...safeMeta,
        // Ensure meta fields are not null (legacy data protection)
        ai_category: safeMeta.ai_category || "",
        ai_reasoning: safeMeta.ai_reasoning || "",
        user_category: safeMeta.user_category || "",
        user_note: safeMeta.user_note || "",
        is_verified: safeMeta.is_verified || false,
        updated_at: safeMeta.updated_at || "",
        // 核心修复：优先使用 meta 中的历史分类（即上一次的仲裁结果）作为基准
        // 当所有信源（User/Rule/AI）都失效时，Arbiter 将回退到这个值
        // 如果没有历史值，则默认为 'uncategorized' (新逻辑) 而不是 'others'
        category: (meta && meta.category) || t.category || 'uncategorized'
      };

      // --- Arbitration Logic ---
      const decision = globalArbiter.decide(t.id);
      
      // [DEBUG] Trace specific IDs to verify arbitration logic
      if (['5110f45d20aab6c3', 'd4db723dbb333a5a'].includes(t.id)) {
        console.log(`[Arbiter Trace] ID: ${t.id.slice(0,6)}... | UserCat: '${safeMeta.user_category}' | Final Decision:`, decision);
      }

      const candidate = decision.category;

      // --- Category Logic (Strict Validation) ---
      // Allow 'uncategorized' to pass through.
      // If category is invalid (not in defined list and not 'uncategorized'), reset to 'uncategorized' for re-processing.
      const finalCategory = (validCategories.includes(candidate) || candidate === 'uncategorized') 
        ? candidate 
        : 'uncategorized';

      const newResult = {
        ...tempRecord,
        category: finalCategory
      };

      // 3. 更新缓存
      cache.set(t.id, {
        raw: t,
        meta: meta, // 存储当前的 meta 引用（可能是 undefined）
        result: newResult
      });

      return newResult;
    });
  }, [rawTransactions, ledgerMemory, arbiterTick]);

  // Update date range when new transactions are loaded
  useEffect(() => {
    if (transactions.length > 0) {
      // Transactions are sorted desc (latest first), so last item is minDate, first is maxDate
      const maxDate = transactions[0].originalDate;
      const minDate = transactions[transactions.length - 1].originalDate;
      
      setDateRange({
        start: startOfDay(minDate),
        end: endOfDay(maxDate)
      });
    }
  }, [transactions]);

  // --- User Action Handlers (Arbiter Bridge) ---
  const updateCategory = async (id: string, newCategory: string, newReasoning?: string) => {
    // 1. Construct Proposal
    // Design 5.3.E: User Note Sync Rule - Atomically update note when category changes
    const proposal: import('../core/plugin/types').Proposal = {
      source: 'USER',
      category: newCategory,
      reasoning: newReasoning ?? "", // If not provided, default to empty (clear note)
      timestamp: Date.now(),
      txId: id
    };

    // 2. Ingest to Arbiter
    globalArbiter.ingest(id, proposal);
    
    // 3. Trigger Render Update
    setArbiterTick(t => t + 1);
  };

  // --- Helper: Sync Parsed Data with Ledger ---
  const syncWithLedger = async (
    parsedData: Transaction[], 
    memoryHandle: StorageHandle | null, 
    currentMemory: LedgerMemory
  ) => {
    if (!memoryHandle) return currentMemory;

    let hasUpdates = false;
    const updatedRecords = { ...currentMemory.records };

    parsedData.forEach(t => {
      // Extract data to save (exclude runtime-only objects like Date)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { originalDate, ...tData } = t;

      const existing = updatedRecords[t.id];

      if (!existing) {
        // New record: Create full record
        updatedRecords[t.id] = {
          ...tData,
          // Initialize all meta fields explicitly for JSON completeness
          ai_category: "",
          ai_reasoning: "",
          user_category: "",
          user_note: "",
          is_verified: false,
          updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        } as FullTransactionRecord;
        hasUpdates = true;
      } else {
        // Existing record: Smart Sync
        // 1. Extract core fields from CSV (excluding 'category' which is derived/cached in storage)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { category: _ignored, ...coreData } = tData;
        
        // 2. Detect changes (Dirty Check)
        const hasNullMeta = existing.ai_category === null || existing.ai_reasoning === null || existing.user_category === null || existing.user_note === null;
        
        const isChanged = Object.keys(coreData).some(key => {
          const k = key as keyof typeof coreData;
          return existing[k] !== coreData[k];
        }) || typeof existing.updated_at === 'number' || hasNullMeta;

        if (isChanged) {
          updatedRecords[t.id] = {
            ...(existing as Partial<FullTransactionRecord>),
            ...coreData, // Overwrite only core fields (source of truth), preserve category
            // Sanitize meta fields (convert legacy nulls to empty strings)
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
      console.log('System: Syncing records to memory file...', { count: parsedData.length });
      const newMemory = {
        ...currentMemory,
        records: updatedRecords,
        last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };
      await writeMemoryFile(memoryHandle, newMemory);
      return newMemory;
    }

    return currentMemory;
  };

  // --- Android Logic Split ---

  const handleInitLedger = async () => {
    if (!isNative) return;
    
    try {
      console.log('System: Auto-initializing ledger...');
      const dirHandle = await getAutoDirectoryHandle();
      
      // Try to get existing file, or create if not exists
      let memoryHandle = await getMemoryFileHandle(dirHandle, false);
      let currentMemory: LedgerMemory = DEFAULT_MEMORY;

      if (memoryHandle) {
        console.log('System: Found existing memory.');
        currentMemory = await readMemoryFile(memoryHandle);
      } else {
        console.log('System: Creating default memory...');
        memoryHandle = await getMemoryFileHandle(dirHandle, true);
      }

      if (memoryHandle) {
        memoryFileHandleRef.current = memoryHandle;
        setLedgerMemory(currentMemory);

        // Hydrate transactions from memory if available
        const restoredTransactions: Transaction[] = Object.values(currentMemory.records).map(record => ({
          ...record,
          originalDate: parse(record.time, 'yyyy-MM-dd HH:mm:ss', new Date())
        }));

        if (restoredTransactions.length > 0) {
          // Sort by date desc (latest first)
          restoredTransactions.sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
          
          // Removed erroneous ingest call (Hydration handled by useEffect)
          // await globalArbiter.ingest(restoredTransactions);
          
          setRawTransactions(restoredTransactions);
          console.log(`System: Hydrated ${restoredTransactions.length} transactions from memory.`);
        }
      }
    } catch (error) {
      console.error('Failed to init ledger:', error);
      // Fallback: Alert user about permission issue (Primitive Strategy)
      if (isNative) {
        alert("无法访问文件系统。请确保已授予应用“文件和媒体”读写权限，然后重启应用。");
      }
    }
  };

  const handleImportData = async () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Auto-init on Android
  useEffect(() => {
    if (isNative) {
      handleInitLedger();
    }
  }, []);

  const handleLoadData = async (externalHandle?: StorageDirHandle) => {
    if (isFileSystemSupported()) {
      try {
        const dirHandle = externalHandle || await requestDirectoryHandle();
        setIsLoading(true);
        
        // 1. Scan for CSVs
        const files = await scanForCSVFiles(dirHandle);
        if (files.length === 0) {
          alert('No CSV files found in the selected directory.');
          setIsLoading(false);
          return;
        }
        
        const parsedData = await parseFiles(files);
        
        // Removed erroneous ingest call
        // await globalArbiter.ingest(parsedData);

        setRawTransactions(parsedData);
        
        // 2. Metadata System (Backend Logic)
        try {
          // Try to get existing file, or create if not exists
          let memoryHandle = await getMemoryFileHandle(dirHandle, false);
          let currentMemory: LedgerMemory = DEFAULT_MEMORY;
          let isNewFile = false;

          if (memoryHandle) {
            console.log('System: Found existing memory.');
            currentMemory = await readMemoryFile(memoryHandle);
          } else {
            console.log('System: Creating default memory...');
            memoryHandle = await getMemoryFileHandle(dirHandle, true);
            isNewFile = true;
          }

          if (memoryHandle) {
            memoryFileHandleRef.current = memoryHandle;
            
            // Sync
            const newMemory = await syncWithLedger(parsedData, memoryHandle, currentMemory);
            
            // If new file created, ensure we save it
            if (isNewFile && newMemory === currentMemory) {
                 await writeMemoryFile(memoryHandle, newMemory);
            }
            
            setLedgerMemory(newMemory);
          }
        } catch (metaError) {
          console.warn('System: Metadata init failed', metaError);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Directory access error:', error);
          alert('Failed to load data. See console.');
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    
    // Convert FileList to Array
    const fileArray = Array.from(files);

    try {
      const parsedData = await parseFiles(fileArray);
      
      // Removed erroneous ingest call
      // await globalArbiter.ingest(parsedData);
      
      // Merging Strategy: Append new data to existing data, deduplicate by ID
      setRawTransactions(prev => {
        const uniqueMap = new Map<string, Transaction>();
        
        // 1. Load existing transactions
        prev.forEach(tx => uniqueMap.set(tx.id, tx));
        
        // 2. Overlay new transactions (New data takes precedence if ID conflicts)
        parsedData.forEach(tx => uniqueMap.set(tx.id, tx));
        
        // 3. Convert back to array and sort by date desc
        return Array.from(uniqueMap.values())
          .sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
      });

      // If we have a ledger loaded (e.g. on Android), sync the new data
      if (memoryFileHandleRef.current && ledgerMemory) {
        console.log('System: Syncing imported data with connected ledger...');
        const newMemory = await syncWithLedger(parsedData, memoryFileHandleRef.current, ledgerMemory);
        setLedgerMemory(newMemory);
      }

    } catch (error) {
      console.error('Error parsing files:', error);
      alert('Failed to parse files. Please check console for details.');
    } finally {
      setIsLoading(false);
      // Reset input value to allow re-selecting same files
      event.target.value = '';
    }
  };

  // --- Hot Reload: Watch for external changes ---
  const handleExternalFileChange = async (info: FileChangeInfo) => {
    if (!memoryFileHandleRef.current) return;
    
    // Loopback Detection: Ignore if modification is caused by our own recent write
    const timeDiff = info.lastModified - lastSaveTimeRef.current;
    if (Math.abs(timeDiff) < 2000) {
      console.log(`[HotReload] Ignored self-update loopback (Diff: ${timeDiff}ms)`);
      return;
    }

    console.log('System: ♻️ External change detected, reloading metadata...');
    try {
      // Re-read from disk
      const newMemory = await readMemoryFile(memoryFileHandleRef.current);
      
      // Update state (this will trigger arbitration via useMemo)
      setLedgerMemory(newMemory);
      
      // Optional: Flash UI or notification could be added here
    } catch (err) {
      console.error('System: Failed to hot-reload memory file', err);
    }
  };

  useFileWatcher(memoryFileHandleRef.current, handleExternalFileChange);

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    // 1. Date Range Filter
    if (dateRange.start && dateRange.end) {
      result = result.filter(t => 
        isWithinInterval(t.originalDate, {
          start: dateRange.start!,
          end: endOfDay(dateRange.end!) // Ensure we include the full end day
        })
      );
    }

    // 2. Category Filter
    if (filter === 'ALL') return result;
    return result.filter(t => t.category === filter);
  }, [transactions, filter, dateRange]);

  const totalExpense = useMemo(() => {
    return filteredTransactions
      .filter(t => t.direction === 'out')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter(t => t.direction === 'in')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  // --- Mock Android Initialization (Web Debug Only) ---
  const handleMockAndroidInit = async (dirHandle: StorageDirHandle) => {
    try {
      console.log('System: [Mock] Initializing ledger from mock handle...');
      
      // Try to get existing file, or create if not exists
      let memoryHandle = await getMemoryFileHandle(dirHandle, false);
      let currentMemory: LedgerMemory = DEFAULT_MEMORY;

      if (memoryHandle) {
        console.log('System: Found existing memory.');
        currentMemory = await readMemoryFile(memoryHandle);
      } else {
        console.log('System: Creating default memory...');
        memoryHandle = await getMemoryFileHandle(dirHandle, true);
      }

      if (memoryHandle) {
        memoryFileHandleRef.current = memoryHandle;
        setLedgerMemory(currentMemory);
      }
    } catch (error) {
      console.error('Failed to init mock ledger:', error);
    }
  };

  return {
    rawTransactions,
    transactions,
    filteredTransactions,
    ledgerMemory,
    isLoading,
    filter,
    handleTabChange,
    updateCategory, // Expose Action
    direction,
    dateRange,
    setDateRange,
    fileInputRef,
    handleFileChange,
    handleLoadData,
    handleInitLedger,
    handleImportData,
    handleMockAndroidInit, // Export for debug scaffold
    totalExpense,
    totalIncome,
    TABS
  };
}
