import React, { useState, useEffect, useRef } from 'react';
import type { Transaction } from '../types';
import { Pagination } from './Pagination';
import { TransactionItem } from './TransactionItem';
import { triggerHaptic, HapticFeedbackLevel } from '../utils/haptics';

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionClick?: (transaction: Transaction) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onTransactionClick }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [swipedItem, setSwipedItem] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const listTopRef = useRef<HTMLDivElement>(null);
  
  const ITEMS_PER_PAGE = 20;
  
  // Filter out deleted and archived transactions
  const filteredTransactions = transactions.filter(
    t => !deletedIds.has(t.id) && !archivedIds.has(t.id)
  );
  
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  
  // When filtered transactions change, reset to first page
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredTransactions.length]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const paginatedTransactions = transactions
    .filter(t => !deletedIds.has(t.id) && !archivedIds.has(t.id))
    .slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );

  // Gesture handlers for transaction items
  const handleTransactionSwipeLeft = (transactionId: string) => {
    triggerHaptic(HapticFeedbackLevel.LIGHT);
    // Archive: add to archived set and remove from display
    setArchivedIds(prev => new Set(prev).add(transactionId));
    setSwipedItem(null);
    console.log('Archived transaction:', transactionId);
  };

  const handleTransactionSwipeRight = (transactionId: string) => {
    triggerHaptic(HapticFeedbackLevel.LIGHT);
    // Delete: add to deleted set and remove from display
    setDeletedIds(prev => new Set(prev).add(transactionId));
    setSwipedItem(null);
    console.log('Deleted transaction:', transactionId);
  };

  const handleSwipeCancel = () => {
    setSwipedItem(null);
  };

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
          <TransactionItem
            key={t.id}
            transaction={t}
            isActive={swipedItem === t.id}
            onSwipeLeft={() => handleTransactionSwipeLeft(t.id)}
            onSwipeRight={() => handleTransactionSwipeRight(t.id)}
            onSwipeCancel={handleSwipeCancel}
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
        />
      )}
    </div>
  );
};
