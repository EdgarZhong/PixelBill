import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LedgerMemory } from '../../../types/metadata';

export class LedgerLoader {
  private static readonly DEFAULT_PATH = 'PixelBill/default.pixelbill.json';

  /**
   * 加载账本文件并返回类别列表
   * @returns string[]
   */
  public static async loadCategories(): Promise<string[]> {
    try {
      const result = await Filesystem.readFile({
        path: this.DEFAULT_PATH,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      const memory = JSON.parse(result.data as string) as LedgerMemory;
      return memory.defined_categories || ['meal', 'others'];
    } catch (e) {
      console.warn(`[LedgerLoader] Failed to load ledger, using default categories.`, e);
      return ['meal', 'others'];
    }
  }
}
