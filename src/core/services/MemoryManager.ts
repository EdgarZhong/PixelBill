/**
 * MemoryManager - 记忆文件管理模块
 *
 * 职责：
 * 1. 记忆文件的读写（按账本存储在 Documents/PixelBill/classify_memory/{ledger}.md）
 * 2. 增量更新接口（ADD / MODIFY / DELETE 操作执行）
 * 3. 记忆文件格式：有序列表，每行一个信息点
 * 4. 读取时解析为 string[]，写入时添加序号
 *
 * 文件格式示例：
 * ```markdown
 * 1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
 * 2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
 * 3. 同一餐点时段已有正餐，后续小吃/面包归 others
 * ```
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

/**
 * 记忆操作类型
 */
export type MemoryOperation =
  | { type: 'ADD'; content: string }
  | { type: 'MODIFY'; index: number; content: string }
  | { type: 'DELETE'; index: number };

/**
 * 记忆操作结果
 */
export interface MemoryOperationResult {
  success: boolean;
  operations: MemoryOperation[];
  error?: string;
}

export class MemoryManager {
  private static readonly BASE_PATH = 'PixelBill/classify_memory';

  /**
   * 获取记忆文件路径
   */
  private static getFilePath(ledgerName: string): string {
    return `${this.BASE_PATH}/${ledgerName}.md`;
  }

  /**
   * 读取记忆文件
   * @param ledgerName 账本名称
   * @returns 记忆条目数组（去序号后的纯内容），文件不存在时返回空数组
   */
  public static async load(ledgerName: string): Promise<string[]> {
    const filePath = this.getFilePath(ledgerName);

    try {
      const exists = await this.exists(ledgerName);
      if (!exists) {
        return [];
      }

      const result = await Filesystem.readFile({
        path: filePath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      const content = result.data as string;
      return this.parseContent(content);
    } catch {
      // 文件不存在或读取失败，返回空数组
      return [];
    }
  }

  /**
   * 保存记忆文件
   * @param ledgerName 账本名称
   * @param memories 记忆条目数组（纯内容，无需序号）
   */
  public static async save(ledgerName: string, memories: string[]): Promise<void> {
    const filePath = this.getFilePath(ledgerName);

    try {
      const content = this.formatContent(memories);
      await Filesystem.writeFile({
        path: filePath,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      });
    } catch (e) {
      console.error(`[MemoryManager] Failed to save memory for ${ledgerName}:`, e);
      throw e;
    }
  }

  /**
   * 执行增量更新操作
   * 注意：DELETE 和 MODIFY 必须按索引从高到低倒序执行，避免索引偏移
   *
   * @param ledgerName 账本名称
   * @param operations 操作列表
   * @returns 操作结果
   */
  public static async applyOperations(
    ledgerName: string,
    operations: MemoryOperation[]
  ): Promise<MemoryOperationResult> {
    try {
      // 1. 加载当前记忆
      const memories = await this.load(ledgerName);

      // 2. 分离操作类型
      const adds = operations.filter((op): op is { type: 'ADD'; content: string } => op.type === 'ADD');
      const modifies = operations.filter((op): op is { type: 'MODIFY'; index: number; content: string } =>
        op.type === 'MODIFY'
      );
      const deletes = operations.filter((op): op is { type: 'DELETE'; index: number } =>
        op.type === 'DELETE'
      );

      // 3. 执行 DELETE（按索引降序）
      deletes
        .sort((a, b) => b.index - a.index)
        .forEach(op => {
          if (op.index >= 1 && op.index <= memories.length) {
            memories.splice(op.index - 1, 1);
          } else {
            console.warn(`[MemoryManager] DELETE index ${op.index} out of range`);
          }
        });

      // 4. 执行 MODIFY（按索引降序，避免删除后索引变化）
      modifies
        .sort((a, b) => b.index - a.index)
        .forEach(op => {
          if (op.index >= 1 && op.index <= memories.length) {
            memories[op.index - 1] = op.content;
          } else {
            console.warn(`[MemoryManager] MODIFY index ${op.index} out of range`);
          }
        });

      // 5. 执行 ADD（追加到末尾）
      adds.forEach(op => {
        memories.push(op.content);
      });

      // 6. 保存
      await this.save(ledgerName, memories);

      return {
        success: true,
        operations
      };
    } catch (e) {
      console.error(`[MemoryManager] Failed to apply operations:`, e);
      return {
        success: false,
        operations,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /**
   * 添加单条记忆
   * @param ledgerName 账本名称
   * @param content 记忆内容
   */
  public static async add(ledgerName: string, content: string): Promise<void> {
    await this.applyOperations(ledgerName, [{ type: 'ADD', content }]);
  }

  /**
   * 修改单条记忆
   * @param ledgerName 账本名称
   * @param index 序号（从1开始）
   * @param content 新内容
   */
  public static async modify(ledgerName: string, index: number, content: string): Promise<void> {
    await this.applyOperations(ledgerName, [{ type: 'MODIFY', index, content }]);
  }

  /**
   * 删除单条记忆
   * @param ledgerName 账本名称
   * @param index 序号（从1开始）
   */
  public static async delete(ledgerName: string, index: number): Promise<void> {
    await this.applyOperations(ledgerName, [{ type: 'DELETE', index }]);
  }

  /**
   * 解析文件内容为数组
   * 处理规则：
   * - 按行分割
   * - 去除序号前缀（如 "1. "）
   * - 去除空行
   * - 保留纯文本内容
   */
  private static parseContent(content: string): string[] {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // 去除序号前缀，如 "1. " 或 "1) "
        const match = line.match(/^\d+[.)]\s*(.+)$/);
        return match ? match[1] : line;
      });
  }

  /**
   * 格式化数组为文件内容
   * 为每行添加序号
   */
  private static formatContent(memories: string[]): string {
    return memories
      .map((content, index) => `${index + 1}. ${content}`)
      .join('\n');
  }

  /**
   * 清空记忆文件
   * @param ledgerName 账本名称
   */
  public static async clear(ledgerName: string): Promise<void> {
    await this.save(ledgerName, []);
  }

  /**
   * 获取记忆条目数量
   * @param ledgerName 账本名称
   */
  public static async getCount(ledgerName: string): Promise<number> {
    const memories = await this.load(ledgerName);
    return memories.length;
  }

  /**
   * 检查记忆文件是否存在
   * @param ledgerName 账本名称
   */
  public static async exists(ledgerName: string): Promise<boolean> {
    const filePath = this.getFilePath(ledgerName);
    try {
      await Filesystem.stat({
        path: filePath,
        directory: Directory.Documents
      });
      return true;
    } catch {
      return false;
    }
  }
}
