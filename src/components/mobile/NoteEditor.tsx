import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface NoteEditorProps {
  note: string;
  isLocked: boolean;
  onSave: (note: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ 
  note, 
  isLocked, 
  onSave 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempNote, setTempNote] = useState(note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uniqueId = React.useId(); // 生成唯一ID以避免 layoutId 冲突

  // 当外部 note 更新时，同步内部状态
  useEffect(() => {
    setTempNote(note);
  }, [note]);

  // 处理打开
  const handleOpen = () => {
    if (isLocked) return;
    setTempNote(note); // 重置为当前 note
    setIsOpen(true);
  };

  // 处理关闭 (触发保存)
  const handleClose = () => {
    // 只有在面板关闭时才调用 onSave
    if (tempNote !== note) {
      onSave(tempNote);
    }
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative min-w-[100px]">
        {/* Resting State: 静止状态 (显示在列表中) */}
        {!isOpen ? (
          <motion.div
            layoutId={`note-container-${uniqueId}`}
            onClick={handleOpen}
            className={twMerge(
              "group cursor-pointer overflow-hidden transition-colors duration-300",
              "border-b py-1 w-full", // 基础样式
              // Unlocked Style: 白色半透明边框，绿色文字(呼吸效果由子元素控制)
              !isLocked && "border-white/50 hover:border-pixel-green",
              // Locked Style: 深灰边框，灰色文字
              isLocked && "border-gray-800 pointer-events-none opacity-50"
            )}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <motion.div 
              layoutId={`note-content-${uniqueId}`}
              className={clsx(
                "font-mono text-xs truncate transition-colors duration-300",
                // Unlocked: 像素绿 (呼吸效果) 或 灰色(空值)
                !isLocked && (tempNote ? "text-pixel-green animate-pulse-slow" : "text-pixel-green/50 italic"),
                // Locked: 灰色
                isLocked && "text-gray-400"
              )}
            >
              {note || "ADD NOTE..."}
            </motion.div>
          </motion.div>
        ) : (
          /* Placeholder: 占位符，防止列表高度塌陷 */
          <div className="border-b border-transparent py-1 w-full opacity-0 pointer-events-none" aria-hidden="true">
            <div className="font-mono text-xs truncate">
              {note || "ADD NOTE..."}
            </div>
          </div>
        )}
      </div>

      {/* Open State: 展开状态 (Portal 到 Body) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop: 遮罩层 - 纯黑低透明度，无模糊 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleClose}
                className="fixed inset-0 bg-black/80 z-[9998]"
                transition={{ duration: 0.2, ease: "easeInOut" }} // Micro Layer
              />

              {/* Panel: 编辑面板 */}
              <motion.div
                layoutId={`note-container-${uniqueId}`}
                className={clsx(
                  "fixed top-4 left-4 right-4 h-40 z-[9999]",
                  "bg-[#09090b]", // Panel Bg: #09090b
                  "border border-pixel-green", // Clean Modern Pixel Border
                  "flex flex-col overflow-hidden"
                )}
                transition={{ duration: 0.3, ease: "easeInOut" }} // Component Layer: 0.3s easeInOut
              >
                {/* Header / Toolbar */}
                <div className="flex justify-between items-center px-3 py-2 border-b border-pixel-green/20 bg-pixel-green/5">
                  <span className="font-pixel text-[10px] text-pixel-green tracking-wider">
                    EDIT_NOTE
                  </span>
                  <button 
                    onClick={handleClose}
                    className="text-pixel-green/70 hover:text-pixel-green transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Textarea Area */}
                <div className="flex-1 relative p-3">
                  <motion.textarea
                    ref={textareaRef}
                    layoutId={`note-content-${uniqueId}`}
                    value={tempNote}
                    onChange={(e) => setTempNote(e.target.value)}
                    className="w-full h-full bg-transparent text-pixel-green font-mono text-sm resize-none outline-none placeholder:text-pixel-green/30"
                    placeholder="ENTER NOTE..."
                    autoFocus
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
