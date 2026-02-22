import { LedgerService } from './LedgerService';
import {
  getAutoDirectoryHandle,
  readMemoryFile,
  writeMemoryFile,
  DEFAULT_MEMORY,
  // 账本索引管理
  getLedgersIndexHandle,
  readLedgersIndex,
  writeLedgersIndex,
  getLedgerFileHandle,
  deleteLedgerFile,
  scanForLedgerFiles,
  DEFAULT_LEDGER_INDEX,
  type LedgerMeta,
  type LedgerIndex,
  type StorageDirHandle
} from '../../utils/fs-storage';
import type { LedgerMemory } from '../../types/metadata';
import { format } from 'date-fns';

/**
 * LedgerManager - 账本管理器（决策层）
 *
 * 职责：
 * 1. 管理 ledgers.json 索引（存储在 APP 沙箱目录）
 * 2. 扫描文件系统，同步索引与实际状态
 * 3. 检查账本文件存在性
 * 4. 决定：加载现有账本 or 创建 default 账本
 * 5. 控制 LedgerService 生命周期（决定何时重启 Service）
 *
 * 与 LedgerService 的边界：
 * - LedgerManager: 决策层，管理索引和文件状态
 * - LedgerService: 执行层，管理账本内容和应用状态
 */
export class LedgerManager {
  private static instance: LedgerManager;

  // 账本数据文件目录（Documents/PixelBill/）
  private ledgerDirHandle: StorageDirHandle | null = null;

  // 当前激活的账本名称
  private activeLedgerName: string = 'default';

  // LedgerService 单例
  private ledgerService: LedgerService;

  // 初始化 Promise，用于防止重复初始化和并发等待
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  private constructor() {
    this.ledgerService = LedgerService.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LedgerManager {
    if (!LedgerManager.instance) {
      LedgerManager.instance = new LedgerManager();
    }
    return LedgerManager.instance;
  }

  /**
   * 初始化账本管理器
   * 在应用启动时调用，执行文件同步并加载 active 账本
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log('[LedgerManager] Initializing...');
      try {
        // 1. 获取账本数据文件目录（Documents/PixelBill/）
        this.ledgerDirHandle = await getAutoDirectoryHandle();
        console.log('[LedgerManager] Ledger directory initialized');

        // 2. 同步索引与文件系统
        await this.syncIndexWithFiles();

        // 3. 获取 active 账本名称（syncIndexWithFiles 已确保其存在）
        const index = await this.readIndex();
        this.activeLedgerName = index.activeLedger;

        // 4. 加载 active 账本
        await this.loadActiveLedger();

        this.isInitialized = true;
        console.log('[LedgerManager] Initialization complete, active ledger:', this.activeLedgerName);
      } catch (error) {
        console.error('[LedgerManager] Initialization failed:', error);
        // Reset promise so we can try again
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 确保已初始化 (Lazy Init Helper)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      console.log('[LedgerManager] Not initialized, attempting lazy init...');
      await this.init();
    }
  }

  /**
   * 同步索引与文件系统状态
   * 核心逻辑：确保 ledgers.json 索引与实际 .pixelbill.json 文件一致
   */
  private async syncIndexWithFiles(): Promise<void> {
    console.log('[LedgerManager] Syncing index with files...');

    if (!this.ledgerDirHandle) {
      throw new Error('Ledger directory not initialized');
    }

    // 1. 扫描实际文件（Documents/PixelBill/）
    const actualFiles = await scanForLedgerFiles(this.ledgerDirHandle);
    console.log('[LedgerManager] Scanned ledger files:', actualFiles.map(f => f.name));

    // 2. 读取索引（沙箱目录）
    let index: LedgerIndex;
    try {
      index = await this.readIndex();
    } catch (e) {
      console.warn('[LedgerManager] Failed to read index, creating default:', e);
      index = { ledgers: [], activeLedger: 'default' };
    }

    // 3. 构建文件名集合
    const actualFileNames = new Set(actualFiles.map(f => f.fileName));

    // 4. 移除孤儿记录（索引中有但文件不存在）
    const beforeCount = index.ledgers.length;
    index.ledgers = index.ledgers.filter(l => actualFileNames.has(l.fileName));
    if (index.ledgers.length !== beforeCount) {
      console.log('[LedgerManager] Removed orphaned ledger records:',
        beforeCount - index.ledgers.length);
    }

    // 5. 添加新发现的文件（文件存在但索引中没有）
    const existingNames = new Set(index.ledgers.map(l => l.name));
    for (const file of actualFiles) {
      if (!existingNames.has(file.name)) {
        index.ledgers.push(file);
        console.log('[LedgerManager] Found new ledger file:', file.name);
      }
    }

    // 6. 确保 default 存在
    const hasDefault = index.ledgers.some(l => l.name === 'default');
    if (!hasDefault) {
      const defaultExists = actualFiles.some(f => f.name === 'default');
      if (!defaultExists) {
        // 创建 default 账本文件
        console.log('[LedgerManager] Creating default ledger file...');
        const newDefaultHandle = await getLedgerFileHandle(
          this.ledgerDirHandle,
          'default',
          true
        );
        if (newDefaultHandle) {
          await writeMemoryFile(newDefaultHandle, {
            ...DEFAULT_MEMORY,
            last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
          });
        }
      }
      // 添加 default 到索引
      const defaultFile = actualFiles.find(f => f.name === 'default') || {
        name: 'default',
        fileName: 'default.pixelbill.json',
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString()
      };
      index.ledgers.unshift(defaultFile);
    }

    // 7. 检查 active 账本
    const activeExists = index.ledgers.some(l => l.name === index.activeLedger);
    if (!activeExists) {
      console.warn('[LedgerManager] Active ledger "' + index.activeLedger + '" not found, falling back to default');
      index.activeLedger = 'default';
    }

    // 8. 写入更新后的索引
    await this.writeIndex(index);
    console.log('[LedgerManager] Index sync complete');
  }

  /**
   * 读取账本索引
   */
  private async readIndex(): Promise<LedgerIndex> {
    const indexHandle = await getLedgersIndexHandle(true);
    if (!indexHandle) {
      return DEFAULT_LEDGER_INDEX;
    }
    return readLedgersIndex(indexHandle);
  }

  /**
   * 写入账本索引
   */
  private async writeIndex(index: LedgerIndex): Promise<void> {
    const indexHandle = await getLedgersIndexHandle(true);
    if (!indexHandle) {
      throw new Error('Failed to get index handle');
    }
    await writeLedgersIndex(indexHandle, index);
  }

  /**
   * 加载 active 账本
   */
  private async loadActiveLedger(): Promise<void> {
    console.log('[LedgerManager] Loading active ledger:', this.activeLedgerName);

    if (!this.ledgerDirHandle) {
      throw new Error('Ledger directory not initialized');
    }

    // 获取 active 账本文件句柄
    const handle = await getLedgerFileHandle(
      this.ledgerDirHandle,
      this.activeLedgerName,
      false
    );

    if (!handle) {
      console.error('[LedgerManager] Active ledger file not found:', this.activeLedgerName);
      throw new Error('Active ledger file not found');
    }

    // 读取账本数据
    const memory = await readMemoryFile(handle);

    // 调用 LedgerService 加载数据
    this.ledgerService.loadFromHandle(handle, memory);

    console.log('[LedgerManager] Loaded ledger:', this.activeLedgerName);
  }

  /**
   * 获取账本列表（可选同步）
   * @param options 控制是否同步索引与文件系统
   */
  public async listLedgers(options?: { syncWithFiles?: boolean }): Promise<LedgerMeta[]> {
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized after init attempt');
      return DEFAULT_LEDGER_INDEX.ledgers;
    }

    // 是否需要同步索引与文件系统（默认同步，避免列表与实际文件不一致）
    const shouldSyncWithFiles = options?.syncWithFiles !== false;
    if (shouldSyncWithFiles) {
      // 同步索引可能触发文件系统扫描，属于重操作
      await this.syncIndexWithFiles();
    }

    // 读取索引用于快速返回列表，避免重复扫描
    const index = await this.readIndex();
    return index.ledgers;
  }

  /**
   * 切换账本
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public async switchLedger(ledgerName: string): Promise<boolean> {
    console.log('[LedgerManager] Switching to ledger:', ledgerName);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    try {
      // 1. 读取索引
      const index = await this.readIndex();

      // 2. 验证账本存在
      const ledgerMeta = index.ledgers.find(l => l.name === ledgerName);
      if (!ledgerMeta) {
        console.error('[LedgerManager] Ledger not found:', ledgerName);
        return false;
      }

      // 3. 更新索引中的 lastOpenedAt 和 activeLedger
      const updatedLedgers = index.ledgers.map(l =>
        l.name === ledgerName
          ? { ...l, lastOpenedAt: new Date().toISOString() }
          : l
      );

      await this.writeIndex({
        ...index,
        ledgers: updatedLedgers,
        activeLedger: ledgerName
      });

      // 4. 更新内部状态
      this.activeLedgerName = ledgerName;

      // 5. 获取账本句柄并加载
      const newHandle = await getLedgerFileHandle(
        this.ledgerDirHandle,
        ledgerName,
        false
      );

      if (!newHandle) {
        console.error('[LedgerManager] Ledger file not found:', ledgerName);
        return false;
      }

      const newMemory = await readMemoryFile(newHandle);
      this.ledgerService.loadFromHandle(newHandle, newMemory);

      console.log('[LedgerManager] Switched to ledger:', ledgerName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to switch ledger:', error);
      return false;
    }
  }

  /**
   * 创建新账本
   * @param name 账本名称
   * @returns 是否成功
   */
  public async createLedger(name: string): Promise<boolean> {
    console.log('[LedgerManager] Creating ledger:', name);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    // 验证名称
    const sanitizedName = this.sanitizeLedgerName(name);
    if (!sanitizedName) {
      console.error('[LedgerManager] Invalid ledger name:', name);
      return false;
    }

    try {
      // 1. 读取索引
      const index = await this.readIndex();

      // 2. 检查重名
      if (index.ledgers.some(l => l.name === sanitizedName)) {
        console.error('[LedgerManager] Ledger name already exists:', sanitizedName);
        return false;
      }

      // 3. 创建账本文件
      const newHandle = await getLedgerFileHandle(
        this.ledgerDirHandle,
        sanitizedName,
        true
      );

      if (!newHandle) {
        console.error('[LedgerManager] Failed to create ledger file');
        return false;
      }

      const newMemory: LedgerMemory = {
        ...DEFAULT_MEMORY,
        last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };
      await writeMemoryFile(newHandle, newMemory);

      // 4. 更新索引
      const newLedger: LedgerMeta = {
        name: sanitizedName,
        fileName: `${sanitizedName}.pixelbill.json`,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString()
      };

      await this.writeIndex({
        ...index,
        ledgers: [...index.ledgers, newLedger],
        activeLedger: sanitizedName
      });

      // 5. 更新内部状态
      this.activeLedgerName = sanitizedName;

      // 6. 加载新账本
      this.ledgerService.loadFromHandle(newHandle, newMemory);

      console.log('[LedgerManager] Created ledger:', sanitizedName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to create ledger:', error);
      return false;
    }
  }

  /**
   * 删除账本
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public async deleteLedger(ledgerName: string): Promise<boolean> {
    console.log('[LedgerManager] Deleting ledger:', ledgerName);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    // 不允许删除 default 账本
    if (ledgerName === 'default') {
      console.error('[LedgerManager] Cannot delete default ledger');
      return false;
    }

    try {
      // 1. 读取索引
      const index = await this.readIndex();

      // 2. 验证账本存在
      const ledgerMeta = index.ledgers.find(l => l.name === ledgerName);
      if (!ledgerMeta) {
        console.error('[LedgerManager] Ledger not found:', ledgerName);
        return false;
      }

      // 3. 删除物理文件
      await deleteLedgerFile(this.ledgerDirHandle, ledgerName);

      // 4. 更新索引
      const updatedLedgers = index.ledgers.filter(l => l.name !== ledgerName);
      const newActiveLedger = index.activeLedger === ledgerName ? 'default' : index.activeLedger;

      await this.writeIndex({
        ...index,
        ledgers: updatedLedgers,
        activeLedger: newActiveLedger
      });

      // 5. 如果删除的是当前账本，切换到 default
      if (this.activeLedgerName === ledgerName) {
        this.activeLedgerName = 'default';
        await this.loadActiveLedger();
      }

      console.log('[LedgerManager] Deleted ledger:', ledgerName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to delete ledger:', error);
      return false;
    }
  }

  /**
   * 获取当前激活的账本名称
   */
  public getActiveLedgerName(): string {
    return this.activeLedgerName;
  }

  /**
   * 获取 LedgerService 实例
   */
  public getLedgerService(): LedgerService {
    return this.ledgerService;
  }

  /**
   * 验证并清理账本名称
   * 仅允许中文、字母、数字、下划线
   * 最大长度 50 字符
   */
  private sanitizeLedgerName(name: string): string | null {
    if (!name || name.trim().length === 0) {
      return null;
    }

    const trimmed = name.trim();
    if (trimmed.length > 50) {
      return null;
    }

    // 仅允许中文、字母、数字、下划线
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/;
    if (!validPattern.test(trimmed)) {
      return null;
    }

    return trimmed;
  }
}
