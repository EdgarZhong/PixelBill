import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Transaction } from '../types';
import { Pagination } from './Pagination';
import { TransactionItem } from './TransactionItem';
import { triggerHaptic, HapticFeedbackLevel } from '../utils/haptics';
import { motion, AnimatePresence } from 'framer-motion';

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionClick?: (transaction: Transaction) => void;
  isMobile?: boolean;
  activeTransactionId?: string | null;
  currentFilter?: string;
}

export const TransactionList: React.FC<TransactionListProps> = ({ 
  transactions, 
  onTransactionClick, 
  isMobile = false, 
  activeTransactionId,
  currentFilter = 'ALL'
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [direction, setDirection] = useState(0);
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
    const newDirection = page > currentPage ? 1 : -1;
    setDirection(newDirection);
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
        setDirection(-1);
        setCurrentPage(prev => prev - 1);
      } else if (deltaX < 0 && currentPage < totalPages) {
        // Swipe left - next page
        triggerHaptic(HapticFeedbackLevel.LIGHT);
        setDirection(1);
        setCurrentPage(prev => prev + 1);
      }
    }

    touchStartRef.current = null;
  }, [currentPage, totalPages]);

  // Animation variants for page transitions
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      filter: 'blur(4px)',
      zIndex: 1,
      position: 'relative' as const
    }),
    center: {
      zIndex: 2,
      x: 0,
      opacity: 1,
      filter: 'blur(0px)',
      position: 'relative' as const
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
      filter: 'blur(8px)',
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width: '100%'
    })
  };

  // Helper component for skeleton items
  const SkeletonItem = () => (
    <div className="flex items-start py-3 border-b border-gray-900/50 opacity-50 pointer-events-none select-none">
      <div className="w-6 flex justify-center pt-1">
        <div className="w-3 h-3 bg-gray-700" />
      </div>
      <div className="flex-1 min-w-0 pl-2">
        <div className="w-32 h-5 bg-gray-700/50 mb-1" />
        <div className="w-20 h-4 bg-gray-800/50" />
      </div>
      <div className="w-20 flex flex-col items-end gap-1">
        <div className="w-16 h-5 bg-gray-700/50" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="w-1.5 h-1.5 bg-gray-800" />
          ))}
        </div>
      </div>
    </div>
  );

  const displayItems = [...paginatedTransactions];
  // Fill remaining slots with skeleton items to maintain fixed height (20 items)
  while (displayItems.length < ITEMS_PER_PAGE) {
    displayItems.push({ id: `skeleton-${displayItems.length}`, isSkeleton: true } as any);
  }

  return (
    <div className="font-mono text-sm" ref={listTopRef}>
      <div className="flex justify-between items-center mb-6 text-dim text-xs uppercase tracking-wider">
        <div className="w-6 text-center">Src</div>
        <div className="flex-1 pl-2">Details</div>
        <div className="w-20 text-right">Amount</div>
      </div>

      <div className="relative overflow-hidden" style={{ height: 'calc(20 * 68px + 20px)' }}> {/* Approx height for 20 items */}
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div 
            key={currentPage}
            ref={listContainerRef}
            className="space-y-1 touch-pan-y w-full"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1.0] }}
          >
            {displayItems.map((t) => (
              (t as any).isSkeleton ? (
                <SkeletonItem key={t.id} />
              ) : (
                <TransactionItem
                  key={t.id}
                  transaction={t}
                  onClick={onTransactionClick}
                  isActive={t.id === activeTransactionId}
                  currentFilter={currentFilter}
                />
              )
            ))}
            
            {/* Show message only if truly empty (all skeletons) */}
            {transactions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <div className="text-center py-8 text-dim text-xs bg-background/80 px-4 rounded border border-gray-800">
                    AWAITING_DATA_STREAM...
                 </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
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
