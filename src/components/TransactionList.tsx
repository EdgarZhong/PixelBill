import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Transaction } from '../types';
import { Pagination } from './Pagination';
import { TransactionItem } from './TransactionItem';
import { triggerHaptic, HapticFeedbackLevel } from '../utils/haptics';

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionClick?: (transaction: Transaction) => void;
  isMobile?: boolean;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onTransactionClick, isMobile = false }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  
  const ITEMS_PER_PAGE = 20;
  
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  
  // When transactions change, reset to first page
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

  // Gesture handlers for swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - touchStartRef.current.y);
    const timeDelta = Date.now() - touchStartRef.current.timestamp;

    // Check if this is a horizontal swipe gesture
    const isHorizontalSwipe = Math.abs(deltaX) > 80 && deltaY < 60 && timeDelta < 300;

    if (isHorizontalSwipe) {
      if (deltaX > 0 && currentPage > 1) {
        // Swipe right - previous page
        triggerHaptic(HapticFeedbackLevel.LIGHT);
        setCurrentPage(prev => prev - 1);
      } else if (deltaX < 0 && currentPage < totalPages) {
        // Swipe left - next page
        triggerHaptic(HapticFeedbackLevel.LIGHT);
        setCurrentPage(prev => prev + 1);
      }
    }

    touchStartRef.current = null;
  }, [currentPage, totalPages]);

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

      <div 
        ref={listContainerRef}
        className="space-y-4 min-h-[800px] touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {paginatedTransactions.map((t) => (
          <TransactionItem
            key={t.id}
            transaction={t}
            onClick={onTransactionClick}
          />
        ))}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={handlePageChange}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};
