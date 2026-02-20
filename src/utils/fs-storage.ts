import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { format } from 'date-fns';
import type { LedgerMemory } from '../types/metadata';

// --- Types ---

// Native Handle definitions
export type NativeFileHandle = {
  kind: 'file';
  path: string; // Absolute path or relative to Documents depending on implementation
  name: string;
};

export type NativeDirHandle = {
  kind: 'directory';
  path: string;
  name: string;
};

export type StorageHandle = FileSystemFileHandle | NativeFileHandle;
export type StorageDirHandle = FileSystemDirectoryHandle | NativeDirHandle;

export const MEMORY_FILE_NAME = 'default.pixelbill.json';

export const DEFAULT_MEMORY: LedgerMemory = {
  version: '1.0',
  last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  defined_categories: ['meal', 'others'],
  records: {}
};

// --- Platform Check ---

let isNativeOverride: boolean | null = null;
let FilesystemImpl = Filesystem;

export const isNativePlatform = () => isNativeOverride ?? Capacitor.isNativePlatform();

// Test Helpers
export const _setNativePlatform = (val: boolean) => { isNativeOverride = val; };
export const _setFilesystemImpl = (impl: unknown) => { FilesystemImpl = impl as typeof Filesystem; };

export const isFileSystemSupported = () => {
  if (isNativePlatform()) return true;
  return 'showDirectoryPicker' in window;
};

// --- Main Functions ---

export const getAutoDirectoryHandle = async (): Promise<StorageDirHandle> => {
  if (isNativePlatform()) {
    try {
      const status = await FilesystemImpl.requestPermissions();
      if (status.publicStorage !== 'granted') {
        console.warn('Storage permission might be denied:', status);
      }

      // Ensure PixelBill directory exists in Documents
      const pixelBillDir = 'PixelBill';
      try {
        await FilesystemImpl.mkdir({
          path: pixelBillDir,
          directory: Directory.Documents,
          recursive: true
        });
      } catch (e) {
        // Ignore if exists
        console.log('PixelBill directory might already exist or failed to create:', e);
      }

      return {
        kind: 'directory',
        path: pixelBillDir,
        name: 'PixelBill'
      };
    } catch (e) {
      console.error('Failed to init auto directory:', e);
      throw e;
    }
  }
  throw new Error('Auto directory handle only supported on Native');
};

export const requestDirectoryHandle = async (): Promise<StorageDirHandle> => {
  if (isNativePlatform()) {
    // On Android, we default to the Documents directory.
    // We first request permissions to ensure we can access it.
    try {
      const status = await FilesystemImpl.requestPermissions();
      if (status.publicStorage !== 'granted') {
        // Check if we effectively have permission (sometimes 'granted' is not returned but it works)
        // But throwing here is safer to prompt UI feedback
        // throw new Error('Storage permission denied');
        console.warn('Storage permission might be denied or limited:', status);
      }
      
      const rootPath = ''; // Root of Directory.Documents
      
      return {
        kind: 'directory',
        path: rootPath,
        name: 'Documents'
      };
    } catch (e) {
      console.error('Failed to request native directory:', e);
      throw e;
    }
  } else {
    return await window.showDirectoryPicker({
      mode: 'readwrite'
    });
  }
};

export const getMemoryFileHandle = async (
  dirHandle: StorageDirHandle,
  create: boolean = false
): Promise<StorageHandle | null> => {
  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    // Handle path joining safely
    const filePath = nativeDir.path 
      ? `${nativeDir.path}/${MEMORY_FILE_NAME}` 
      : MEMORY_FILE_NAME;
    
    try {
      // Check if exists
      await FilesystemImpl.stat({
        path: filePath,
        directory: Directory.Documents
      });
      
      return {
        kind: 'file',
        path: filePath,
        name: MEMORY_FILE_NAME
      };
    } catch {
      if (create) {
        // Just return the handle, the write operation will create it
        return {
          kind: 'file',
          path: filePath,
          name: MEMORY_FILE_NAME
        };
      }
      return null;
    }
  } else {
    try {
      return await (dirHandle as FileSystemDirectoryHandle).getFileHandle(MEMORY_FILE_NAME, { create });
    } catch (error) {
      if (!create) return null;
      throw error;
    }
  }
};

export const readMemoryFile = async (fileHandle: StorageHandle): Promise<LedgerMemory> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    try {
      const result = await FilesystemImpl.readFile({
        path: nativeHandle.path,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      
      const text = result.data as string;
      return JSON.parse(text) as LedgerMemory;
    } catch (e) {
      console.error('Failed to read memory file (Native):', e);
      return DEFAULT_MEMORY;
    }
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const file = await webHandle.getFile();
    const text = await file.text();
    try {
      return JSON.parse(text) as LedgerMemory;
    } catch (e) {
      console.error('Failed to parse memory file:', e);
      return DEFAULT_MEMORY;
    }
  }
};

export const writeMemoryFile = async (
  fileHandle: StorageHandle,
  data: LedgerMemory
): Promise<void> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    await FilesystemImpl.writeFile({
      path: nativeHandle.path,
      data: JSON.stringify(data, null, 2),
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const writable = await webHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
};

// Helper for recursive native scanning
async function scanNativeDir(path: string, fileList: File[]): Promise<File[]> {
  try {
    const result = await FilesystemImpl.readdir({
      path: path,
      directory: Directory.Documents
    });
    
    for (const file of result.files) {
      const fullPath = path ? `${path}/${file.name}` : file.name;
      
      if (file.type === 'file') {
        if (file.name.toLowerCase().endsWith('.csv')) {
          // Read content
          const readResult = await FilesystemImpl.readFile({
            path: fullPath,
            directory: Directory.Documents,
            encoding: Encoding.UTF8
          });
          
          // Create File object
          const fileObj = new File([readResult.data as string], file.name, {
            type: 'text/csv',
            lastModified: file.mtime
          });
          fileList.push(fileObj);
        }
      } else if (file.type === 'directory') {
        await scanNativeDir(fullPath, fileList);
      }
    }
  } catch (e) {
    console.error(`Error scanning native dir ${path}:`, e);
  }
  return fileList;
}

export const scanForCSVFiles = async (
  dirHandle: StorageDirHandle,
  fileList: File[] = []
): Promise<File[]> => {
  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    return await scanNativeDir(nativeDir.path, fileList);
  } else {
    const webDir = dirHandle as FileSystemDirectoryHandle;
    for await (const entry of webDir.values()) {
      if (entry.kind === 'file') {
        if (entry.name.toLowerCase().endsWith('.csv')) {
          fileList.push(await (entry as FileSystemFileHandle).getFile());
        }
      } else if (entry.kind === 'directory') {
        await scanForCSVFiles(entry as FileSystemDirectoryHandle, fileList);
      }
    }
    return fileList;
  }
};

// ============================================
// 账本索引管理 - Ledger Index Management
// ============================================

export const LEDGERS_INDEX_NAME = 'ledgers.json';

/**
 * 账本元数据接口
 */
export interface LedgerMeta {
  name: string;           // 账本显示名称
  fileName: string;       // 实际文件名（{name}.pixelbill.json）
  createdAt: string;      // ISO 8601 格式创建时间
  lastOpenedAt: string;   // ISO 8601 格式最后打开时间
}

/**
 * 账本索引数据结构
 */
export interface LedgerIndex {
  ledgers: LedgerMeta[];  // 所有账本列表
  activeLedger: string;   // 当前激活的账本名称
}

/**
 * 默认账本索引（首次启动时创建）
 */
export const DEFAULT_LEDGER_INDEX: LedgerIndex = {
  ledgers: [
    {
      name: 'default',
      fileName: 'default.pixelbill.json',
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString()
    }
  ],
  activeLedger: 'default'
};

/**
 * 获取账本索引文件句柄（ledgers.json 存储在 APP 沙箱目录）
 * @param create 是否创建（默认 true）
 */
export const getLedgersIndexHandle = async (
  create: boolean = true
): Promise<StorageHandle | null> => {
  if (isNativePlatform()) {
    // 仿照 ConfigManager 的实现，直接使用 Directory.Data
    // mock 层会将 Directory.Data 映射到 virtual_android_filesys/sandbox_path
    const indexPath = LEDGERS_INDEX_NAME;

    try {
      // 检查是否存在
      await FilesystemImpl.stat({
        path: indexPath,
        directory: Directory.Data
      });

      return {
        kind: 'file',
        path: indexPath,
        name: LEDGERS_INDEX_NAME
      };
    } catch {
      if (create) {
        // 返回句柄，写入时会创建文件
        return {
          kind: 'file',
          path: indexPath,
          name: LEDGERS_INDEX_NAME
        };
      }
      return null;
    }
  } else {
    // Web/测试环境：使用 mock 层的 DATA 目录（沙箱模拟）
    // mock 层会将 Directory.Data 映射到 virtual_android_filesys/sandbox_path
    const indexPath = LEDGERS_INDEX_NAME;

    try {
      // 检查是否存在
      await FilesystemImpl.stat({
        path: indexPath,
        directory: Directory.Data
      });

      return {
        kind: 'file',
        path: indexPath,
        name: LEDGERS_INDEX_NAME
      };
    } catch {
      if (create) {
        // 返回句柄，写入时会创建文件
        return {
          kind: 'file',
          path: indexPath,
          name: LEDGERS_INDEX_NAME
        };
      }
      return null;
    }
  }
};

/**
 * 读取账本索引
 * @param fileHandle 索引文件句柄
 * @returns 账本索引数据，失败时返回默认索引
 */
export const readLedgersIndex = async (
  fileHandle: StorageHandle
): Promise<LedgerIndex> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    try {
      const result = await FilesystemImpl.readFile({
        path: nativeHandle.path,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });

      const text = result.data as string;
      return JSON.parse(text) as LedgerIndex;
    } catch (e) {
      console.error('Failed to read ledgers index (Native):', e);
      return DEFAULT_LEDGER_INDEX;
    }
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const file = await webHandle.getFile();
    const text = await file.text();
    try {
      return JSON.parse(text) as LedgerIndex;
    } catch (e) {
      console.error('Failed to parse ledgers index:', e);
      return DEFAULT_LEDGER_INDEX;
    }
  }
};

/**
 * 写入账本索引
 * @param fileHandle 索引文件句柄
 * @param data 账本索引数据
 */
export const writeLedgersIndex = async (
  fileHandle: StorageHandle,
  data: LedgerIndex
): Promise<void> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    await FilesystemImpl.writeFile({
      path: nativeHandle.path,
      data: JSON.stringify(data, null, 2),
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const writable = await webHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
};

/**
 * 获取指定账本的文件句柄
 * @param dirHandle 目录句柄（PixelBill 目录）
 * @param ledgerName 账本名称
 * @param create 是否创建（默认 false）
 */
export const getLedgerFileHandle = async (
  dirHandle: StorageDirHandle,
  ledgerName: string,
  create: boolean = false
): Promise<StorageHandle | null> => {
  const fileName = `${ledgerName}.pixelbill.json`;

  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    const filePath = nativeDir.path
      ? `${nativeDir.path}/${fileName}`
      : fileName;

    try {
      // 检查是否存在
      await FilesystemImpl.stat({
        path: filePath,
        directory: Directory.Documents
      });

      return {
        kind: 'file',
        path: filePath,
        name: fileName
      };
    } catch {
      if (create) {
        return {
          kind: 'file',
          path: filePath,
          name: fileName
        };
      }
      return null;
    }
  } else {
    try {
      return await (dirHandle as FileSystemDirectoryHandle).getFileHandle(fileName, { create });
    } catch (error) {
      if (!create) return null;
      throw error;
    }
  }
};

/**
 * 删除账本文件
 * @param dirHandle 目录句柄（PixelBill 目录）
 * @param ledgerName 账本名称
 */
export const deleteLedgerFile = async (
  dirHandle: StorageDirHandle,
  ledgerName: string
): Promise<void> => {
  const fileName = `${ledgerName}.pixelbill.json`;

  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    const filePath = nativeDir.path
      ? `${nativeDir.path}/${fileName}`
      : fileName;

    try {
      await FilesystemImpl.deleteFile({
        path: filePath,
        directory: Directory.Documents
      });
    } catch (e) {
      console.error('Failed to delete ledger file (Native):', e);
      throw e;
    }
  } else {
    try {
      await (dirHandle as FileSystemDirectoryHandle).removeEntry(fileName);
    } catch (e) {
      console.error('Failed to delete ledger file (Web):', e);
      throw e;
    }
  }
};

/**
 * 扫描目录下所有账本文件（用于重建索引）
 * @param dirHandle 目录句柄（PixelBill 目录）
 * @returns 账本文件元数据列表
 */
export const scanForLedgerFiles = async (
  dirHandle: StorageDirHandle
): Promise<LedgerMeta[]> => {
  const ledgers: LedgerMeta[] = [];

  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    try {
      const result = await FilesystemImpl.readdir({
        path: nativeDir.path || '',
        directory: Directory.Documents
      });

      for (const file of result.files) {
        if (file.type === 'file' && file.name.endsWith('.pixelbill.json')) {
          const name = file.name.replace('.pixelbill.json', '');
          ledgers.push({
            name,
            fileName: file.name,
            createdAt: new Date(file.ctime || Date.now()).toISOString(),
            lastOpenedAt: name === 'default'
              ? new Date().toISOString()
              : '1970-01-01T00:00:00.000Z'
          });
        }
      }
    } catch (e) {
      console.error('Failed to scan ledger files (Native):', e);
    }
  } else {
    const webDir = dirHandle as FileSystemDirectoryHandle;
    for await (const entry of webDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.pixelbill.json')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        const name = file.name.replace('.pixelbill.json', '');
        ledgers.push({
          name,
          fileName: file.name,
          createdAt: new Date(file.lastModified).toISOString(),
          lastOpenedAt: name === 'default'
            ? new Date().toISOString()
            : '1970-01-01T00:00:00.000Z'
        });
      }
    }
  }

  return ledgers;
};
