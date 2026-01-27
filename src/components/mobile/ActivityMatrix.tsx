import React, { useMemo, useState } from 'react';
import type { Transaction } from '../../types';
import { format, subDays, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityMatrixProps {
  transactions: Transaction[];
  onDateClick?: (date: Date) => void;
}

export const ActivityMatrix: React.FC<ActivityMatrixProps> = ({ transactions, onDateClick }) => {
  const [page, setPage] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const daysPerPage = 7;
  const swipeThreshold = 50; // 最小滑动距离
  
  // 计算最近14天的数据
  const matrixData = useMemo(() => {
    // 如果没有数据，默认显示以今天为结束的14天
    const endDate = transactions.length > 0 ? transactions[0].originalDate : new Date();
    const days = 14;
    const data = [];
    let maxVolume = 0;

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(endDate, i);
      const dayTransactions = transactions.filter(t => 
        isSameDay(t.originalDate, date)
      );
      
      const expense = dayTransactions
        .filter(t => t.direction === 'out')
        .reduce((sum, t) => sum + t.amount, 0);
        
      const income = dayTransactions
        .filter(t => t.direction === 'in')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalVolume = expense + income;
      if (totalVolume > maxVolume) maxVolume = totalVolume;

      data.push({
        date,
        expense,
        income,
        totalVolume,
        count: dayTransactions.length
      });
    }

    // 如果完全没有数据，maxVolume 设为 1 以避免除以 0
    if (maxVolume === 0) maxVolume = 1;

    return { data, maxVolume };
  }, [transactions]);

  // 分页显示7天数据
  const paginatedData = useMemo(() => {
    const start = page * daysPerPage;
    const end = start + daysPerPage;
    return matrixData.data.slice(start, end);
  }, [matrixData.data, page]);

  const maxPage = Math.ceil(matrixData.data.length / daysPerPage) - 1;
  
  const handleSwipeLeft = () => {
    if (page < maxPage) setPage(page + 1);
  };
  
  const handleSwipeRight = () => {
    if (page > 0) setPage(page - 1);
  };

  // 处理触摸滑动
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > swipeThreshold;
    const isRightSwipe = distance < -swipeThreshold;

    if (isLeftSwipe) {
      handleSwipeLeft();
    } else if (isRightSwipe) {
      handleSwipeRight();
    }
  };

  const { maxVolume } = matrixData;

  return (
    <div 
      className="mb-8 relative z-0 select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex justify-between items-center gap-2 mb-6 font-mono text-[10px] text-dim">
        <button
          onClick={handleSwipeRight}
          disabled={page === 0}
          className="px-2 py-1 text-dim hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ◀
        </button>
        <span className="flex-1 text-center tracking-wider">ACTIVITY_MATRIX_7D</span>
        <span className="text-dim/70 flex-1 text-right">MAX_VOL: ¥{maxVolume.toFixed(0)}</span>
        <button
          onClick={handleSwipeLeft}
          disabled={page === maxPage}
          className="px-2 py-1 text-dim hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ▶
        </button>
      </div>
      
      <AnimatePresence mode="wait">
        <div key={page} className="flex justify-between items-end h-[120px] gap-2">
          {paginatedData.map((day, index) => {
          // 计算高度 (0-20格)
          const intensity = maxVolume > 0 
            ? Math.ceil((day.totalVolume / maxVolume) * 20) 
            : 0;
          
          // 计算红色(支出)像素的数量
          // 红色在下，黄色在上
          const expenseRatio = day.totalVolume > 0 ? day.expense / day.totalVolume : 0;
          const expensePixels = Math.round(intensity * expenseRatio);

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: page > 0 ? 50 : -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: page > 0 ? -50 : 50 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-[2px] items-center group relative w-full h-full justify-end cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onDateClick?.(day.date)}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-20 bg-card border border-gray-800 p-2 text-xs font-mono whitespace-nowrap shadow-xl pointer-events-none">
                <div className="text-gray-400">{format(day.date, 'yyyy-MM-dd')}</div>
                <div className="text-expense-red">OUT: -¥{day.expense.toFixed(2)}</div>
                <div className="text-income-yellow">IN: +¥{day.income.toFixed(2)}</div>
                <div className="text-dim mt-1">{day.count} txns</div>
              </div>

              {/* Pixel Column */}
              <div className="flex flex-col-reverse gap-[2px] w-full items-center">
                {Array.from({ length: 20 }).map((_, i) => {
                  // i=0 is bottom
                  const isActive = (i + 1) <= intensity;
                  const isExpense = (i + 1) <= expensePixels;

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ 
                        opacity: isActive ? 1 : 0.1,
                        width: isActive ? "100%" : "70%"
                      }}
                      transition={{ delay: index * 0.05 + i * 0.01 }}
                      className={`h-1 md:h-1.5 rounded-[1px] transition-colors duration-300 ${
                        isActive 
                          ? `shadow-[0_0_2px_rgba(0,0,0,0.5)]
                             bg-pixel-green group-hover:shadow-none
                             ${isExpense 
                               ? 'group-hover:bg-expense-red' 
                               : 'group-hover:bg-income-yellow'
                             }`
                          : 'bg-gray-800 group-hover:bg-gray-700'
                      }`}
                    />
                  );
                })}
              </div>
              
              {/* Date Label */}
              <div className="mt-2 text-[10px] font-mono text-dim rotate-90 md:rotate-0 origin-left translate-x-1 md:translate-x-0 opacity-50 group-hover:opacity-100 transition-opacity">
                {format(day.date, 'MM/dd')}
              </div>
            </motion.div>
          );
        })}
        </div>
      </AnimatePresence>
      
      {/* Page Indicator */}
      <div className="flex justify-center gap-1 mt-4">
        {Array.from({ length: Math.ceil(matrixData.data.length / daysPerPage) }).map((_, i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full transition-colors ${
              i === page ? 'bg-pixel-green' : 'bg-gray-600'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
