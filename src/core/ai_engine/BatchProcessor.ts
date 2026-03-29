import { AsyncMutex } from '../../utils/AsyncMutex';
import { LLMClient } from '../llm_service/LLMClient';
import { ConfigManager } from '../config/ConfigManager';
import { PromptBuilder } from '../llm_service/prompt/PromptBuilder';
import {
  getAutoDirectoryHandle,
  getLedgerFileHandle,
  readMemoryFile
} from '../../utils/fs-storage';
import type { FullTransactionRecord } from '../../types/metadata';
import type { Proposal } from '../plugin/types';
import type { AIStatus, AIProgress, ProcessingResult } from './types';
import { parse } from 'date-fns';
import { classifyQueue } from './ClassifyQueue';
import { LedgerManager } from '../services/LedgerManager';
import { normalizeToDateKey } from './DateNormalizer';

export interface DayCompletedEvent {
  date: string;
  processedTxsCount: number;
  success: boolean;
  error?: string;
}

export type BatchProcessorEventMap = {
  'status': { status: AIStatus, progress: AIProgress };
  'dayCompleted': DayCompletedEvent;
};

export class BatchProcessor {
  private static instance: BatchProcessor;
  private mutex = new AsyncMutex();
  private status: AIStatus = 'IDLE';
  private progress: AIProgress = { total: 0, current: 0, currentDate: '' };
  private eventListeners: { [K in keyof BatchProcessorEventMap]?: ((data: BatchProcessorEventMap[K]) => void)[] } = {};
  private shouldStop = false;
  private proposalHandler?: (txId: string, proposal: Proposal) => void;

  private constructor() {}

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }

  public setProposalHandler(handler: (txId: string, proposal: Proposal) => void) {
    this.proposalHandler = handler;
  }

  public subscribe(listener: (status: AIStatus, progress: AIProgress) => void) {
    return this.on('status', (data) => {
      listener(data.status, data.progress);
    });
  }

  public on<K extends keyof BatchProcessorEventMap>(event: K, listener: (data: BatchProcessorEventMap[K]) => void) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener);

    if (event === 'status') {
      (listener as (data: BatchProcessorEventMap['status']) => void)({ status: this.status, progress: this.progress });
    }

    return () => {
      const listeners = this.eventListeners[event];
      if (!listeners) {
        return;
      }
      this.eventListeners[event] = listeners.filter(l => l !== listener) as typeof listeners;
    };
  }

  private emit<K extends keyof BatchProcessorEventMap>(event: K, data: BatchProcessorEventMap[K]) {
    const listeners = this.eventListeners[event];
    if (listeners) {
      listeners.forEach(l => l(data));
    }
  }

  private updateState(status: AIStatus, progress?: Partial<AIProgress>) {
    this.status = status;
    if (progress) {
      this.progress = { ...this.progress, ...progress };
    }
    this.emit('status', { status: this.status, progress: this.progress });
  }

  public stop() {
    this.shouldStop = true;
  }

  public get isStopping() {
    return this.shouldStop;
  }

  public async run(): Promise<ProcessingResult> {
    if (this.status === 'ANALYZING') {
      throw new Error('Processor is already running');
    }

    this.shouldStop = false;
    this.updateState('ANALYZING', { total: 0, current: 0, currentDate: '' });

    return this.mutex.dispatch(async () => {
      try {
        const configManager = ConfigManager.getInstance();
        const llmConfig = await configManager.getActiveModelConfig();

        const apiKey = llmConfig.apiKey;
        const baseUrl = llmConfig.baseUrl || 'https://api.deepseek.com';
        const model = llmConfig.model || 'deepseek-chat';

        if (!apiKey) {
          console.warn('[BatchProcessor] API Key not configured for active model:', model);
          throw new Error('API Key not configured');
        }

        /**
         * v5.1 约束：
         * 1) 仅消费当前选中账本；
         * 2) 队列任务业务语义仅 { date }，账本由消费上下文决定。
         */
        const ledgerName = LedgerManager.getInstance().getActiveLedgerName();
        const peekSnapshot = await classifyQueue.peekWithRevision(ledgerName);
        if (!peekSnapshot) {
          this.updateState('IDLE', { total: 0, current: 0, currentDate: '' });
          return { success: true, processedCount: 0, errors: [] };
        }
        const { task, revision } = peekSnapshot;

        if (task.ledger !== ledgerName) {
          throw new Error(`Peeked task ledger mismatch: ${task.ledger} !== ${ledgerName}`);
        }

        if (this.shouldStop) {
          this.updateState('IDLE');
          return { success: true, processedCount: 0, errors: [] };
        }

        const client = new LLMClient({ apiKey, baseUrl, model });

        const dirHandle = await getAutoDirectoryHandle();
        const fileHandle = await getLedgerFileHandle(dirHandle, ledgerName, false);
        if (!fileHandle) {
          throw new Error(`Could not access ledger file: ${ledgerName}`);
        }

        const memory = await readMemoryFile(fileHandle);
        const txs = Object.values(memory.records) as FullTransactionRecord[];
        const dayTxs = txs.filter(tx => normalizeToDateKey(tx.time) === task.date);

        this.updateState('ANALYZING', { total: 1, current: 1, currentDate: task.date });

        if (dayTxs.length === 0) {
          /**
           * 空任务处理：
           * - 通过 revision CAS 删除，避免并发重入时误删新任务；
           * - 仅在成功删除后累计 emptyTask 指标。
           */
          const removedByCas = await classifyQueue.removeIfRevisionMatch(ledgerName, task.date, revision);
          if (removedByCas) {
            const emptyCount = await classifyQueue.incrementEmptyTaskConsumed(ledgerName, task.date);
            console.log(`[BatchProcessor] Empty task consumed for ${ledgerName}/${task.date}, count=${emptyCount}`);
          }
          this.emit('dayCompleted', {
            date: task.date,
            processedTxsCount: 0,
            success: true
          });
          this.updateState('IDLE');
          return { success: true, processedCount: 1, errors: [] };
        }

        try {
          const dayDate = parse(task.date, 'yyyy-MM-dd', new Date());
          const messages = await PromptBuilder.build(dayTxs, dayDate, ledgerName);
          const responseText = await client.chat(messages);

          const aiResult = JSON.parse(responseText);
          if (!aiResult.results || !Array.isArray(aiResult.results)) {
            throw new Error('Invalid AI response structure');
          }

          if (this.proposalHandler) {
            const timestamp = Date.now();
            const latestMemory = await readMemoryFile(fileHandle);
            for (const item of aiResult.results as Array<{ id: string; category: string; reasoning?: string }>) {
              if (!item.id || !item.category) {
                continue;
              }

              const existing = latestMemory.records[item.id] as FullTransactionRecord | undefined;
              if (existing?.is_verified) {
                continue;
              }

              const proposal: Proposal = {
                source: 'AI_AGENT',
                category: item.category,
                reasoning: item.reasoning || '',
                timestamp,
                txId: item.id
              };
              this.proposalHandler(item.id, proposal);
            }
          } else {
            console.warn('[BatchProcessor] No proposal handler registered! Results are lost.');
          }

          this.emit('dayCompleted', {
            date: task.date,
            processedTxsCount: dayTxs.length,
            success: true
          });
          /**
           * 成功后按 CAS 出队，若 revision 已变化，说明队列被并发更新，不应误删。
           */
          await classifyQueue.removeIfRevisionMatch(ledgerName, task.date, revision);

          this.updateState('IDLE');
          return { success: true, processedCount: 1, errors: [] };
        } catch (e: unknown) {
          /**
           * 失败不出队：保留同日任务等待后续重试，满足“失败不丢任务”约束。
           */
          const errorMessage = e instanceof Error ? e.message : String(e);
          this.emit('dayCompleted', {
            date: task.date,
            processedTxsCount: dayTxs.length,
            success: false,
            error: errorMessage
          });
          this.updateState('IDLE');
          return { success: false, processedCount: 0, errors: [`${task.date}: ${errorMessage}`] };
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.updateState('ERROR');
        return { success: false, processedCount: 0, errors: [errorMessage] };
      }
    });
  }
}
