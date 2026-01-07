import React, { useState, useEffect, useRef } from 'react';
import type { Transaction } from '../types';
import { CategoryDict } from '../types/metadata';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Pagination } from './Pagination';

interface TransactionListProps {
  transactions: Transaction[];
}

// 心理账户分级点阵
const AmountDots: React.FC<{ amount: number }> = ({ amount }) => {
  let dots = 0;
  if (amount <= 20) dots = 1;
  else if (amount <= 100) dots = 2;
  else if (amount <= 300) dots = 3;
  else if (amount <= 2000) dots = 4;
  else dots = 5;

  return (
    <div className="flex gap-1" title={`Level ${dots}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 ${
            i < dots ? 'bg-expense-red' : 'bg-gray-800'
          }`}
        />
      ))}
    </div>
  );
};

export const TransactionList: React.FC<TransactionListProps> = ({ transactions }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);
  
  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  
  // 当交易数据总量变化时（如筛选），重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [transactions.length]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Empty State with Placeholder Lines
  if (transactions.length === 0) {
    return (
      <div className="font-mono text-sm opacity-50 select-none pointer-events-none">
        <div className="flex justify-between items-center mb-6 text-dim text-xs uppercase tracking-wider">
          <div className="w-24">Source</div>
          <div className="flex-1">Details</div>
          <div className="w-32 text-right">Amount</div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center py-3 border-b border-gray-900/50">
              <div className="w-24 flex items-center">
                <div className="w-3 h-3 bg-gray-800" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="w-32 h-4 bg-gray-800/50 mb-1" />
                <div className="w-20 h-3 bg-gray-900/50" />
              </div>
              <div className="w-32 flex flex-col items-end gap-1">
                <div className="w-16 h-4 bg-gray-800/50" />
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="w-1.5 h-1.5 bg-gray-900" />
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div className="text-center py-8 text-dim text-xs">
            AWAITING_DATA_STREAM...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono text-sm" ref={listTopRef}>
      <div className="flex justify-between items-center mb-6 text-dim text-xs uppercase tracking-wider">
        <div className="w-24">Source</div>
        <div className="flex-1">Details</div>
        <div className="w-32 text-right">Amount</div>
      </div>

      <div className="space-y-4 min-h-[800px]">
        {paginatedTransactions.map((t) => (
          <div 
            key={t.id} 
            className="group flex items-center py-3 border-b border-gray-900 hover:bg-white/[0.02] transition-colors relative"
          >
            {/* Source Indicator */}
            <div className="w-24 flex items-center">
              <div 
                className={clsx(
                  "w-3 h-3 transition-transform duration-300 group-hover:rotate-45",
                  t.sourceType === 'wechat' ? 'bg-pixel-green' : 'bg-alipay-blue'
                )}
              />
              <span className="ml-3 text-xs text-dim opacity-0 group-hover:opacity-100 transition-opacity">
                {t.sourceType === 'wechat' ? 'WX' : 'ALI'}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-primary truncate font-bold">
                  {t.category !== 'others' && (
                    <span className="text-income-yellow mr-2">
                      [{CategoryDict[t.category] || t.category.toUpperCase()}]
                    </span>
                  )}
                  {t.product !== '/' && t.product !== 'Unknown' ? t.product : t.counterparty}
                </span>
                <span className="text-xs text-dim truncate">{format(t.originalDate, 'MM-dd HH:mm')}</span>
              </div>
              <div className="text-xs text-dim truncate max-w-md">
                {t.rawClass} {t.counterparty !== t.product && `• ${t.counterparty}`}
              </div>
            </div>

            {/* Amount & Dots */}
            <div className="w-32 flex flex-col items-end gap-1">
              <span className={clsx(
                "font-bold",
                t.direction === 'in' ? 'text-income-yellow' : 'text-expense-red'
              )}>
                {t.direction === 'in' ? '+' : '-'} {t.amount.toFixed(2)}
              </span>
              {t.direction === 'out' && <AmountDots amount={t.amount} />}
            </div>
          </div>
        ))}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={handlePageChange} 
        />
      )}
    </div>
  );
};
