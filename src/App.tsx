import React, { useState, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { ActivityMatrix } from './components/ActivityMatrix';
import { TransactionList } from './components/TransactionList';
import { DateRangePicker } from './components/DateRangePicker';
import { parseFiles } from './utils/parser';
import type { Transaction } from './types';
import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'MEAL' | 'OTHER'>('ALL');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update date range when new transactions are loaded
  React.useEffect(() => {
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

  const handleLoadData = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
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
      setTransactions(parsedData);
    } catch (error) {
      console.error('Error parsing files:', error);
      alert('Failed to parse files. Please check console for details.');
    } finally {
      setIsLoading(false);
      // Reset input value to allow re-selecting same files
      event.target.value = '';
    }
  };

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
    if (filter === 'MEAL') return result.filter(t => t.isMeal);
    if (filter === 'OTHER') return result.filter(t => !t.isMeal);
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
                {transactions.length > 0 && dateRange.start && dateRange.end ? (
                  <DateRangePicker
                    minDate={startOfDay(transactions[transactions.length - 1].originalDate)}
                    maxDate={endOfDay(transactions[0].originalDate)}
                    startDate={dateRange.start}
                    endDate={dateRange.end}
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
              {(['ALL', 'MEAL', 'OTHER'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`pb-2 px-1 text-xs transition-colors relative font-pixel tracking-tight ${
                    filter === f ? 'text-white' : 'text-dim hover:text-gray-400'
                  }`}
                >
                  {f}_VIEW
                  {filter === f && (
                    <div className="absolute bottom-0 left-0 w-full h-[2px] bg-pixel-green" />
                  )}
                </button>
              ))}
            </div>

            {/* Transaction List */}
            <TransactionList transactions={filteredTransactions} />
          </main>
        </div>
      </div>
    </>
  );
}

export default App;
