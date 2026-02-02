import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronDown, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useSafeArea } from '../hooks/useSafeArea';
import { useLedger } from '../hooks/useLedger';
import type { Transaction } from '../types';
import { CategoryDict } from '../types/metadata';

interface TransactionDetailViewProps {
  transaction: Transaction;
  onClose: () => void;
}

export const TransactionDetailView: React.FC<TransactionDetailViewProps> = ({
  transaction,
  onClose
}) => {
  const safeArea = useSafeArea();
  const { service, ledgerMemory } = useLedger();
  const [note, setNote] = useState(transaction.user_note || '');
  
  // Update local state when transaction changes
  useEffect(() => {
    setNote(transaction.user_note || '');
  }, [transaction.user_note]);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value;
    // When category changes, we keep the current note
    service.updateCategory(transaction.id, newCategory, note);
  };

  const handleNoteBlur = () => {
    // Only save if changed
    if (note !== transaction.user_note) {
      // updateCategory takes (id, category, reasoning/note)
      // Note: The third argument is 'newReasoning' which maps to 'user_note' for USER source
      service.updateCategory(transaction.id, transaction.category, note);
    }
  };

  const definedCategories = ledgerMemory?.defined_categories || ['meal', 'others'];
  
  // Format helpers
  // Fallback to time string parsing if originalDate is missing (safety)
  const dateObj = transaction.originalDate || new Date(transaction.time);
  const formattedDate = format(dateObj, 'yyyy-MM-dd HH:mm');

  // Touch handling for swipe-to-close
  const detailTouchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    detailTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!detailTouchStartRef.current) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - detailTouchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - detailTouchStartRef.current.y);
    const timeDelta = Date.now() - detailTouchStartRef.current.timestamp;
    const screenWidth = window.innerWidth;

    // Swipe from edges (back gesture)
    const fromLeftEdge = detailTouchStartRef.current.x < 50 && deltaX > 50;
    const fromRightEdge = detailTouchStartRef.current.x > screenWidth - 50 && deltaX < -50;

    if (
      (fromLeftEdge || fromRightEdge) && 
      deltaY < 50 && 
      timeDelta < 300
    ) {
      onClose();
    }

    detailTouchStartRef.current = null;
  }, [onClose]);

  return (
    <motion.div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-background text-primary font-mono overflow-x-hidden overflow-y-auto"
      style={{
        paddingTop: `max(1rem, ${safeArea.top}px)`,
        paddingBottom: `max(1rem, ${safeArea.bottom}px)`,
        paddingLeft: `max(1rem, ${safeArea.left}px)`,
        paddingRight: `max(1rem, ${safeArea.right}px)`
      }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="text-3xl font-bold tracking-tight">
           {transaction.direction === 'out' ? '-' : '+'}{Math.abs(transaction.amount).toFixed(2)}
        </div>
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* Info Body */}
      <div className="space-y-6 mb-12">
        {/* Basic Info */}
        <div className="grid grid-cols-1 gap-4 text-sm opacity-80">
            <div>
                <span className="block text-xs opacity-50 mb-1">TIME</span>
                {formattedDate}
            </div>
            <div>
                <span className="block text-xs opacity-50 mb-1">COUNTERPARTY</span>
                {transaction.counterparty}
            </div>
            <div>
                <span className="block text-xs opacity-50 mb-1">PRODUCT / REMARK</span>
                {transaction.product || transaction.remark}
            </div>
             <div>
                <span className="block text-xs opacity-50 mb-1">TRANSACTION ID</span>
                <span className="text-xs font-mono break-all opacity-50">{transaction.id}</span>
            </div>
        </div>

        {/* AI Insight Section */}
        {transaction.ai_category && (
            <div className="p-4 rounded border border-cyan-900/30 bg-cyan-950/10 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50" />
                <div className="flex items-center gap-2 text-cyan-400 mb-2">
                    <Sparkles size={14} />
                    <span className="text-xs font-bold uppercase tracking-wider">AI Insight</span>
                </div>
                <div className="text-sm text-cyan-200/80">
                    Suggested category: <span className="font-bold text-cyan-100">{CategoryDict[transaction.ai_category] || transaction.ai_category}</span>
                </div>
                {transaction.ai_reasoning && (
                    <div className="mt-2 text-xs text-cyan-200/60 italic leading-relaxed">
                        "{transaction.ai_reasoning}"
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Action Deck */}
      <div className="space-y-6">
        
        {/* Category Selector */}
        <div className="space-y-2">
            <label className="text-xs font-bold opacity-50 tracking-wider uppercase">Category</label>
            <div className="relative">
                <select 
                    value={transaction.category}
                    onChange={handleCategoryChange}
                    className="w-full appearance-none bg-white/5 border border-white/10 rounded p-4 pr-10 text-lg focus:outline-none focus:border-primary/50 transition-colors"
                >
                    {definedCategories.map(cat => (
                        <option key={cat} value={cat} className="bg-black text-white">
                            {CategoryDict[cat] || cat}
                        </option>
                    ))}
                    {/* Ensure current category is an option even if not in defined list */}
                    {!definedCategories.includes(transaction.category) && (
                        <option value={transaction.category} className="bg-black text-white">
                            {CategoryDict[transaction.category] || transaction.category}
                        </option>
                    )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                    <ChevronDown size={20} />
                </div>
            </div>
        </div>

        {/* Note Input */}
        <div className="space-y-2">
            <label htmlFor="note-input" className="text-xs font-bold opacity-50 tracking-wider uppercase">Note</label>
            <textarea
                id="note-input"
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Add a note..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded p-4 text-base focus:outline-none focus:border-primary/50 transition-colors resize-none placeholder:text-white/20"
            />
        </div>
      </div>
    </motion.div>
  );
};
