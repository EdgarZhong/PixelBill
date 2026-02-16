import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, LockOpen, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { VerticalCategoryPicker } from './VerticalCategoryPicker';

interface CategorySelectorProps {
  category: string;
  isLocked: boolean;
  onToggleLock: () => void;
  onSelect: (category: string) => void;
  categories: string[];
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  category,
  isLocked,
  onToggleLock,
  onSelect,
  categories,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // Local state for temporary selection inside the panel
  const [tempCategory, setTempCategory] = useState(category);

  // Sync temp state when opening or prop changes
  useEffect(() => {
    if (isOpen) {
      setTempCategory(category);
    }
  }, [isOpen, category]);

  const handleOpen = () => {
    if (!isLocked) {
      setTempCategory(category);
      setIsOpen(true);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    // Commit the selection only when closing
    if (tempCategory !== category) {
      onSelect(tempCategory);
    }
  };

  const handleTempSelect = (newCategory: string) => {
    setTempCategory(newCategory);
  };

  // Prevent background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <div className="flex items-center gap-3 w-full relative z-10">
      {/* 1. Lock Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onToggleLock}
        className={`
          flex items-center justify-center w-10 h-10 rounded-lg border
          transition-colors duration-200
          ${isLocked 
            ? 'border-gray-800 text-gray-400 bg-[#09090b]' 
            : 'border-white/50 text-pixel-green bg-[#09090b] hover:bg-white/5'
          }
        `}
      >
        {isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
      </motion.button>

      {/* 2. Category Trigger Button */}
      <div className="relative flex-1 h-10">
        <motion.button
          onClick={handleOpen}
          disabled={isLocked}
          className={`
            w-full h-full flex items-center justify-between px-4
            border rounded-lg select-none
            transition-all duration-200
            ${isLocked 
              ? 'border-gray-800 text-gray-400 bg-[#09090b] cursor-not-allowed' 
              : 'border-white/50 text-pixel-green bg-[#09090b] cursor-pointer hover:bg-white/5'
            }
          `}
        >
          <motion.span 
            className="font-mono text-sm tracking-wider font-bold"
            animate={!isLocked ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
            transition={!isLocked ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
          >
            {category.toUpperCase()}
          </motion.span>
          
          {/* Indicator */}
          {!isLocked && (
            <div className="w-1.5 h-1.5 bg-pixel-green rounded-full" />
          )}
        </motion.button>
      </div>

      {/* 3. Portal Overlay for Open State */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div 
              key="overlay-wrapper"
              className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ pointerEvents: 'auto' }}
            >
              {/* Backdrop */}
              <div
                onClick={handleClose}
                className="absolute inset-0 bg-black/80"
              />

              {/* Modal Panel */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="
                  relative w-full max-w-sm overflow-hidden
                  bg-[#09090b] border border-white/50 
                  rounded-xl flex flex-col shadow-none
                "
                style={{ maxHeight: '70vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/20 bg-[#09090b]">
                  <span className="font-mono text-sm tracking-wider font-bold text-pixel-green">
                    SELECT CATEGORY
                  </span>
                  <button 
                    onClick={handleClose}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Picker */}
                <div className="py-4 bg-[#09090b]">
                   <VerticalCategoryPicker
                     categories={categories}
                     selectedCategory={tempCategory}
                     onSelect={handleTempSelect}
                   />
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-white/20 bg-[#09090b] text-center">
                  <span className="text-[10px] text-gray-500 font-mono">SCROLL TO SELECT</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
