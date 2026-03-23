/**
 * ClassifyQueue - 分类任务队列
 *
 * 职责：
 * 1. 管理分类任务的入队/出队
 * 2. 持久化到沙箱 classify_queue/{ledger}.json（按账本隔离）
 * 3. 任务去重和优先级升级
 * 4. App 重启后恢复队列状态
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

/**
 * 分类任务类型
 * - normal: 正常分类（绿色光效）
 * - reclassify_full: 全量重分类（黄色光效）
 * - reclassify_affected: 仅受影响条目重分类（黄色光效）
 * - reclassify_scoped: 仅指定标签重分类（黄色光效）
 */
export type ClassifyTaskType =
  | 'normal'
  | 'reclassify_full'
  | 'reclassify_affected'
  | 'reclassify_scoped';

/**
 * 分类任务结构
 */
export interface ClassifyTask {
  /** 账本名称 */
  ledger: string;
  /** 日期 (YYYY-MM-DD) */
  date: string;
  /** 任务类型 */
  type: ClassifyTaskType;
  /** 可选：指定标签（仅 reclassify_scoped 使用） */
  tag?: string;
  /** 入队时间戳 */
  enqueuedAt: number;
}

interface LedgerQueueTask {
  date: string;
  type: ClassifyTaskType;
  tag?: string;
  enqueuedAt: number;
}

/**
 * 队列数据结构
 */
interface QueueData {
  version: string;
  tasks: LedgerQueueTask[];
}

const QUEUE_DIR = 'classify_queue';
const QUEUE_VERSION = '1.0';

/**
 * 任务优先级映射（数值越高优先级越高）
 */
const TASK_PRIORITY: Record<ClassifyTaskType, number> = {
  reclassify_full: 3,
  reclassify_affected: 2,
  reclassify_scoped: 2,
  normal: 1
};

/**
 * 分类任务队列管理器
 */
export class ClassifyQueue {
  private static instance: ClassifyQueue;
  private ledgerTasks = new Map<string, LedgerQueueTask[]>();
  private loadedLedgers = new Set<string>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ClassifyQueue {
    if (!ClassifyQueue.instance) {
      ClassifyQueue.instance = new ClassifyQueue();
    }
    return ClassifyQueue.instance;
  }

  // ============================================
  // 队列持久化（按账本）
  // ============================================

  /**
   * 获取账本队列文件路径
   */
  private getLedgerQueuePath(ledger: string): string {
    return `${QUEUE_DIR}/${ledger}.json`;
  }

  /**
   * 读取目录项名称（兼容不同平台返回值）
   */
  private getEntryName(entry: { name: string } | string): string {
    return typeof entry === 'string' ? entry : entry.name;
  }

  /**
   * 获取当前存在队列文件的账本名列表
   */
  private async listLedgersWithQueueFile(): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({
        path: QUEUE_DIR,
        directory: Directory.Data
      });

      return result.files
        .map(file => this.getEntryName(file))
        .filter(fileName => fileName.endsWith('.json'))
        .map(fileName => fileName.slice(0, -5));
    } catch {
      return [];
    }
  }

  /**
   * 加载指定账本队列
   */
  private async loadLedger(ledger: string): Promise<void> {
    if (this.loadedLedgers.has(ledger)) return;

    const queuePath = this.getLedgerQueuePath(ledger);
    try {
      const result = await Filesystem.readFile({
        path: queuePath,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });

      const data = JSON.parse(result.data as string) as QueueData;
      this.ledgerTasks.set(ledger, data.tasks || []);
      console.log(`[ClassifyQueue] Loaded ${ledger}: ${(data.tasks || []).length} tasks`);
    } catch {
      this.ledgerTasks.set(ledger, []);
      console.log(`[ClassifyQueue] No existing queue for ${ledger}, starting fresh`);
    }

    this.loadedLedgers.add(ledger);
  }

  /**
   * 保存指定账本队列
   */
  private async saveLedger(ledger: string): Promise<void> {
    const tasks = this.ledgerTasks.get(ledger) || [];
    const data: QueueData = {
      version: QUEUE_VERSION,
      tasks
    };

    try {
      await Filesystem.writeFile({
        path: this.getLedgerQueuePath(ledger),
        data: JSON.stringify(data, null, 2),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true
      });
    } catch (e) {
      console.error(`[ClassifyQueue] Failed to save queue for ${ledger}:`, e);
      throw e;
    }
  }

  /**
   * 删除指定账本队列文件
   */
  private async deleteLedgerFile(ledger: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: this.getLedgerQueuePath(ledger),
        directory: Directory.Data
      });
    } catch {
      // 队列文件不存在时静默忽略
    }
  }

  /**
   * 确保指定账本队列已加载
   */
  private async ensureLedgerLoaded(ledger: string): Promise<void> {
    if (!this.loadedLedgers.has(ledger)) {
      await this.loadLedger(ledger);
    }
  }

  private async hasLedgerQueueFile(ledger: string): Promise<boolean> {
    try {
      await Filesystem.stat({
        path: this.getLedgerQueuePath(ledger),
        directory: Directory.Data
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 将账本内任务映射为对外结构
   */
  private toPublicTasks(ledger: string, tasks: LedgerQueueTask[]): ClassifyTask[] {
    return tasks.map(task => ({
      ledger,
      date: task.date,
      type: task.type,
      tag: task.tag,
      enqueuedAt: task.enqueuedAt
    }));
  }

  /**
   * 公共加载接口
   * - 传 ledger：仅加载指定账本
   * - 不传 ledger：加载当前存在队列文件的所有账本
   */
  public async load(ledger?: string): Promise<void> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      return;
    }
    const ledgers = await this.listLedgersWithQueueFile();
    for (const ledgerName of ledgers) {
      await this.ensureLedgerLoaded(ledgerName);
    }
  }

  // ============================================
  // 队列操作
  // ============================================

  /**
   * 添加任务到队列
   *
   * 去重规则：
   * - 同一账本同一天视为重复
   * - 如果新任务优先级更高，则升级
   * - 如果新任务优先级相同或更低，则忽略
   *
   * @param task 要添加的任务
   * @returns 是否成功添加（或升级）
   */
  public async enqueue(task: Omit<ClassifyTask, 'enqueuedAt'>): Promise<boolean> {
    await this.ensureLedgerLoaded(task.ledger);

    const ledgerQueue = this.ledgerTasks.get(task.ledger)!;
    const newTask: LedgerQueueTask = {
      date: task.date,
      type: task.type,
      tag: task.tag,
      enqueuedAt: Date.now()
    };

    const existingIndex = ledgerQueue.findIndex(t => t.date === task.date);

    if (existingIndex === -1) {
      ledgerQueue.push(newTask);
      await this.saveLedger(task.ledger);
      console.log(`[ClassifyQueue] Enqueued ${task.type} for ${task.ledger}/${task.date}`);
      return true;
    }

    const existingTask = ledgerQueue[existingIndex];
    const existingPriority = TASK_PRIORITY[existingTask.type];
    const newPriority = TASK_PRIORITY[task.type];

    if (newPriority > existingPriority) {
      ledgerQueue[existingIndex] = newTask;
      await this.saveLedger(task.ledger);
      console.log(
        `[ClassifyQueue] Upgraded ${existingTask.type} -> ${task.type} for ${task.ledger}/${task.date}`
      );
      return true;
    }

    // 优先级相同或更低，忽略
    console.log(
      `[ClassifyQueue] Ignored ${task.type} (existing ${existingTask.type} has same or higher priority)`
    );
    return false;
  }

  /**
   * 取出并移除指定账本的队首任务
   * @param ledger 账本名称
   * @returns 队首任务，队列为空时返回 null
   */
  public async dequeue(ledger: string): Promise<ClassifyTask | null> {
    await this.ensureLedgerLoaded(ledger);
    const ledgerQueue = this.ledgerTasks.get(ledger)!;

    if (ledgerQueue.length === 0) {
      return null;
    }

    const task = ledgerQueue.shift()!;
    await this.saveLedger(ledger);
    console.log(`[ClassifyQueue] Dequeued ${task.type} for ${ledger}/${task.date}`);
    return {
      ledger,
      date: task.date,
      type: task.type,
      tag: task.tag,
      enqueuedAt: task.enqueuedAt
    };
  }

  /**
   * 查看指定账本队首任务（不移除）
   * @param ledger 账本名称
   * @returns 队首任务，队列为空时返回 null
   */
  public async peek(ledger: string): Promise<ClassifyTask | null> {
    await this.ensureLedgerLoaded(ledger);
    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    if (ledgerQueue.length === 0) return null;
    const task = ledgerQueue[0];
    return {
      ledger,
      date: task.date,
      type: task.type,
      tag: task.tag,
      enqueuedAt: task.enqueuedAt
    };
  }

  /**
   * 获取待处理任务
   * - 传 ledger：获取指定账本任务
   * - 不传 ledger：聚合所有账本任务
   */
  public async getPending(ledger?: string): Promise<ClassifyTask[]> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      return this.toPublicTasks(ledger, [...(this.ledgerTasks.get(ledger) || [])]);
    }

    const fileLedgers = await this.listLedgersWithQueueFile();
    const allLedgers = Array.from(new Set([...fileLedgers, ...this.loadedLedgers]));
    const allTasks: ClassifyTask[] = [];
    for (const ledgerName of allLedgers) {
      await this.ensureLedgerLoaded(ledgerName);
      allTasks.push(...this.toPublicTasks(ledgerName, this.ledgerTasks.get(ledgerName) || []));
    }
    return allTasks;
  }

  /**
   * 移除指定任务
   * @param ledger 账本名称
   * @param date 日期
   * @returns 是否成功移除
   */
  public async remove(ledger: string, date: string): Promise<boolean> {
    await this.ensureLedgerLoaded(ledger);
    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    const initialLength = ledgerQueue.length;
    this.ledgerTasks.set(
      ledger,
      ledgerQueue.filter(t => t.date !== date)
    );

    if ((this.ledgerTasks.get(ledger) || []).length !== initialLength) {
      await this.saveLedger(ledger);
      console.log(`[ClassifyQueue] Removed task for ${ledger}/${date}`);
      return true;
    }

    return false;
  }

  /**
   * 清空队列
   * - 传 ledger：清空指定账本队列
   * - 不传 ledger：清空所有账本队列
   */
  public async clear(ledger?: string): Promise<void> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      this.ledgerTasks.set(ledger, []);
      await this.saveLedger(ledger);
      console.log(`[ClassifyQueue] Cleared queue for ${ledger}`);
      return;
    }

    const fileLedgers = await this.listLedgersWithQueueFile();
    const allLedgers = Array.from(new Set([...fileLedgers, ...this.loadedLedgers]));
    for (const ledgerName of allLedgers) {
      this.ledgerTasks.set(ledgerName, []);
      await this.deleteLedgerFile(ledgerName);
    }
    this.ledgerTasks.clear();
    this.loadedLedgers.clear();
    console.log('[ClassifyQueue] Cleared all ledger queues');
  }

  /**
   * 获取队列长度
   */
  public async size(ledger?: string): Promise<number> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      return (this.ledgerTasks.get(ledger) || []).length;
    }
    const pending = await this.getPending();
    return pending.length;
  }

  /**
   * 检查队列是否为空
   */
  public async isEmpty(ledger?: string): Promise<boolean> {
    return (await this.size(ledger)) === 0;
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量入队
   * @param tasks 任务列表
   * @returns 成功添加的任务数量
   */
  public async enqueueBatch(tasks: Omit<ClassifyTask, 'enqueuedAt'>[]): Promise<number> {
    let added = 0;
    for (const task of tasks) {
      const success = await this.enqueue(task);
      if (success) added++;
    }
    return added;
  }

  /**
   * 移除指定账本的所有任务
   * @param ledger 账本名称
   * @returns 移除的任务数量
   */
  public async removeByLedger(ledger: string): Promise<number> {
    await this.ensureLedgerLoaded(ledger);
    const removedCount = (this.ledgerTasks.get(ledger) || []).length;
    const fileExists = await this.hasLedgerQueueFile(ledger);

    if (removedCount > 0 || fileExists) {
      await this.deleteLedgerFile(ledger);
      this.ledgerTasks.delete(ledger);
      this.loadedLedgers.delete(ledger);
      console.log(`[ClassifyQueue] Removed ${removedCount} tasks for ledger ${ledger}`);
    }

    return removedCount;
  }

  /**
   * 重命名账本的所有任务
   * @param oldName 旧账本名称
   * @param newName 新账本名称
   * @returns 更新的任务数量
   */
  public async renameLedger(oldName: string, newName: string): Promise<number> {
    if (oldName === newName) return 0;

    await this.ensureLedgerLoaded(oldName);
    await this.ensureLedgerLoaded(newName);
    const oldFileExists = await this.hasLedgerQueueFile(oldName);

    const oldTasks = this.ledgerTasks.get(oldName) || [];
    const newTasks = this.ledgerTasks.get(newName) || [];
    if (oldTasks.length === 0 && !oldFileExists) return 0;

    const mergedByDate = new Map<string, LedgerQueueTask>();
    for (const task of newTasks) {
      mergedByDate.set(task.date, task);
    }
    for (const oldTask of oldTasks) {
      const existing = mergedByDate.get(oldTask.date);
      if (!existing) {
        mergedByDate.set(oldTask.date, oldTask);
        continue;
      }
      const existingPriority = TASK_PRIORITY[existing.type];
      const oldPriority = TASK_PRIORITY[oldTask.type];
      if (oldPriority > existingPriority) {
        mergedByDate.set(oldTask.date, oldTask);
      }
    }

    const mergedTasks = Array.from(mergedByDate.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    this.ledgerTasks.set(newName, mergedTasks);
    await this.saveLedger(newName);

    await this.deleteLedgerFile(oldName);
    this.ledgerTasks.delete(oldName);
    this.loadedLedgers.delete(oldName);

    const updatedCount = oldTasks.length;
    if (updatedCount > 0) {
      console.log(`[ClassifyQueue] Renamed ${updatedCount} tasks from ${oldName} to ${newName}`);
    }
    return updatedCount;
  }

  // ============================================
  // 调试支持
  // ============================================

  /**
   * 打印队列状态（调试用）
   */
  public async dump(ledger?: string): Promise<void> {
    const tasks = await this.getPending(ledger);
    console.log('=== ClassifyQueue Status ===');
    console.log(`Total tasks: ${tasks.length}${ledger ? ` (ledger: ${ledger})` : ''}`);
    tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.type}] ${task.ledger}/${task.date}`);
    });
    console.log('============================');
  }
}

// 导出单例实例
export const classifyQueue = ClassifyQueue.getInstance();
