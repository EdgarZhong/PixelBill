import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LedgerMemory } from '../../../types/metadata';
import { DEFAULT_MEMORY } from '../../../utils/fs-storage';
import { LedgerService } from '../../services/LedgerService';

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
      return LedgerService.normalizeCategoryDefinitions(
        memory.defined_categories || DEFAULT_MEMORY.defined_categories
      );
    } catch (e) {
      console.warn(`[LedgerLoader] Failed to load ledger(${ledgerName}), using default categories.`, e);
      return LedgerService.normalizeCategoryDefinitions(DEFAULT_MEMORY.defined_categories);
    }
  }
}
