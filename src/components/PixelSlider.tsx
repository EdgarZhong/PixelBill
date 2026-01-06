import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PixelSliderProps {
  min: number;
  max: number;
  value: [number, number]; // [start, end] percentage 0-100
  onChange: (value: [number, number]) => void;
  variant?: 'mini' | 'full';
  disabled?: boolean;
}

export const PixelSlider: React.FC<PixelSliderProps> = ({
  value: [start, end],
  onChange,
  variant = 'full',
  disabled = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  const isMini = variant === 'mini';
  // Padding to ensure thumbs don't overflow the container visually.
  // Half of thumb width (approx 12px) = 6px.
  const PADDING_PX = isMini ? 0 : 6; 

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging || !containerRef.current || disabled) return;

      const rect = containerRef.current.getBoundingClientRect();
      // Effective width for the slider track
      const trackWidth = rect.width - (PADDING_PX * 2);
      
      // Calculate relative X position inside the padded area
      const x = e.clientX - rect.left - PADDING_PX;
      
      // Convert to percentage
      const rawPercentage = (x / trackWidth) * 100;
      const percentage = Math.max(0, Math.min(100, rawPercentage));

      if (dragging === 'start') {
        const newStart = Math.min(percentage, end);
        onChange([newStart, end]);
      } else {
        const newEnd = Math.max(percentage, start);
        onChange([start, newEnd]);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, start, end, onChange, disabled, PADDING_PX]);

  // Helper to calculate CSS left position based on percentage and padding
  const getLeftStyle = (percent: number) => {
    if (isMini) return `${percent}%`;
    return `calc(${PADDING_PX}px + (100% - ${PADDING_PX * 2}px) * ${percent} / 100)`;
  };

  return (
    <div 
      className={`relative select-none transition-all duration-300 group ${isMini ? 'h-2 w-full' : 'h-8 px-3 -mx-3'}`} 
      ref={containerRef}
    >
      {/* Base Track */}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 w-full transition-all duration-300 ${isMini ? 'bg-white/20 h-1' : 'bg-gray-800 h-[1px]'}`}
        style={!isMini ? {
            left: `${PADDING_PX}px`,
            right: `${PADDING_PX}px`,
            width: 'auto'
        } : {}}
      />
      
      {/* Active Range */}
      <motion.div 
        layoutId={isMini ? undefined : "slider-range"}
        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300 ${isMini ? 'bg-pixel-green h-1 group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-pixel-green/50 h-[2px] group-hover:bg-pixel-green group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`}
        style={{ 
          left: getLeftStyle(start),
          // Calculate width: End Position - Start Position
          width: isMini 
            ? `${Math.max(0, end - start)}%`
            : `calc((100% - ${PADDING_PX * 2}px) * ${Math.max(0, end - start)} / 100)`,
        }}
        transition={{ duration: 0.1 }}
      />

      {/* Thumbs - Only visible/interactive in full mode */}
      <AnimatePresence>
        {!isMini && (
          <>
            {/* Start Thumb */}
            <motion.div 
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute top-1/2 cursor-ew-resize group z-10 w-6 h-6 flex items-center justify-center"
              style={{ 
                left: getLeftStyle(start),
                x: "-50%",
                y: "-50%"
              }}
              onMouseDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                setDragging('start');
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`font-pixel text-[10px] transition-colors pb-[3px] ${dragging === 'start' ? 'text-pixel-green' : 'text-primary group-hover:text-white'}`}>
                [
              </div>
            </motion.div>

            {/* End Thumb */}
            <motion.div 
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute top-1/2 cursor-ew-resize group z-10 w-6 h-6 flex items-center justify-center"
              style={{ 
                left: getLeftStyle(end),
                x: "-50%",
                y: "-50%"
              }}
              onMouseDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                setDragging('end');
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`font-pixel text-[10px] transition-colors pb-[3px] ${dragging === 'end' ? 'text-pixel-green' : 'text-primary group-hover:text-white'}`}>
                ]
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
