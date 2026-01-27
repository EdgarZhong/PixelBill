import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number, isDragging?: boolean) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  // 使用 ref 追踪 isDragging 状态，避免 useEffect 依赖变化导致的回滚
  const isDraggingRef = useRef(isDragging);
  const [dragPage, setDragPage] = useState(currentPage);
  const trackRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);

  // 统一的视觉激活状态：拖拽中 或 动画进行中
  const isVisualActive = isDragging || isAnimating;

  // 辅助函数：触发移动动画状态
  const triggerAnimation = () => {
    setIsAnimating(true);
    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current);
    }
    // 300ms 对应 CSS transition duration
    animationTimeoutRef.current = window.setTimeout(() => {
      setIsAnimating(false);
    }, 300);
  };

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // 同步 isDragging 到 ref
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // 仅当 currentPage 变化时同步到 dragPage
  // 这样在松手后（isDragging 变 false 但 currentPage 还没变时），不会强制回滚
  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragPage(currentPage);
    }
  }, [currentPage]);

  // 确保拖拽结束时重置 dragPage (已移除，避免震动)

  // 计算滑块位置百分比 (0-100)
  // page 1 -> 0%, page total -> 100%
  const getProgress = (page: number) => {
    if (totalPages <= 1) return 0;
    return ((page - 1) / (totalPages - 1)) * 100;
  };

  // 统一使用 dragPage 作为显示源，实现乐观 UI 更新
  const displayPage = dragPage;
  const currentProgress = getProgress(displayPage);

  // 轨道计算优化：确保线条完美跟随，且滑块不遮挡像素块
  // 假设 Container Width = 100%
  // Thumb Width = 120px, Half Thumb = 60px
  // Anchor Width = 8px (w-2)
  // Safe Margin = 8px (Anchor) + 4px (Gap) = 12px? Or just ensure thumb doesn't overlap anchor.
  
  // 但我们使用的是百分比定位。
  // 为了防止滑块遮挡两端像素块，我们需要限制 left 的最小值和最大值。
  // 滑块中心点 left: currentProgress%
  // 左边缘: calc(currentProgress% - 60px)
  // 右边缘: calc(currentProgress% + 60px)
  
  // 容器左边界: 0px. Anchor: 0-8px.
  // 所以左边缘必须 >= 8px (或更多一点留白)
  // 右边缘必须 <= 100% - 8px.
  
  // 由于我们是基于 page (discrete steps) 计算 progress，而不是自由拖动像素。
  // 所以需要在 getProgress 映射时或者在 CSS 渲染时做 clamp。
  // 但 page 1 对应 0%，也就是中心在最左侧？不对。
  // 原逻辑: left: currentProgress%. transform: translateX(-50%).
  // 当 page=1 (0%) 时，中心在 0，左边缘在 -60px。这肯定溢出了。
  
  // 修正定位逻辑：
  // 我们希望 page=1 时，滑块左边缘紧贴左侧像素块 (left=8px + gap)。
  // page=total 时，滑块右边缘紧贴右侧像素块。
  
  // 设 Container Width = W.
  // Thumb Width = 120px. Anchor = 8px.
  // Available Slide Range for Center Point:
  // Min Center = 8px + 60px = 68px.
  // Max Center = W - 8px - 60px = W - 68px.
  // Range Length = W - 136px.
  
  // 这是一个 CSS calc 问题。
  // left: calc(68px + (100% - 136px) * progress / 100)
  
  const thumbLeftStyle = `calc(68px + (100% - 136px) * ${currentProgress / 100})`;

  // 线条逻辑：
  // Left Segment Width: Thumb Center - 60px (Half Thumb)
  // 但是 Thumb Center 是上面的 calc 值。
  // Width = (68px + (100% - 136px) * P) - 60px = 8px + (100% - 136px) * P
  // Right Segment Width: Total - (Thumb Center + 60px)
  // = 100% - (68px + (100% - 136px) * P + 60px)
  // = 100% - 128px - (100% - 136px) * P
  
  const progressRatio = currentProgress / 100;
  
  // 动画配置：拖拽时禁用，非拖拽时（点击翻页）启用缓动
  const transitionStyle = isDragging ? 'none' : 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)';

  // 处理拖拽
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // 处理触摸拖拽 (移动设备优化)
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // 使用 useEffect 实现全局 pointer 和 touch 事件监听，防止鼠标移出元素时事件丢失
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !trackRef.current) return;
      
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      let ratio = (x - 68) / (width - 136);
      ratio = Math.max(0, Math.min(1, ratio));
      
      const newPage = Math.round(ratio * (totalPages - 1)) + 1;
      if (newPage !== dragPage) {
        setDragPage(newPage);
        onPageChange(newPage, true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !trackRef.current || e.touches.length === 0) return;
      
      const touch = e.touches[0];
      const rect = trackRef.current.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const width = rect.width;
      
      let ratio = (x - 68) / (width - 136);
      ratio = Math.max(0, Math.min(1, ratio));
      
      const newPage = Math.round(ratio * (totalPages - 1)) + 1;
      if (newPage !== dragPage) {
        setDragPage(newPage);
        onPageChange(newPage, true);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDragging) {
        setIsDragging(false);
        if (dragPage !== currentPage) {
          onPageChange(dragPage);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isDragging) {
        setIsDragging(false);
        if (dragPage !== currentPage) {
          onPageChange(dragPage);
        }
      }
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragPage, totalPages, currentPage, onPageChange]);

  const handleTrackClick = (e: React.MouseEvent) => {
    if (isDragging || !trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    let ratio = (x - 68) / (width - 136);
    ratio = Math.max(0, Math.min(1, ratio));
    
    const newPage = Math.round(ratio * (totalPages - 1)) + 1;
    if (newPage !== dragPage) {
      setDragPage(newPage);
      onPageChange(newPage);
      triggerAnimation();
    }
  };

  return (
    <div className="relative w-full h-12 flex items-center justify-center mt-12 mb-16 select-none group/container">
      {/* 
        Fiber Track (光纤轨道) 
      */}
      <div 
        ref={trackRef}
        className="absolute inset-0 flex items-center cursor-pointer"
        onClick={handleTrackClick}
      >
        {/* Left Segment */}
        <div 
          className="h-[2px] bg-emerald-500/30 group-hover/container:bg-emerald-500/60 group-hover/container:shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          style={{ 
            width: `calc(8px + (100% - 136px) * ${progressRatio})`, 
            position: 'absolute',
            left: 0,
            transition: transitionStyle
          }}
        />
        {/* Left Anchor */}
        <div className="absolute left-0 w-2 h-2 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />

        {/* Right Segment */}
        <div 
          className="h-[2px] bg-emerald-500/30 group-hover/container:bg-emerald-500/60 group-hover/container:shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          style={{ 
            width: `calc(100% - 128px - (100% - 136px) * ${progressRatio})`,
            position: 'absolute',
            right: 0,
            transition: transitionStyle
          }}
        />
        {/* Right Anchor */}
        <div className="absolute right-0 w-2 h-2 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
      </div>

      {/* 
        Integrated Thumb (集成式滑块) 
      */}
      <div
        className={clsx(
          "absolute h-6 w-[120px] flex items-center justify-between px-2 border z-10 group",
          // 视觉状态处理
          isVisualActive 
            ? "bg-transparent border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]" // Active (透视): 彻底透明
            : "bg-zinc-900 border-zinc-800 hover:border-zinc-400 hover:shadow-[0_0_10px_rgba(255,255,255,0.1)]" // Idle/Hover
        )}
        style={{
          left: thumbLeftStyle,
          transform: 'translateX(-50%)', // Center align based on calculated center point
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: transitionStyle,
          touchAction: 'none' // 防止浏览器默认触摸行为
        }}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
      >
        {/* Prev Button */}
        <button
          className={clsx(
            "text-[10px] font-pixel transition-all duration-200 p-1",
            dragPage <= 1 
              ? "opacity-20 cursor-default" 
              : "cursor-pointer hover:text-emerald-500 hover:scale-110 hover:drop-shadow-[0_0_2px_rgba(16,185,129,0.8)]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (dragPage > 1) {
              setDragPage(dragPage - 1);
              onPageChange(dragPage - 1);
              triggerAnimation();
            }
          }}
          disabled={dragPage <= 1}
        >
          {'<'}
        </button>

        {/* Page Indicator */}
        <span 
          className={clsx(
            "font-pixel text-[10px] transition-colors duration-300 select-none",
            // 在 hover 父容器(group) 或 active(isVisualActive) 时变绿
            (isVisualActive) 
              ? "text-emerald-500"
              : "text-dim group-hover:text-emerald-500"
          )}
        >
          {String(displayPage).padStart(2, '0')}
          <span className="opacity-50 mx-1">/</span>
          <span className="opacity-50">{String(totalPages).padStart(2, '0')}</span>
        </span>

        {/* Next Button */}
        <button
          className={clsx(
            "text-[10px] font-pixel transition-all duration-200 p-1",
            dragPage >= totalPages 
              ? "opacity-20 cursor-default" 
              : "cursor-pointer hover:text-emerald-500 hover:scale-110 hover:drop-shadow-[0_0_2px_rgba(16,185,129,0.8)]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (dragPage < totalPages) {
              setDragPage(dragPage + 1);
              onPageChange(dragPage + 1, false);
              triggerAnimation();
            }
          }}
          disabled={dragPage >= totalPages}
        >
          {'>'}
        </button>
      </div>
      
      {/* 
         Group Wrapper trick for hover effect 
         React event propagation doesn't automatically set CSS hover state on parent based on child logic
         So we manually add a class or structure carefully.
         The thumb div above handles its own hover styles.
         Wait, the requirement was: "Hover滑块时...页码文字变绿".
         So I added `group` class to the Thumb div implicitly? No, I need to add `group` to the div.
      */}
    </div>
  );
};
