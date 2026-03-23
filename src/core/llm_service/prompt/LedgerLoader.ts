import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LedgerMemory } from '../../../types/metadata';
import { DEFAULT_MEMORY } from '../../../utils/fs-storage';

export class LedgerLoader {
  private static readonly LEDGER_PATH_PREFIX = 'PixelBill';

  public static async loadCategories(ledgerName: string = 'default'): Promise<Record<string, string>> {
    try {
      const result = await Filesystem.readFile({
        path: `${this.LEDGER_PATH_PREFIX}/${ledgerName}.pixelbill.json`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      const memory = JSON.parse(result.data as string) as LedgerMemory;
      const categories = memory.defined_categories || DEFAULT_MEMORY.defined_categories;

      if (Array.isArray(categories)) {
        const migrated: Record<string, string> = {};
        for (const cat of categories) {
          migrated[cat] = `${cat} related spending`;
        }
        return migrated;
      }

      return categories;
    } catch (e) {
      console.warn(`[LedgerLoader] Failed to load ledger(${ledgerName}), using default categories.`, e);
      return DEFAULT_MEMORY.defined_categories;
    }
  }
}
