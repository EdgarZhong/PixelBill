import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LedgerMemory } from '../../../types/metadata';
import { DEFAULT_MEMORY } from '../../../utils/fs-storage';

export class LedgerLoader {
  private static readonly DEFAULT_PATH = 'PixelBill/default.pixelbill.json';

  /**
   * 加载账本文件并返回类别映射
   * @returns Record<string, string> - { 标签名: 描述 }
   */
  public static async loadCategories(): Promise<Record<string, string>> {
    try {
      const result = await Filesystem.readFile({
        path: this.DEFAULT_PATH,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      const memory = JSON.parse(result.data as string) as LedgerMemory;
      const categories = memory.defined_categories || DEFAULT_MEMORY.defined_categories;

      // 数据迁移：如果是旧格式（数组），转换为映射
      if (Array.isArray(categories)) {
        const migrated: Record<string, string> = {};
        for (const cat of categories) {
          migrated[cat] = `${cat} 相关支出`; // 简单默认描述
        }
        return migrated;
      }

      return categories;
    } catch (e) {
      console.warn(`[LedgerLoader] Failed to load ledger, using default categories.`, e);
      return DEFAULT_MEMORY.defined_categories;
    }
  }
}
