import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';

interface VerticalCategoryPickerProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
}

export const VerticalCategoryPicker: React.FC<VerticalCategoryPickerProps> = ({
  categories,
  selectedCategory,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Refs for state management without re-renders
  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSelectedProp = useRef(selectedCategory);

  // Internal state for visual feedback ONLY (decoupled from prop)
  const [visualCategory, setVisualCategory] = useState(selectedCategory);

  // Constants
  const ITEM_HEIGHT = 48; // px
  const VISIBLE_ITEMS = 5;
  const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
  
  // 1. Extended List: [Buffer][Core][Buffer]
  // Triple clone for infinite scroll illusion
  const extendedCategories = useMemo(() => {
    if (categories.length === 0) return [];
    return [...categories, ...categories, ...categories];
  }, [categories]);

  // 2. Smooth Scroll Utility
  const smoothScrollTo = useCallback((element: HTMLElement, target: number, duration: number, onComplete?: () => void) => {
    const start = element.scrollTop;
    const change = target - start;
    const startTime = performance.now();

    const easeOutQuart = (x: number): number => {
      return 1 - Math.pow(1 - x, 4);
    };

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;

      if (elapsed < duration) {
        const progress = easeOutQuart(elapsed / duration);
        element.scrollTop = start + change * progress;
        animationFrameRef.current = requestAnimationFrame(animateScroll);
      } else {
        element.scrollTop = target;
        animationFrameRef.current = null;
        if (onComplete) onComplete();
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(animateScroll);
  }, []);

  // 3. Calculate Center Item Index
  const getCenterItemIndex = useCallback(() => {
    if (!containerRef.current || categories.length === 0) return -1;
    const container = containerRef.current;
    const centerOffset = container.scrollTop + CONTAINER_HEIGHT / 2;
    // item index = floor(center / height) - padding_offset
    // But since we have top padding, the first item starts at scrollTop = 0 if padding is handled differently
    // Actually:
    // Container Content: [PaddingTop][Item0][Item1]...
    // PaddingTop = (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2
    // Item N center = PaddingTop + N * ITEM_HEIGHT + ITEM_HEIGHT / 2
    
    const paddingTop = (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2;
    // Relative to content top (0)
    // We want to find N such that ItemCenter is closest to (scrollTop + ContainerHeight/2)
    // scrollTop + ContainerHeight/2 = PaddingTop + N * ITEM_HEIGHT + ITEM_HEIGHT/2
    // scrollTop + 2.5 * H = 2H + N*H + 0.5H (assuming 5 visible items)
    // scrollTop = N * H
    
    // Simplification: The scroll position perfectly aligns with item index N when scrollTop = N * ITEM_HEIGHT
    // So index = Math.round(scrollTop / ITEM_HEIGHT)
    
    return Math.round(container.scrollTop / ITEM_HEIGHT);
  }, [CONTAINER_HEIGHT, ITEM_HEIGHT, categories.length]);

  // 4. Snap Logic
  const snapToCenter = useCallback(() => {
    if (!containerRef.current || categories.length === 0) return;
    const container = containerRef.current;
    
    const currentIndex = getCenterItemIndex();
    const targetScroll = currentIndex * ITEM_HEIGHT;
    
    // Determine the actual category based on the extended index
    const categoryIndex = currentIndex % categories.length;
    const targetCategory = categories[categoryIndex];

    // Smooth scroll to snap
    smoothScrollTo(container, targetScroll, 200, () => {
        // Animation Complete
        isUserScrolling.current = false;
        
        // Trigger external update ONLY here
        if (targetCategory !== selectedCategory) {
            onSelect(targetCategory);
        }
    });
  }, [categories, ITEM_HEIGHT, getCenterItemIndex, onSelect, selectedCategory, smoothScrollTo]);

  // 5. Scroll Handler (Infinite Loop + Visual Update + Snap Trigger)
  const handleScroll = useCallback(() => {
    if (!containerRef.current || categories.length === 0) return;
    
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const oneSetHeight = categories.length * ITEM_HEIGHT;

    // A. Infinite Scroll Jump (Buffer Logic)
    if (scrollTop < oneSetHeight / 2) {
      container.scrollTop += oneSetHeight;
      // Adjust scrollTop immediately, no return, continue to calculate visual
    } else if (scrollTop > oneSetHeight * 2.5) {
      container.scrollTop -= oneSetHeight;
    }

    // B. Visual Feedback (Decoupled from prop)
    const currentIndex = Math.round(container.scrollTop / ITEM_HEIGHT);
    const categoryIndex = currentIndex % categories.length;
    if (categories[categoryIndex] !== visualCategory) {
        setVisualCategory(categories[categoryIndex]);
    }

    // C. Debounce Snap
    if (isUserScrolling.current) {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            snapToCenter();
        }, 150); // 150ms debounce for scroll end
    }
  }, [categories, ITEM_HEIGHT, visualCategory, snapToCenter]);

  // 6. Interaction Handlers
  const handleTouchStart = () => {
    isUserScrolling.current = true;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  };
  
  // Also handle mouse wheel / trackpad
  // Note: 'scroll' event fires for both touch and wheel, but we need to know when "interaction starts"
  // to set the flag. For wheel, it's harder, but the debounce logic in handleScroll covers the "end".
  // The missing part is blocking external updates during wheel scroll.
  // We can set isUserScrolling = true in handleScroll if it's not already? 
  // But that might block programmatic scrolls.
  // Better to rely on explicit events or assume scroll event implies user if not programmatic.
  // Implementation: We'll set isUserScrolling=true in onPointerDown/onTouchStart.
  // For Wheel, we might need a separate handler if strict blocking is needed, 
  // but usually touch is the main concern for mobile.
  
  // 7. Sync with External Prop
  useEffect(() => {
    // Skip if scrolling or if the prop hasn't actually changed (avoid redundant work)
    if (isUserScrolling.current || selectedCategory === lastSelectedProp.current) {
        // Just update the ref if we skipped
        if (selectedCategory !== lastSelectedProp.current) {
            lastSelectedProp.current = selectedCategory;
            // Also update visual to match strict sync if needed? 
            // If user is scrolling, we DON'T update visual from prop.
        }
        return;
    }

    lastSelectedProp.current = selectedCategory;
    setVisualCategory(selectedCategory);

    if (!containerRef.current || categories.length === 0) return;

    // Calculate target position for the Middle Set (Core)
    const categoryIndex = categories.indexOf(selectedCategory);
    if (categoryIndex === -1) return;

    // Target is in the middle set (Set 2)
    // Index = categories.length (Set 1) + categoryIndex
    const targetIndex = categories.length + categoryIndex;
    const targetScroll = targetIndex * ITEM_HEIGHT;
    
    const container = containerRef.current;
    
    // If distance is large, jump; else smooth scroll
    if (Math.abs(container.scrollTop - targetScroll) > ITEM_HEIGHT * 3) {
        container.scrollTop = targetScroll;
    } else {
        smoothScrollTo(container, targetScroll, 300);
    }
    
  }, [selectedCategory, categories, ITEM_HEIGHT, smoothScrollTo]);

  // Cleanup
  useEffect(() => {
      return () => {
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
  }, []);

  return (
    <div className="relative w-full flex items-center justify-center py-4">
      {/* 选中项的高亮背景指示器 (可选) */}
      {/* <div 
        className="absolute w-full bg-white/5 pointer-events-none rounded-lg"
        style={{ height: ITEM_HEIGHT, top: '50%', transform: 'translateY(-50%)' }}
      /> */}

      <div
        ref={containerRef}
        className="w-full overflow-y-auto scrollbar-hide snap-y snap-mandatory touch-pan-y"
        style={{ 
            height: CONTAINER_HEIGHT,
            scrollBehavior: 'auto' // Important: Disable native smooth scroll to control it via JS
        }}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onMouseDown={handleTouchStart} // For desktop testing
        onWheel={() => { isUserScrolling.current = true; }} // Treat wheel as user interaction
      >
        {/* Top Padding for centering */}
        <div style={{ height: (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2 }} />
        
        {extendedCategories.map((cat, index) => {
          const isSelected = cat === visualCategory;
          
          return (
            <motion.div
              key={`${cat}-${index}`}
              className="flex items-center justify-center cursor-pointer snap-center"
              style={{ height: ITEM_HEIGHT }}
              onClick={() => {
                 // Clicking an item snaps to it and selects it
                 isUserScrolling.current = false; // Reset lock
                 if (cat !== selectedCategory) {
                     onSelect(cat);
                 } else {
                     // If already selected but off-center, snap to it
                     snapToCenter();
                 }
              }}
              animate={{
                scale: isSelected ? 1.1 : 0.9,
                opacity: isSelected ? 1 : 0.3,
                color: isSelected ? '#10B981' : '#6B7280', // pixel-green vs dim
              }}
              transition={{
                duration: 0.2
              }}
            >
              <span className={`text-sm font-mono tracking-wider font-bold ${isSelected ? 'text-pixel-green' : 'text-dim'}`}>
                {cat.toUpperCase()}
              </span>
            </motion.div>
          );
        })}
        
        {/* Bottom Padding */}
        <div style={{ height: (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2 }} />
      </div>
      
      {/* Gradients */}
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
    </div>
  );
};
