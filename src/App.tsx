import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { ActivityMatrix } from './components/ActivityMatrix';
import { TransactionList } from './components/TransactionList';
import { DateRangePicker } from './components/DateRangePicker';
import { parseFiles } from './utils/parser';
import { 
  requestDirectoryHandle, 
  scanForCSVFiles, 
  getMemoryFileHandle, 
  readMemoryFile, 
  writeMemoryFile, 
  DEFAULT_MEMORY, 
  isFileSystemSupported 
} from './utils/fs-storage';
import type { StorageHandle } from './utils/fs-storage';
import type { Transaction } from './types';
import type { LedgerMemory, FullTransactionRecord } from './types/metadata';
import { startOfDay, endOfDay, isWithinInterval, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { globalArbiter } from './core/arbiter/Arbiter';
// import { RegexRulePlugin } from './core/plugin';
import { LocalAIMetaPlugin } from './core/plugin';
import { useFileWatcher, type FileChangeInfo } from './hooks/useFileWatcher';

// Register default plugins once
// globalArbiter.registerPlugin(new RegexRulePlugin());
globalArbiter.registerPlugin(new LocalAIMetaPlugin());

function App() {
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  // Ledger Memory (Metadata)
  const [ledgerMemory, setLedgerMemory] = useState<LedgerMemory | null>(null);
  // const [storageStatus, setStorageStatus] = useState<'disconnected' | 'connected' | 'saving'>('disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'MEAL' | 'OTHER'>('ALL');
  const [direction, setDirection] = useState(0);
  const TABS = ['ALL', 'MEAL', 'OTHER'] as const;

  const handleTabChange = (newFilter: typeof TABS[number]) => {
    if (newFilter === filter) return;
    const currentIndex = TABS.indexOf(newFilter);
    const prevIndex = TABS.indexOf(filter);
    setDirection(currentIndex > prevIndex ? 1 : -1);
    setFilter(newFilter);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 20 : -20,
      opacity: 0,
      filter: 'blur(4px)'
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      filter: 'blur(0px)'
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 20 : -20,
      opacity: 0,
      filter: 'blur(4px)'
    })
  };

  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const memoryFileHandleRef = useRef<StorageHandle | null>(null);
  const lastSaveTimeRef = useRef(0); // 记录最后一次自身写入的时间，防止 Watcher 回环触发

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
        // 当所有信源（User/Rule/AI）都失效时，Arbiter 将回退到这个值，而不是盲目重置为 'others'
        category: (meta && meta.category) || t.category || 'others'
      };

      // --- Arbitration Logic ---
      const decision = globalArbiter.decide(tempRecord as FullTransactionRecord, ledgerMemory || undefined);
      
      // [DEBUG] Trace specific IDs to verify arbitration logic
      if (['5110f45d20aab6c3', 'd4db723dbb333a5a'].includes(t.id)) {
        console.log(`[Arbiter Trace] ID: ${t.id.slice(0,6)}... | UserCat: '${safeMeta.user_category}' | Final Decision:`, decision);
      }

      const candidate = decision.category;

      // --- Category Logic (Strict Validation) ---
      const finalCategory = validCategories.includes(candidate) ? candidate : 'others';

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
  }, [rawTransactions, ledgerMemory]);

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

  // --- Sync Arbitration Result to Persistence ---
  // 当仲裁结果(transactions)与存储状态(ledgerMemory)不一致时，
  // 触发反向同步，将最新的 category 写入 JSON。
  useEffect(() => {
    if (!ledgerMemory || transactions.length === 0) return;

    const updates: Record<string, FullTransactionRecord> = {};
    let hasChanges = false;

    transactions.forEach(tx => {
      const stored = ledgerMemory.records[tx.id];
      // 如果存储中不存在（新记录）或者 category 不一致
      // 注意：这里只关注 category 的变化。
      if (stored && stored.category !== tx.category) {
        // 发现不一致！
        updates[tx.id] = {
          ...stored,
          category: tx.category,
          updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
        } as FullTransactionRecord;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      console.log(`[Sync] Detected ${Object.keys(updates).length} category changes. Persisting...`);
      
      // 构造新内存对象
      const newMemory = {
        ...ledgerMemory,
        records: {
          ...ledgerMemory.records,
          ...updates
        }
      };

      // 1. Update State (这将触发新一轮 render，但因为 category 已一致，不会再进此分支)
      setLedgerMemory(newMemory);

      // 2. Persist to Disk
      if (memoryFileHandleRef.current) {
        writeMemoryFile(memoryFileHandleRef.current, newMemory)
          .then(() => {
            lastSaveTimeRef.current = Date.now();
          })
          .catch(err => 
            console.error('[Sync] Save failed:', err)
          );
      }
    }
  }, [transactions, ledgerMemory]);

  const handleLoadData = async () => {
    if (isFileSystemSupported()) {
      try {
        const dirHandle = await requestDirectoryHandle();
        setIsLoading(true);
        
        // 1. Scan for CSVs
        const files = await scanForCSVFiles(dirHandle);
        if (files.length === 0) {
          alert('No CSV files found in the selected directory.');
          setIsLoading(false);
          return;
        }
        
        const parsedData = await parseFiles(files);
        
        // Pre-calculate rules before rendering
        await globalArbiter.ingest(parsedData);

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
            // --- Sync Logic: Ensure all transactions have a record ---
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

            if (hasUpdates || isNewFile) {
              console.log('System: Syncing records to memory file...', { count: parsedData.length });
              currentMemory = {
                ...currentMemory,
                records: updatedRecords,
                last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
              };
              await writeMemoryFile(memoryHandle, currentMemory);
            }

            setLedgerMemory(currentMemory);
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
      setRawTransactions(parsedData);
    } catch (error) {
      console.error('Error parsing files:', error);
      alert('Failed to parse files. Please check console for details.');
    } finally {
      setIsLoading(false);
      // Reset input value to allow re-selecting same files
      event.target.value = '';
    }
  };

  // --- Memory / Storage Handlers (Backend Logic Only) ---
  
  /**
   * 核心元数据更新函数
   * 负责更新内存状态并同步持久化到 JSON 文件
   */
  // const updateTransactionMetadata = async (id: string, newMeta: Partial<TransactionMeta>) => {
  //   if (!ledgerMemory) return;

  //   // 1. Update State (Optimistic UI Update)
  //   // 查找目标记录
  //   const currentRecord = ledgerMemory.records[id];
  //   if (!currentRecord) {
  //     console.warn(`Transaction ${id} not found in memory`);
  //     return;
  //   }

  //   // 构造新记录 (Immutable)
  //   const updatedRecord = {
  //     ...currentRecord,
  //     ...newMeta,
  //     updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
  //   } as FullTransactionRecord;

  //   // 构造新内存状态
  //   const newMemory = {
  //     ...ledgerMemory,
  //     records: {
  //       ...ledgerMemory.records,
  //       [id]: updatedRecord
  //     },
  //     last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
  //   };

  //   // 触发 React 更新 (会激活 useMemo 的缓存机制)
  //   setLedgerMemory(newMemory);

  //   // 2. Persist to File
  //   if (memoryFileHandleRef.current) {
  //     try {
  //       console.log(`System: Persisting metadata for ${id}...`);
  //       await writeMemoryFile(memoryFileHandleRef.current, newMemory);
  //     } catch (error) {
  //       console.error('Failed to save metadata:', error);
  //       // 生产环境可能需要回滚 State，或者提示用户保存失败
  //       alert('Warning: Failed to save changes to disk.');
  //     }
  //   } else {
  //     console.warn('System: No file handle available for persistence.');
  //   }
  // };


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

  /**
   * 确认/锁定交易分类
   * 用户手动确认后，该交易的分类将被锁定，不会被 AI 或规则引擎覆盖
   */
  // const verifyTransaction = async (id: string) => {
  //   await updateTransactionMetadata(id, { is_verified: true });
  // };

  /**
   * 解除交易分类锁定
   * 解除后，该交易将重新参与仲裁流程 (User > Rule > AI)
   */
  // const unverifyTransaction = async (id: string) => {
  //   await updateTransactionMetadata(id, { is_verified: false });
  // };

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    // 1. Date Range Filter
    if (dateRange.start && dateRange.end) {
      result = result.filter(t => 
        isWithinInterval(t.originalDate, {
          start: dateRange.start!,
          end: dateRange.end!
        })
      );
    }

    // 2. Category Filter
    if (filter === 'ALL') return result;
    if (filter === 'MEAL') return result.filter(t => t.category === 'meal');
    if (filter === 'OTHER') return result.filter(t => t.category !== 'meal');
    return result;
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

  return (
    <>
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 z-[-1] bg-background bg-dot-matrix pointer-events-none" />
      
      <div className="min-h-screen text-primary p-4 md:p-8 font-mono">
        <div className="max-w-5xl mx-auto">
          {/* Hidden Input for Directory Selection */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            // @ts-expect-error - webkitdirectory is non-standard but supported
            webkitdirectory="" 
            directory=""
            multiple
          />

          <Header onLoadData={handleLoadData} isLoading={isLoading} />

          <main className="animate-fade-in">
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 border-b border-gray-800 pb-8">
              <div>
                <div className="text-dim text-xs mb-1">TOTAL_EXPENSE</div>
                <div className="text-2xl md:text-3xl font-bold text-expense-red">
                  -¥{totalExpense.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-dim text-xs mb-1">TOTAL_INCOME</div>
                <div className="text-2xl md:text-3xl font-bold text-income-yellow">
                  +¥{totalIncome.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-dim text-xs mb-1">TXN_COUNT</div>
                <div className="text-2xl md:text-3xl font-bold">
                  {filteredTransactions.length}
                </div>
              </div>
              <div className="md:-ml-12">
                <div className="text-dim text-xs mb-1 font-mono tracking-wider">DATA_RANGE</div>
                {transactions.length > 0 ? (
                  <DateRangePicker
                    minDate={transactions[transactions.length - 1]?.originalDate || new Date()}
                    maxDate={transactions[0]?.originalDate || new Date()}
                    startDate={dateRange.start || transactions[transactions.length - 1]?.originalDate || new Date()}
                    endDate={dateRange.end || transactions[0]?.originalDate || new Date()}
                    onChange={(start, end) => setDateRange({ start, end })}
                  />
                ) : (
                  <div className="h-10 w-64 flex items-center text-dim opacity-50 text-sm font-mono">
                    NO DATA
                  </div>
                )}
              </div>
            </div>

            {/* Activity Matrix */}
            <ActivityMatrix transactions={filteredTransactions} />

            {/* Filter Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-800">
              {TABS.map((f) => (
                <button
                  key={f}
                  onClick={() => handleTabChange(f)}
                  className={`pb-2 px-1 text-xs transition-colors relative font-pixel tracking-tight ${
                    filter === f ? 'text-white' : 'text-dim hover:text-gray-400'
                  }`}
                >
                  {f}_VIEW
                  {filter === f && (
                    <motion.div 
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 w-full h-[2px] bg-pixel-green" 
                    />
                  )}
                </button>
              ))}
            </div>

            {/* TransactionList */}
            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
              <motion.div
                key={filter}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                <TransactionList 
                  transactions={filteredTransactions} 
                />
              </motion.div>
            </AnimatePresence>

            {/* Footer */}
            <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
              <p>DESIGNED & ENGINEERED BY <span className="font-bold text-gray-400">CYBERZEN STUDIO</span></p>
              <p className="mt-1 tracking-widest">ORDER IN CHAOS</p>
            </footer>
          </main>
        </div>

        {/* 
        <MemoryCapsule 
          status={storageStatus}
          fileName={storage.fileName}
          onConnect={handleConnectMemory}
          onCreate={handleCreateMemory}
        /> 
        */}
      </div>
    </>
  );
}

export default App;
