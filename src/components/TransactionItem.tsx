import React from 'react';
import type { Transaction } from '../types';
import { CategoryDict } from '../types/metadata';
import { format } from 'date-fns';
import clsx from 'clsx';

interface TransactionItemProps {
  transaction: Transaction;
  onClick?: (transaction: Transaction) => void;
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

/**
 * Reusable Transaction List Item component
 */
export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction: t,
  onClick
}) => {
  return (
    <div className={clsx('group relative overflow-hidden rounded-sm')}>
      <div
        className="flex items-center py-3 border-b border-gray-900 hover:bg-white/[0.02] transition-colors relative cursor-pointer"
        onClick={() => onClick?.(t)}
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
    </div>
  );
};
