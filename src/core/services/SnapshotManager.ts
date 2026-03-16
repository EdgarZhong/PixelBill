/**
 * SnapshotManager - 记忆文件版本快照管理
 *
 * 职责：
 * 1. 快照存储：沙箱目录 memory_snapshots/{ledger}/
 * 2. index.json 索引管理（id, timestamp, trigger, summary）
 * 3. 创建快照：写入记忆文件前自动备份
 * 4. 回退功能：用历史快照覆盖当前记忆文件
 * 5. 上限清理：保留最近 30 个快照
 *
 * 目录结构：
 * ```
 * sandbox/memory_snapshots/{ledger}/
 * ├── index.json
 * ├── snap_001.md
 * ├── snap_002.md
 * └── ...
 * ```
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { MemoryManager } from './MemoryManager';

/**
 * 快照元数据
 */
export interface SnapshotMeta {
  id: string;
  timestamp: string;
  trigger: 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'rollback' | 'manual';
  summary: string;
}

/**
 * 快照索引
 */
export interface SnapshotIndex {
  snapshots: SnapshotMeta[];
}

/**
 * 快照内容（用于回退预览）
 */
export interface SnapshotContent extends SnapshotMeta {
  content: string[];
}

export class SnapshotManager {
  private static readonly BASE_PATH = 'memory_snapshots';
  private static readonly MAX_SNAPSHOTS = 30;

  /**
   * 获取账本快照目录路径
   */
  private static getLedgerDir(ledgerName: string): string {
    return `${this.BASE_PATH}/${ledgerName}`;
  }

  /**
   * 获取索引文件路径
   */
  private static getIndexPath(ledgerName: string): string {
    return `${this.getLedgerDir(ledgerName)}/index.json`;
  }

  /**
   * 生成快照文件名
   */
  private static generateSnapshotId(index: number): string {
    return `snap_${String(index).padStart(3, '0')}`;
  }

  /**
   * 读取快照索引
   */
  private static async loadIndex(ledgerName: string): Promise<SnapshotIndex> {
    const indexPath = this.getIndexPath(ledgerName);

    try {
      const result = await Filesystem.readFile({
        path: indexPath,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      return JSON.parse(result.data as string) as SnapshotIndex;
    } catch {
      // 索引不存在，返回空索引
      return { snapshots: [] };
    }
  }

  /**
   * 保存快照索引
   */
  private static async saveIndex(ledgerName: string, index: SnapshotIndex): Promise<void> {
    const indexPath = this.getIndexPath(ledgerName);

    await Filesystem.writeFile({
      path: indexPath,
      data: JSON.stringify(index, null, 2),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true
    });
  }

  /**
   * 创建快照
   * 在写入记忆文件前调用，备份当前版本
   *
   * @param ledgerName 账本名称
   * @param trigger 触发类型
   * @param summary 摘要说明
   * @returns 快照 ID
   */
  public static async create(
    ledgerName: string,
    trigger: SnapshotMeta['trigger'],
    summary: string
  ): Promise<string> {
    try {
      // 1. 加载当前记忆内容
      const currentMemories = await MemoryManager.load(ledgerName);

      // 如果记忆为空，不创建快照
      if (currentMemories.length === 0) {
        console.log('[SnapshotManager] No content to snapshot, skipping');
        return '';
      }

      // 2. 加载索引
      const index = await this.loadIndex(ledgerName);

      // 3. 生成新快照 ID
      const newId = this.generateSnapshotId(index.snapshots.length + 1);

      // 4. 创建快照元数据
      const meta: SnapshotMeta = {
        id: newId,
        timestamp: new Date().toISOString(),
        trigger,
        summary
      };

      // 5. 保存快照内容
      const snapshotPath = `${this.getLedgerDir(ledgerName)}/${newId}.md`;
      const content = currentMemories.map((m, i) => `${i + 1}. ${m}`).join('\n');

      await Filesystem.writeFile({
        path: snapshotPath,
        data: content,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true
      });

      // 6. 更新索引
      index.snapshots.push(meta);

      // 7. 清理旧快照（保留最近 MAX_SNAPSHOTS 个）
      if (index.snapshots.length > this.MAX_SNAPSHOTS) {
        const toDelete = index.snapshots.slice(0, index.snapshots.length - this.MAX_SNAPSHOTS);
        for (const old of toDelete) {
          try {
            const oldPath = `${this.getLedgerDir(ledgerName)}/${old.id}.md`;
            await Filesystem.deleteFile({
              path: oldPath,
              directory: Directory.Data
            });
          } catch (e) {
            console.warn(`[SnapshotManager] Failed to delete old snapshot ${old.id}:`, e);
          }
        }
        index.snapshots = index.snapshots.slice(-this.MAX_SNAPSHOTS);
      }

      // 8. 保存索引
      await this.saveIndex(ledgerName, index);

      console.log(`[SnapshotManager] Created snapshot ${newId} for ${ledgerName}`);
      return newId;
    } catch (e) {
      console.error('[SnapshotManager] Failed to create snapshot:', e);
      throw e;
    }
  }

  /**
   * 获取快照列表
   * @param ledgerName 账本名称
   * @returns 快照元数据列表（按时间倒序）
   */
  public static async list(ledgerName: string): Promise<SnapshotMeta[]> {
    const index = await this.loadIndex(ledgerName);
    // 返回倒序（最新的在前）
    return [...index.snapshots].reverse();
  }

  /**
   * 读取快照内容
   * @param ledgerName 账本名称
   * @param snapshotId 快照 ID
   * @returns 快照内容
   */
  public static async read(ledgerName: string, snapshotId: string): Promise<SnapshotContent | null> {
    try {
      // 1. 查找元数据
      const index = await this.loadIndex(ledgerName);
      const meta = index.snapshots.find(s => s.id === snapshotId);
      if (!meta) {
        console.warn(`[SnapshotManager] Snapshot ${snapshotId} not found`);
        return null;
      }

      // 2. 读取内容
      const snapshotPath = `${this.getLedgerDir(ledgerName)}/${snapshotId}.md`;
      const result = await Filesystem.readFile({
        path: snapshotPath,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });

      // 3. 解析内容
      const lines = (result.data as string)
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const match = line.match(/^\d+[.)]\s*(.+)$/);
          return match ? match[1] : line;
        });

      return {
        ...meta,
        content: lines
      };
    } catch (e) {
      console.error(`[SnapshotManager] Failed to read snapshot ${snapshotId}:`, e);
      return null;
    }
  }

  /**
   * 回退到指定快照
   * 流程：
   * 1. 先将当前记忆拍一个新快照（rollback 类型）
   * 2. 用选中的历史快照内容覆盖当前记忆文件
   *
   * @param ledgerName 账本名称
   * @param snapshotId 要回退到的快照 ID
   * @returns 是否成功
   */
  public static async rollback(ledgerName: string, snapshotId: string): Promise<boolean> {
    try {
      // 1. 读取目标快照
      const targetSnapshot = await this.read(ledgerName, snapshotId);
      if (!targetSnapshot) {
        console.error(`[SnapshotManager] Cannot rollback: snapshot ${snapshotId} not found`);
        return false;
      }

      // 2. 备份当前记忆（回退前的版本）
      await this.create(ledgerName, 'rollback', `回退前的版本（将回退到 ${snapshotId}）`);

      // 3. 用快照内容覆盖当前记忆
      await MemoryManager.save(ledgerName, targetSnapshot.content);

      console.log(`[SnapshotManager] Rolled back ${ledgerName} to ${snapshotId}`);
      return true;
    } catch (e) {
      console.error('[SnapshotManager] Failed to rollback:', e);
      return false;
    }
  }

  /**
   * 获取最新快照 ID
   * @param ledgerName 账本名称
   * @returns 最新快照 ID，无则返回空字符串
   */
  public static async getLatestId(ledgerName: string): Promise<string> {
    const index = await this.loadIndex(ledgerName);
    if (index.snapshots.length === 0) return '';
    return index.snapshots[index.snapshots.length - 1].id;
  }

  /**
   * 删除所有快照（谨慎使用）
   * @param ledgerName 账本名称
   */
  public static async clearAll(ledgerName: string): Promise<void> {
    try {
      const ledgerDir = this.getLedgerDir(ledgerName);
      await Filesystem.rmdir({
        path: ledgerDir,
        directory: Directory.Data,
        recursive: true
      });
      console.log(`[SnapshotManager] Cleared all snapshots for ${ledgerName}`);
    } catch (e) {
      console.warn(`[SnapshotManager] Failed to clear snapshots for ${ledgerName}:`, e);
    }
  }
}
