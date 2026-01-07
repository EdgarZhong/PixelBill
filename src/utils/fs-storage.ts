import type { LedgerMemory } from '../types/metadata';
import { format } from 'date-fns';

export const MEMORY_FILE_NAME = 'default.pixelbill.json';

export const DEFAULT_MEMORY: LedgerMemory = {
  version: '1.0',
  last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  defined_categories: ['meal', 'others'],
  records: {}
};

// Check if File System Access API is supported
export const isFileSystemSupported = () => {
  return 'showDirectoryPicker' in window;
};

// Request directory handle
export const requestDirectoryHandle = async (): Promise<FileSystemDirectoryHandle> => {
  return await window.showDirectoryPicker({
    mode: 'readwrite'
  });
};

// Get file handle if exists, optional create
export const getMemoryFileHandle = async (
  dirHandle: FileSystemDirectoryHandle,
  create: boolean = false
): Promise<FileSystemFileHandle | null> => {
  try {
    return await dirHandle.getFileHandle(MEMORY_FILE_NAME, { create });
  } catch (error) {
    if (!create) return null;
    throw error;
  }
};

// Read memory file
export const readMemoryFile = async (fileHandle: FileSystemFileHandle): Promise<LedgerMemory> => {
  const file = await fileHandle.getFile();
  const text = await file.text();
  try {
    return JSON.parse(text) as LedgerMemory;
  } catch (e) {
    console.error('Failed to parse memory file:', e);
    return DEFAULT_MEMORY;
  }
};

// Write memory file
export const writeMemoryFile = async (
  fileHandle: FileSystemFileHandle,
  data: LedgerMemory
): Promise<void> => {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
};

// Recursive scanner for CSV files
export const scanForCSVFiles = async (
  dirHandle: FileSystemDirectoryHandle,
  fileList: File[] = []
): Promise<File[]> => {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (entry.name.toLowerCase().endsWith('.csv')) {
        fileList.push(await (entry as FileSystemFileHandle).getFile());
      }
    } else if (entry.kind === 'directory') {
      // Recursively scan subdirectories
      await scanForCSVFiles(entry as FileSystemDirectoryHandle, fileList);
    }
  }
  return fileList;
};
