import { FilesystemService } from '../../adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '../../adapters/IFilesystemAdapter';
import type { LedgerMemory } from '../../../types/metadata';
import { DEFAULT_MEMORY } from '../../../utils/fs-storage';
import { LedgerService } from '../../services/LedgerService';

export class LedgerLoader {
  private static readonly LEDGER_PATH_PREFIX = 'PixelBill';

  public static async loadCategories(ledgerName: string = 'default'): Promise<Record<string, string>> {
    try {
      const fs = FilesystemService.getInstance();
      const memory = JSON.parse(await fs.readFile({
        path: `${this.LEDGER_PATH_PREFIX}/${ledgerName}.pixelbill.json`,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8
      })) as LedgerMemory;
      return LedgerService.normalizeCategoryDefinitions(
        memory.defined_categories || DEFAULT_MEMORY.defined_categories
      );
    } catch (e) {
      console.warn(`[LedgerLoader] Failed to load ledger(${ledgerName}), using default categories.`, e);
      return LedgerService.normalizeCategoryDefinitions(DEFAULT_MEMORY.defined_categories);
    }
  }
}
