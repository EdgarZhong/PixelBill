import { Header } from '../components/mobile/Header';
import { ActivityMatrix } from '../components/mobile/ActivityMatrix';
import { TransactionList } from '../components/TransactionList';
import { DateRangePicker } from '../components/DateRangePicker';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppLogic } from '../hooks/useAppLogic';

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
    totalExpense,
    totalIncome,
    TABS
  } = useAppLogic();

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
      
      <div className="min-h-screen text-primary p-4 md:p-8 font-mono overflow-x-hidden">
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
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}
