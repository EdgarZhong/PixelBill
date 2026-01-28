import { Header } from '../components/mobile/Header';
import { ActivityMatrix } from '../components/mobile/ActivityMatrix';
import { TransactionList } from '../components/TransactionList';
import { DateRangePicker } from '../components/mobile/DateRangePicker';
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
  const [isDetailAnimating, setIsDetailAnimating] = useState(false);
  // Removed custom scroll states: tabScrollX, isDragging
  const safeArea = useSafeArea();
  const detailPageRef = useRef<HTMLDivElement | null>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const detailTouchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
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
    detailTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleDetailPageTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!detailTouchStartRef.current) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - detailTouchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - detailTouchStartRef.current.y);
    const timeDelta = Date.now() - detailTouchStartRef.current.timestamp;
    const screenWidth = window.innerWidth;

    // Detect edge swipe gestures to go back (返回手势)
    // 从左边缘向右滑动 或 从右边缘向左滑动
    const fromLeftEdge = detailTouchStartRef.current.x < 50 && deltaX > 50;
    const fromRightEdge = detailTouchStartRef.current.x > screenWidth - 50 && deltaX < -50;

    if (
      (fromLeftEdge || fromRightEdge) && // From left or right edge
      deltaY < 50 && // Not much vertical movement
      timeDelta < 300 // Quick gesture
    ) {
      setSelectedTransaction(null);
    }

    detailTouchStartRef.current = null;
  }, []);

  // Custom smooth scroll function with ease-out-quart
  const smoothScrollTo = useCallback((element: HTMLElement, target: number, duration: number) => {
    const start = element.scrollLeft;
    const change = target - start;
    const startTime = performance.now();

    // Logarithmic deceleration curve (Ease Out Quart)
    const easeOutQuart = (x: number): number => {
      return 1 - Math.pow(1 - x, 4);
    };

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      
      if (elapsed < duration) {
        const progress = easeOutQuart(elapsed / duration);
        element.scrollLeft = start + change * progress;
        animationFrameRef.current = requestAnimationFrame(animateScroll);
      } else {
        element.scrollLeft = target;
        animationFrameRef.current = null;
      }
    };

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(animateScroll);
  }, []);

  // Stop scroll animation on interaction
  const stopScrollAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Center selected tab in viewport using custom smooth scroll
  const centerTab = useCallback((tabIndex: number) => {
    if (!tabContainerRef.current) return;
    
    const container = tabContainerRef.current;
    const tabs = container.children;
    if (tabIndex >= 0 && tabIndex < tabs.length) {
      const tab = tabs[tabIndex] as HTMLElement;
      
      // Calculate center position manually for total control
      const containerWidth = container.offsetWidth;
      const tabLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;
      
      // Target scroll position: tab center aligned with container center
      const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
      
      // Verify bounds
      const maxScroll = container.scrollWidth - containerWidth;
      const boundedTarget = Math.max(0, Math.min(targetScrollLeft, maxScroll));
      
      // Use custom smooth scroll instead of native behavior
      // 500ms duration with ease-out curve feels silky smooth
      smoothScrollTo(container, boundedTarget, 500);
    }
  }, [smoothScrollTo]);

  // Handle tab change with centering
  const handleTabChangeWithCenter = useCallback((newTab: string) => {
    const tabIndex = TABS.indexOf(newTab as any);
    if (tabIndex !== -1) {
      centerTab(tabIndex);
      handleTabChange(newTab as any);
    }
  }, [TABS, centerTab, handleTabChange]);

  // Removed simple touch event handlers for tabs since we use native scrolling now

  // Initialize tab centering on mount

  useEffect(() => {
    const currentTabIndex = TABS.indexOf(filter);
    if (currentTabIndex !== -1) {
      centerTab(currentTabIndex);
    }
  }, [TABS, filter, centerTab]);

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
      
      {/* Main Page - Always rendered */}
      <motion.div 
        className="min-h-screen"
        style={{
          paddingLeft: `max(0.75rem, ${safeArea.left}px)`,
          paddingRight: `max(0.75rem, ${safeArea.right}px)`
        }}
        animate={{
          scale: selectedTransaction ? 0.95 : 1,
          filter: selectedTransaction ? 'blur(4px)' : 'blur(0px)',
          opacity: selectedTransaction ? 0.6 : 1
        }}
        transition={{
          duration: 0.4,
          ease: [0.4, 0.0, 0.2, 1]
        }}
      >
        {/* Hidden Input for CSV Selection (Mobile: File Picker) */}
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
            <div className="w-full h-full">
              {transactions.length > 0 ? (
                <DateRangePicker
                  label="DATA_RANGE"
                  minDate={transactions[transactions.length - 1]?.originalDate || new Date()}
                  maxDate={transactions[0]?.originalDate || new Date()}
                  startDate={dateRange.start || transactions[transactions.length - 1]?.originalDate || new Date()}
                  endDate={dateRange.end || transactions[0]?.originalDate || new Date()}
                  onChange={(start, end) => setDateRange({ start, end })}
                />
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full bg-card/30 border border-white/5 rounded-sm p-2">
                  <div className="text-dim text-[10px] mb-1 font-mono tracking-wider">DATA_RANGE</div>
                  <div className="text-dim opacity-50 text-[10px] font-mono">
                    NO DATA
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity Matrix - Mobile Version */}
          <ActivityMatrix 
            transactions={filteredTransactions}
            onDateClick={(date) => setSelectedDate(date)}
            dateRange={dateRange}
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

          {/* Filter Tabs - Carousel Style */}
          <div className="mb-6 relative overflow-hidden">
            <div className="border-b border-gray-800 relative">
              <div 
                ref={tabContainerRef}
                className="flex gap-6 pb-2 relative overflow-x-auto whitespace-nowrap scrollbar-hide"
                style={{
                  WebkitOverflowScrolling: 'touch',
                }}
                onTouchStart={stopScrollAnimation}
              >
                {TABS.map((f, index) => {
                  return (
                    <button
                      key={f}
                      onClick={() => handleTabChangeWithCenter(f)}
                      className={`pb-2 px-3 text-xs transition-all duration-300 relative font-mono tracking-tight whitespace-nowrap flex-shrink-0 ${
                        filter === f ? 'text-pixel-green scale-110' : 'text-dim hover:text-gray-400'
                      }`}
                    >
                      {f}
                      {filter === f && (
                        <motion.div 
                          layoutId="tab-indicator"
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="absolute bottom-0 left-0 w-full h-[2px] bg-pixel-green shadow-[0_0_8px_rgba(16,185,129,0.6)]" 
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              
              {/* Gradient fade edges */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            </div>
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
                isMobile={true}
              />
            </motion.div>
          </AnimatePresence>

          <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
            <p>DESIGNED & ENGINEERED BY <span className="font-bold text-gray-400">CYBERZEN STUDIO</span></p>
          </footer>
        </main>
      </motion.div>

      {/* Detail Page Overlay */}
      <AnimatePresence>
        {selectedTransaction && (
          <motion.div
            ref={detailPageRef}
            onTouchStart={handleDetailPageTouchStart}
            onTouchEnd={handleDetailPageTouchEnd}
            className="fixed inset-0 z-50 bg-background text-primary font-mono overflow-x-hidden overflow-y-auto"
            style={{
              paddingTop: `max(1rem, ${safeArea.top}px)`,
              paddingBottom: `max(1rem, ${safeArea.bottom}px)`,
              paddingLeft: `max(1rem, ${safeArea.left}px)`,
              paddingRight: `max(1rem, ${safeArea.right}px)`
            }}
            initial={{
              x: '100%'
            }}
            animate={{
              x: 0
            }}
            exit={{
              x: '100%'
            }}
            transition={{
              duration: 0.4,
              ease: [0.4, 0.0, 0.2, 1]
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
