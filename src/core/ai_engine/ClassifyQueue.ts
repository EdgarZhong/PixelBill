/**
 * ClassifyQueue - 分类任务队列
 *
 * 职责：
 * 1. 管理分类任务的入队/出队
 * 2. 持久化到沙箱 classify_queue.json
 * 3. 任务去重和优先级升级
 * 4. App 重启后恢复队列状态
 *
 * 存储位置：沙箱 classify_queue.json
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

/**
 * 队列数据结构
 */
interface QueueData {
  version: string;
  tasks: ClassifyTask[];
}

const QUEUE_FILE_PATH = 'classify_queue.json';
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
  private tasks: ClassifyTask[] = [];
  private isLoaded = false;

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
  // 队列持久化
  // ============================================

  /**
   * 加载队列（从沙箱）
   */
  public async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const result = await Filesystem.readFile({
        path: QUEUE_FILE_PATH,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });

      const data = JSON.parse(result.data as string) as QueueData;
      this.tasks = data.tasks || [];
      console.log(`[ClassifyQueue] Loaded ${this.tasks.length} tasks`);
    } catch {
      // 文件不存在，初始化为空队列
      this.tasks = [];
      console.log('[ClassifyQueue] No existing queue, starting fresh');
    }

    this.isLoaded = true;
  }

  /**
   * 保存队列（到沙箱）
   */
  private async save(): Promise<void> {
    const data: QueueData = {
      version: QUEUE_VERSION,
      tasks: this.tasks
    };

    try {
      await Filesystem.writeFile({
        path: QUEUE_FILE_PATH,
        data: JSON.stringify(data, null, 2),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true
      });
    } catch (e) {
      console.error('[ClassifyQueue] Failed to save queue:', e);
      throw e;
    }
  }

  /**
   * 确保已加载
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.load();
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
    await this.ensureLoaded();

    const newTask: ClassifyTask = {
      ...task,
      enqueuedAt: Date.now()
    };

    // 查找是否已有相同账本+日期的任务
    const existingIndex = this.tasks.findIndex(
      t => t.ledger === task.ledger && t.date === task.date
    );

    if (existingIndex === -1) {
      // 无重复，直接添加
      this.tasks.push(newTask);
      await this.save();
      console.log(`[ClassifyQueue] Enqueued ${task.type} for ${task.ledger}/${task.date}`);
      return true;
    }

    // 有重复，检查优先级
    const existingTask = this.tasks[existingIndex];
    const existingPriority = TASK_PRIORITY[existingTask.type];
    const newPriority = TASK_PRIORITY[task.type];

    if (newPriority > existingPriority) {
      // 升级任务
      this.tasks[existingIndex] = newTask;
      await this.save();
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
   * 取出并移除队首任务
   * @returns 队首任务，队列为空时返回 null
   */
  public async dequeue(): Promise<ClassifyTask | null> {
    await this.ensureLoaded();

    if (this.tasks.length === 0) {
      return null;
    }

    const task = this.tasks.shift()!;
    await this.save();
    console.log(`[ClassifyQueue] Dequeued ${task.type} for ${task.ledger}/${task.date}`);
    return task;
  }

  /**
   * 查看队首任务（不移除）
   * @returns 队首任务，队列为空时返回 null
   */
  public async peek(): Promise<ClassifyTask | null> {
    await this.ensureLoaded();
    return this.tasks.length > 0 ? this.tasks[0] : null;
  }

  /**
   * 获取所有待处理任务（按优先级和时间排序）
   */
  public async getPending(): Promise<ClassifyTask[]> {
    await this.ensureLoaded();
    return [...this.tasks];
  }

  /**
   * 移除指定任务
   * @param ledger 账本名称
   * @param date 日期
   * @returns 是否成功移除
   */
  public async remove(ledger: string, date: string): Promise<boolean> {
    await this.ensureLoaded();

    const initialLength = this.tasks.length;
    this.tasks = this.tasks.filter(t => !(t.ledger === ledger && t.date === date));

    if (this.tasks.length !== initialLength) {
      await this.save();
      console.log(`[ClassifyQueue] Removed task for ${ledger}/${date}`);
      return true;
    }

    return false;
  }

  /**
   * 清空队列
   */
  public async clear(): Promise<void> {
    await this.ensureLoaded();
    this.tasks = [];
    await this.save();
    console.log('[ClassifyQueue] Cleared all tasks');
  }

  /**
   * 获取队列长度
   */
  public async size(): Promise<number> {
    await this.ensureLoaded();
    return this.tasks.length;
  }

  /**
   * 检查队列是否为空
   */
  public async isEmpty(): Promise<boolean> {
    await this.ensureLoaded();
    return this.tasks.length === 0;
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
    await this.ensureLoaded();

    const initialLength = this.tasks.length;
    this.tasks = this.tasks.filter(t => t.ledger !== ledger);
    const removedCount = initialLength - this.tasks.length;

    if (removedCount > 0) {
      await this.save();
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
    await this.ensureLoaded();

    let updatedCount = 0;
    for (const task of this.tasks) {
      if (task.ledger === oldName) {
        task.ledger = newName;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await this.save();
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
  public async dump(): Promise<void> {
    await this.ensureLoaded();
    console.log('=== ClassifyQueue Status ===');
    console.log(`Total tasks: ${this.tasks.length}`);
    this.tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.type}] ${task.ledger}/${task.date}`);
    });
    console.log('============================');
  }
}

// 导出单例实例
export const classifyQueue = ClassifyQueue.getInstance();
