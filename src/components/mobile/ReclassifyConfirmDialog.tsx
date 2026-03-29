/**
 * ReclassifyConfirmDialog - 渐进式重分类范围确认对话框
 *
 * v5.1 冻结口径：
 * - 新增标签 / 修改描述：先询问"是否重新分类"，再选范围
 * - 删除标签：直接选范围（前置改写已完成，跳过询问步骤）
 * - 用户点击范围按钮时，当场完成 dirtyDates 计算 → 入队 → 自动启动消费
 * - 重命名标签：不触发此对话框
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { LedgerService } from '../../core/services/LedgerService';
import { BatchProcessor } from '../../core/ai_engine/BatchProcessor';

/**
 * 操作类型决定对话框行为
 * - add: 新增标签，范围选项：[仅未分类] / [全量未锁定]
 * - delete: 删除标签，直接进入范围选择，选项：[仅受影响] / [全量未锁定]
 * - update_desc: 修改描述，范围选项：[仅该标签下未锁定] / [全量未锁定]
 */
export type ReclassifyMode = 'add' | 'delete' | 'update_desc';

export interface ReclassifyConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 操作类型 */
  mode: ReclassifyMode;
  /** 操作涉及的标签名（delete / update_desc 模式下使用） */
  categoryName?: string;
  /**
   * 删除标签时，前置改写阶段已计算好的受影响日期列表。
   * delete 模式下由父组件传入，避免对话框自行重算。
   */
  affectedDirtyDates?: string[];
}

/**
 * 单个范围选项的定义
 */
interface RangeOption {
  /** 按钮标签 */
  label: string;
  /** 选项说明 */
  desc: string;
  /** 点击时执行的 dirtyDates 计算函数 */
  getDirtyDates: () => string[];
}

export const ReclassifyConfirmDialog: React.FC<ReclassifyConfirmDialogProps> = ({
  isOpen,
  onClose,
  mode,
  categoryName,
  affectedDirtyDates = []
}) => {
  /**
   * 对话框内部步骤：
   * - 'ask'：询问是否重新分类（add / update_desc 模式专用）
   * - 'range'：选择重分类范围
   */
  const [step, setStep] = useState<'ask' | 'range'>(mode === 'delete' ? 'range' : 'ask');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // 重置内部状态（每次 isOpen 变化时）
  React.useEffect(() => {
    if (isOpen) {
      setStep(mode === 'delete' ? 'range' : 'ask');
      setIsProcessing(false);
      setResultMsg(null);
    }
  }, [isOpen, mode]);

  /**
   * 执行入队并自动启动消费
   * v5.1 约束：范围按钮点击 → 当场入队 → 自动通知消费端启动
   */
  const handleRangeConfirm = useCallback(async (getDirtyDates: () => string[]) => {
    setIsProcessing(true);
    try {
      const service = LedgerService.getInstance();
      const dirtyDates = getDirtyDates();

      if (dirtyDates.length === 0) {
        setResultMsg('当前范围内没有需要重分类的交易');
        return;
      }

      // 入队（已含补偿 recovery 机制）
      const enqueueSuccess = await service.enqueueReclassifyForConfirmedDates(
        dirtyDates,
        `reclassify_${mode}_confirmed`
      );

      if (!enqueueSuccess) {
        setResultMsg(`入队失败，${dirtyDates.length} 个日期已写入补偿文件，下次启动时自动恢复`);
        return;
      }

      /**
       * 入队成功后自动通知消费端启动。
       * 若消费端已在 ANALYZING 状态，则忽略（队列中的新任务会被循环消费自然处理）。
       */
      const processor = BatchProcessor.getInstance();
      if (processor.isStopping || processor['status'] !== 'ANALYZING') {
        // 不阻塞对话框关闭：run() 异步执行，不 await
        void processor.run().catch((err: unknown) => {
          console.warn('[ReclassifyConfirmDialog] BatchProcessor.run() error:', err);
        });
      }

      setResultMsg(`已入队 ${dirtyDates.length} 个日期，AI 重分类已启动`);
      // 短暂展示结果后关闭
      setTimeout(onClose, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResultMsg(`操作失败：${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [mode, onClose]);

  /**
   * 根据操作类型构造范围选项列表
   */
  const buildRangeOptions = useCallback((): RangeOption[] => {
    const service = LedgerService.getInstance();

    if (mode === 'add') {
      return [
        {
          label: '[仅未分类的交易]',
          desc: '仅对未分类且未锁定的交易重新分类',
          getDirtyDates: () => service.collectDirtyDatesByPredicate(
            (r) => !r.is_verified && (!r.category || r.category === 'uncategorized')
          )
        },
        {
          label: '[全量（未锁定的交易）]',
          desc: '对所有未锁定交易重新分类（已锁定交易受保护，不受影响）',
          getDirtyDates: () => service.collectDirtyDatesForAll()
        }
      ];
    }

    if (mode === 'delete') {
      return [
        {
          label: '[仅受影响的交易]',
          desc: `仅对原属于被删标签、已重置为未分类的交易重新分类（${affectedDirtyDates.length} 天）`,
          getDirtyDates: () => affectedDirtyDates
        },
        {
          label: '[全量（所有未锁定的交易）]',
          desc: '对所有未锁定交易重新分类（已锁定交易受保护，不受影响）',
          getDirtyDates: () => service.collectDirtyDatesForAll()
        }
      ];
    }

    // mode === 'update_desc'
    return [
      {
        label: `[仅该标签下的未锁定交易]`,
        desc: `仅对当前分类为 [${categoryName}] 且未锁定的交易重新分类`,
        getDirtyDates: () => service.collectDirtyDatesByPredicate(
          (r) => !r.is_verified && r.category === categoryName
        )
      },
      {
        label: '[全量（所有未锁定的交易）]',
        desc: '对所有未锁定交易重新分类（已锁定交易受保护，不受影响）',
        getDirtyDates: () => service.collectDirtyDatesForAll()
      }
    ];
  }, [mode, categoryName, affectedDirtyDates]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6 pointer-events-none">
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={!isProcessing ? onClose : undefined}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-auto"
          />

          {/* 对话框主体 */}
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto relative w-full max-w-sm bg-zinc-950 border border-gray-700 rounded shadow-[0_0_20px_rgba(255,255,255,0.04)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-[10px] font-mono text-pixel-green tracking-widest">
                {step === 'ask' ? '[RECLASSIFY?]' : '[SELECT_RANGE]'}
              </span>
              {!isProcessing && (
                <button
                  onClick={onClose}
                  className="text-dim text-xs font-mono hover:text-white transition-colors"
                >
                  [×]
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* 结果反馈 */}
              {resultMsg && (
                <div className="px-3 py-2 rounded text-[11px] font-mono text-pixel-green bg-pixel-green/5 border border-pixel-green/20">
                  {resultMsg}
                </div>
              )}

              {/* 步骤 1：询问是否重新分类 */}
              {step === 'ask' && !resultMsg && (
                <>
                  <p className="text-xs font-mono text-gray-300 leading-relaxed">
                    标签已更新。是否现在对相关交易执行重新分类？
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-2 border border-gray-700 rounded text-[11px] font-mono text-dim hover:border-gray-500 transition-colors"
                    >
                      [暂时跳过]
                    </button>
                    <button
                      onClick={() => setStep('range')}
                      className="flex-1 py-2 border border-pixel-green/40 rounded text-[11px] font-mono text-pixel-green hover:bg-pixel-green/10 transition-colors"
                    >
                      [现在重新分类]
                    </button>
                  </div>
                </>
              )}

              {/* 步骤 2：选择范围 */}
              {step === 'range' && !resultMsg && (
                <>
                  {mode === 'delete' && (
                    <p className="text-[11px] font-mono text-dim leading-relaxed">
                      标签已删除，关联交易已重置为未分类。请选择重新分类的范围：
                    </p>
                  )}
                  {mode !== 'delete' && (
                    <p className="text-[11px] font-mono text-dim leading-relaxed">
                      请选择需要重新分类的交易范围：
                    </p>
                  )}
                  <div className="space-y-2">
                    {buildRangeOptions().map((option) => (
                      <button
                        key={option.label}
                        disabled={isProcessing}
                        onClick={() => void handleRangeConfirm(option.getDirtyDates)}
                        className="w-full p-3 text-left border border-gray-700 rounded
                          hover:border-pixel-green/50 hover:bg-pixel-green/5
                          disabled:opacity-40 disabled:cursor-not-allowed
                          transition-colors group"
                      >
                        <div className="text-[11px] font-mono text-pixel-green group-hover:text-pixel-green/90">
                          {option.label}
                        </div>
                        <div className="text-[10px] font-mono text-dim mt-0.5 leading-relaxed">
                          {option.desc}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 处理中指示 */}
                  {isProcessing && (
                    <div className="text-[10px] font-mono text-dim text-center animate-pulse">
                      [正在入队并启动分类...]
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
