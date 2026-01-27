import { Header } from '../components/mobile/Header';
import { ActivityMatrix } from '../components/mobile/ActivityMatrix';
import { TransactionList } from '../components/TransactionList';
import { DateRangePicker } from '../components/DateRangePicker';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppLogic } from '../hooks/useAppLogic';
import { useSafeArea, injectSafeAreaCSS } from '../hooks/useSafeArea';
import { useEffect, useState, useRef, useCallback } from 'react';
import { isSameDay } from 'date-fns';
import type { Transaction } from '../types';
import { CategoryDict } from '../types/metadata';
import { format } from 'date-fns';

export function MobileApp() {
  const {
    transactions,
    filteredTransactions,
    isLoading,
    filter,
    handleTabChange,
    direction,
    dateRange,
    setDateRange,
    fileInputRef,
    handleFileChange,
    handleLoadData,
    handleInitLedger,
    handleImportData,
    totalExpense,
    totalIncome,
    TABS
  } = useAppLogic();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const safeArea = useSafeArea();
  const detailPageRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);

  // 当点击直方图某一天时，过滤该天的交易
  const displayTransactions = selectedDate
    ? filteredTransactions.filter(t => isSameDay(t.originalDate, selectedDate))
    : filteredTransactions;

  // Inject SafeArea CSS variables on mount and update
  useEffect(() => {
    injectSafeAreaCSS(safeArea);
  }, [safeArea]);

  // Handle edge swipe gesture to go back (全面屏手势返回)
  const handleDetailPageTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleDetailPageTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - touchStartRef.current.y);
    const timeDelta = Date.now() - touchStartRef.current.timestamp;
    const screenWidth = window.innerWidth;

    // Detect edge swipe gestures to go back (返回手势)
    // 从左边缘向右滑动 或 从右边缘向左滑动
    const fromLeftEdge = touchStartRef.current.x < 50 && deltaX > 50;
    const fromRightEdge = touchStartRef.current.x > screenWidth - 50 && deltaX < -50;

    if (
      (fromLeftEdge || fromRightEdge) && // From left or right edge
      deltaY < 50 && // Not much vertical movement
      timeDelta < 300 // Quick gesture
    ) {
      setSelectedTransaction(null);
    }

    touchStartRef.current = null;
  }, []);

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

  return (
    <>
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 z-[-1] bg-background bg-dot-matrix pointer-events-none" />
      
      {/* Show detail page if transaction is selected, otherwise show main list */}
      {selectedTransaction ? (
        // ====== TRANSACTION DETAIL PAGE ======
        <div 
          ref={detailPageRef}
          onTouchStart={handleDetailPageTouchStart}
          onTouchEnd={handleDetailPageTouchEnd}
          className="min-h-screen text-primary font-mono overflow-x-hidden overflow-y-auto w-full"
          style={{
            paddingTop: `max(1rem, ${safeArea.top}px)`,
            paddingBottom: `max(1rem, ${safeArea.bottom}px)`,
            paddingLeft: `max(1rem, ${safeArea.left}px)`,
            paddingRight: `max(1rem, ${safeArea.right}px)`
          }}
        >
          <div className="w-full max-w-full">
            {/* Header with back button */}
            <div className="flex items-center gap-4 mb-8">
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-dim hover:text-white transition-colors text-2xl"
              >
                ←
              </button>
              <h1 className="text-xl font-bold text-primary flex-1">交易详情</h1>
            </div>

            {/* Detail Content */}
            <div className="space-y-4 pb-20">
              {/* Amount - Large Display */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">金额</div>
                <div className={`text-3xl font-bold ${selectedTransaction.direction === 'in' ? 'text-income-yellow' : 'text-expense-red'}`}>
                  {selectedTransaction.direction === 'in' ? '+' : '-'}¥{selectedTransaction.amount.toFixed(2)}
                </div>
              </div>

              {/* Category */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">分类</div>
                <div className="text-lg text-income-yellow font-bold">
                  {CategoryDict[selectedTransaction.category] || selectedTransaction.category.toUpperCase()}
                </div>
              </div>

              {/* Time */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">时间</div>
                <div className="text-primary">{format(selectedTransaction.originalDate, 'yyyy-MM-dd HH:mm:ss')}</div>
              </div>

              {/* Product */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">商品/服务</div>
                <div className="text-primary break-words">{selectedTransaction.product}</div>
              </div>

              {/* Counterparty */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">交易方</div>
                <div className="text-primary break-words">{selectedTransaction.counterparty}</div>
              </div>

              {/* Source */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">来源</div>
                <div className={selectedTransaction.sourceType === 'wechat' ? 'text-pixel-green' : 'text-alipay-blue'}>
                  {selectedTransaction.sourceType === 'wechat' ? '微信' : '支付宝'}
                </div>
              </div>

              {/* Raw Class */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">原始分类</div>
                <div className="text-dim text-sm">{selectedTransaction.rawClass}</div>
              </div>

              {/* Transaction ID */}
              <div className="p-4 bg-card border border-gray-800 rounded">
                <div className="text-dim text-xs mb-2">交易ID</div>
                <div className="text-dim text-[10px] break-all font-mono">{selectedTransaction.id}</div>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
              <p>TRANSACTION_DETAIL_VIEW</p>
            </footer>
          </div>
        </div>
      ) : (
        // ====== MAIN LIST PAGE ======
        <div>
          {/* Hidden Input for CSV Selection (Mobile: File Picker) */}
          {/* Android File Picker is picky about MIME types. Using wildcard is safest to ensure file is selectable. Validation happens in parser. */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="*/*" 
            multiple
          />

          <Header 
            onLoadData={handleLoadData} 
            isLoading={isLoading} 
            onInitLedger={handleInitLedger}
            onImportData={handleImportData}
          />

          <main className="animate-fade-in">
            {/* Stats Bar - Mobile Grid Layout */}
            <div className="grid grid-cols-2 gap-4 mb-8 border-b border-gray-800 pb-8">
              <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm">
                <div className="text-dim text-[10px] mb-1">TOTAL_EXPENSE</div>
                <div className="text-xl font-bold text-expense-red truncate">
                  -¥{totalExpense.toFixed(0)}
                </div>
              </div>
              <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm">
                <div className="text-dim text-[10px] mb-1">TOTAL_INCOME</div>
                <div className="text-xl font-bold text-income-yellow truncate">
                  +¥{totalIncome.toFixed(0)}
                </div>
              </div>
              <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm">
                <div className="text-dim text-[10px] mb-1">TXN_COUNT</div>
                <div className="text-xl font-bold text-gray-200">
                  {filteredTransactions.length}
                </div>
              </div>
              <div className="text-center p-2 bg-card/30 border border-white/5 rounded-sm flex flex-col justify-center items-center">
                <div className="text-dim text-[10px] mb-1 font-mono tracking-wider">DATA_RANGE</div>
                {transactions.length > 0 ? (
                  <div className="scale-75 origin-center">
                    <DateRangePicker
                      minDate={transactions[transactions.length - 1]?.originalDate || new Date()}
                      maxDate={transactions[0]?.originalDate || new Date()}
                      startDate={dateRange.start || transactions[transactions.length - 1]?.originalDate || new Date()}
                      endDate={dateRange.end || transactions[0]?.originalDate || new Date()}
                      onChange={(start, end) => setDateRange({ start, end })}
                    />
                  </div>
                ) : (
                  <div className="text-dim opacity-50 text-[10px] font-mono">
                    NO DATA
                  </div>
                )}
              </div>
            </div>

            {/* Activity Matrix - Mobile Version */}
            <ActivityMatrix 
              transactions={filteredTransactions}
              onDateClick={(date) => setSelectedDate(date)}
            />

            {/* Show selected date indicator and clear button */}
            {selectedDate && (
              <div className="mb-6 p-3 bg-card/50 border border-pixel-green/50 rounded-sm flex items-center justify-between">
                <span className="text-xs font-mono text-pixel-green">
                  FILTERED: {new Date(selectedDate).toLocaleDateString('zh-CN')}
                </span>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs px-2 py-1 bg-pixel-green/20 hover:bg-pixel-green/40 text-pixel-green rounded transition-colors"
                >
                  CLEAR
                </button>
              </div>
            )}

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
                  transactions={displayTransactions}
                  onTransactionClick={setSelectedTransaction}
                />
              </motion.div>
            </AnimatePresence>

            <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
              <p>DESIGNED & ENGINEERED BY <span className="font-bold text-gray-400">CYBERZEN STUDIO</span></p>
            </footer>
          </main>
        </div>
      )}
    </>
  );
}
