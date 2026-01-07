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
import type { Transaction } from './types';
import type { LedgerMemory, FullTransactionRecord } from './types/metadata';
import { startOfDay, endOfDay, isWithinInterval, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

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

  // 合并逻辑: Raw + Meta -> Final Transactions
  const transactions = useMemo(() => {
    if (!ledgerMemory) return rawTransactions;

    return rawTransactions.map(t => {
      const meta = ledgerMemory.records[t.id];
      if (!meta) return t;

      // 优先级: User > AI > CSV Default
      // 目前 parser.ts 返回的 category 是基于关键词的简单判断，视为默认值
      // 如果 meta 中有 user_category，则覆盖
      // 如果 meta 中有 ai_category 且已确认，则覆盖 (暂未实现 AI)
      
      const finalCategory = meta.user_category || meta.ai_category || t.category;
      
      return {
        ...t,
        category: finalCategory,
        // 这里可以注入更多 meta 信息供 UI 使用，如果 Transaction 接口支持的话
      };
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
  // Handlers will be implemented when UI interaction is enabled

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
