import React from 'react';
import { motion } from 'framer-motion';

interface PullIndicatorProps {
  /** 下拉进度 (0-1) */
  progress: number;
  /** 是否已触发（达到阈值） */
  isTriggered: boolean;
}

/**
 * [下拉指示器] 组件
 * 下拉过程中显示在 Header 下方的绿色像素指示器
 * 三个像素点随下拉距离增大间距和亮度
 * 达到阈值时收拢为横线
 *
 * 设计规范：
 * - 常态隐藏在 Header 下方
 * - 下拉中：3个垂直像素点，间距和亮度随 progress 变化
 * - 触发态：三点收拢为横线
 */
export const PullIndicator: React.FC<PullIndicatorProps> = ({
  progress,
  isTriggered
}) => {
  // 像素点间距：从 4px 到 12px
  const gap = 4 + progress * 8;
  // 亮度：从 0.3 到 1
  const opacity = 0.3 + progress * 0.7;
  // 发光强度
  const glowOpacity = progress * 0.8;

  // 避免在 progress 为 0 时渲染不必要的内容
  if (progress <= 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 h-12 flex items-center justify-center pointer-events-none z-20" style={{ willChange: 'opacity' }}>
      <motion.div
        className="flex flex-col items-center"
        style={{ gap: isTriggered ? 2 : gap }}
        animate={{
          gap: isTriggered ? 2 : gap
        }}
        transition={{ duration: 0.12, ease: "easeOut" }}
      >
        {/* 三个像素点或收拢横线 */}
        {isTriggered ? (
          // 触发态：横线
          <motion.div
            initial={{ width: 6, height: 6 }}
            animate={{ width: 32, height: 2 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="bg-pixel-green shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            style={{ willChange: 'width, height' }}
          />
        ) : (
          // 下拉态：三个像素点
          <>
            {[0, 1, 2].map((index) => (
              <motion.div
                key={index}
                className="w-1.5 h-1.5 bg-pixel-green"
                style={{
                  opacity: opacity * (0.5 + index * 0.25),
                  boxShadow: `0 0 ${4 + progress * 4}px rgba(16,185,129,${glowOpacity})`
                }}
                animate={{
                  scale: progress > 0.8 ? 1 + (progress - 0.8) * 2 : 1
                }}
                transition={{ duration: 0.08 }}
              />
            ))}
          </>
        )}
      </motion.div>

      {/* 提示文字 - 仅在即将触发时显示 */}
      <motion.div
        className="absolute top-8 text-[8px] font-mono text-pixel-green tracking-wider"
        initial={{ opacity: 0, y: -5 }}
        animate={{
          opacity: progress > 0.6 && !isTriggered ? (progress - 0.6) * 2.5 : 0,
          y: progress > 0.6 ? 0 : -5
        }}
        transition={{ duration: 0.2 }}
      >
        [RELEASE_TO_OPEN]
      </motion.div>
    </div>
  );
};
