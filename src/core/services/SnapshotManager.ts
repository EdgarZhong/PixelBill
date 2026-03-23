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
      await Filesystem.stat({
        path: indexPath,
        directory: Directory.Data
      });

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

      // 3. 生成新快照 ID（使用最大序号 + 1，避免删除后重复）
      const maxIndex = index.snapshots.reduce((max, s) => {
        const num = parseInt(s.id.split('_')[1], 10);
        return Math.max(max, isNaN(num) ? 0 : num);
      }, 0);
      const newId = this.generateSnapshotId(maxIndex + 1);

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
   * 流程：直接用目标快照内容覆盖当前记忆文件
   * 注意：不回退前自动创建备份，因为目标快照本身已保存
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

      // 2. 用快照内容覆盖当前记忆（不再自动创建备份）
      await MemoryManager.save(ledgerName, targetSnapshot.content);

      console.log(`[SnapshotManager] Rolled back ${ledgerName} to ${snapshotId}`);
      return true;
    } catch (e) {
      console.error('[SnapshotManager] Failed to rollback:', e);
      return false;
    }
  }

  /**
   * 验证当前记忆是否与指定快照匹配
   * 用于确认回退是否成功
   *
   * @param ledgerName 账本名称
   * @param snapshotId 快照 ID
   * @returns 是否匹配
   */
  public static async verifyMatch(ledgerName: string, snapshotId: string): Promise<boolean> {
    try {
      const currentMemories = await MemoryManager.load(ledgerName);
      const snapshot = await this.read(ledgerName, snapshotId);
      if (!snapshot) return false;

      return this.arraysEqual(currentMemories, snapshot.content);
    } catch (e) {
      console.error(`[SnapshotManager] Failed to verify match with ${snapshotId}:`, e);
      return false;
    }
  }

  /**
   * 查找当前记忆内容匹配的快照 ID
   * 用于显示"当前在哪个快照上"
   *
   * @param ledgerName 账本名称
   * @returns 匹配的快照 ID，无匹配返回 null
   */
  public static async findMatchingSnapshot(ledgerName: string): Promise<string | null> {
    try {
      const currentMemories = await MemoryManager.load(ledgerName);
      const index = await this.loadIndex(ledgerName);

      // 从最新到最旧查找匹配
      for (let i = index.snapshots.length - 1; i >= 0; i--) {
        const snap = index.snapshots[i];
        const snapContent = await this.read(ledgerName, snap.id);
        if (!snapContent) continue;

        // 比较内容是否相同
        if (this.arraysEqual(currentMemories, snapContent.content)) {
          return snap.id;
        }
      }

      return null;
    } catch (e) {
      console.error('[SnapshotManager] Failed to find matching snapshot:', e);
      return null;
    }
  }

  /**
   * 比较两个字符串数组是否相等
   */
  private static arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
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
   * 删除单个快照
   * @param ledgerName 账本名称
   * @param snapshotId 要删除的快照 ID
   * @returns 是否成功
   */
  public static async delete(ledgerName: string, snapshotId: string): Promise<boolean> {
    try {
      // 1. 加载索引
      const index = await this.loadIndex(ledgerName);

      // 2. 查找要删除的快照
      const snapIndex = index.snapshots.findIndex(s => s.id === snapshotId);
      if (snapIndex === -1) {
        console.warn(`[SnapshotManager] Snapshot ${snapshotId} not found`);
        return false;
      }

      // 3. 删除快照文件
      const snap = index.snapshots[snapIndex];
      const snapshotPath = `${this.getLedgerDir(ledgerName)}/${snap.id}.md`;
      try {
        await Filesystem.deleteFile({
          path: snapshotPath,
          directory: Directory.Data
        });
      } catch (e) {
        console.warn(`[SnapshotManager] Failed to delete snapshot file ${snap.id}:`, e);
      }

      // 4. 从索引中移除
      index.snapshots.splice(snapIndex, 1);

      // 5. 保存索引
      await this.saveIndex(ledgerName, index);

      console.log(`[SnapshotManager] Deleted snapshot ${snapshotId} for ${ledgerName}`);
      return true;
    } catch (e) {
      console.error(`[SnapshotManager] Failed to delete snapshot ${snapshotId}:`, e);
      return false;
    }
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
