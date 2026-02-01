
import fs from 'node:fs/promises';
import path from 'node:path';

// --- Enums ---
export const Directory = {
  Documents: 'DOCUMENTS',
  Data: 'DATA',
  Library: 'LIBRARY',
  Cache: 'CACHE',
  External: 'EXTERNAL',
  ExternalStorage: 'EXTERNAL_STORAGE'
} as const;

export type Directory = (typeof Directory)[keyof typeof Directory];

export const Encoding = {
  UTF8: 'utf8',
  ASCII: 'ascii',
  UTF16: 'utf16'
} as const;

export type Encoding = (typeof Encoding)[keyof typeof Encoding];

// --- Paths Mapping ---
const ROOT_DIR = process.cwd();
const VIRTUAL_FS_ROOT = path.join(ROOT_DIR, 'virtual_android_filesys');

const getBasePath = (directory?: string) => {
  switch (directory) {
    case Directory.Documents:
      return path.join(VIRTUAL_FS_ROOT, 'Documents_path');
    case Directory.Data:
      return path.join(VIRTUAL_FS_ROOT, 'sandbox_path');
    default:
      return path.join(VIRTUAL_FS_ROOT, 'Documents_path');
  }
};

const resolvePath = (filePath: string, directory?: string) => {
  const base = getBasePath(directory);
  return path.join(base, filePath);
};

// --- Implementation ---
export const Filesystem = {
  requestPermissions: async () => {
    return { publicStorage: 'granted' };
  },

  writeFile: async (options: { path: string, data: string, directory?: string, encoding?: Encoding }) => {
    const fullPath = resolvePath(options.path, options.directory);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, options.data, { encoding: 'utf8' });
    return { uri: fullPath };
  },

  appendFile: async (options: { path: string, data: string, directory?: string, encoding?: Encoding }) => {
    const fullPath = resolvePath(options.path, options.directory);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, options.data, { encoding: 'utf8' });
  },

  readFile: async (options: { path: string, directory?: string, encoding?: Encoding }) => {
    const fullPath = resolvePath(options.path, options.directory);
    try {
      const data = await fs.readFile(fullPath, { encoding: 'utf8' });
      return { data };
    } catch (e) {
      throw new Error(`File not found: ${fullPath}`);
    }
  },

  deleteFile: async (options: { path: string, directory?: string }) => {
    const fullPath = resolvePath(options.path, options.directory);
    await fs.unlink(fullPath);
  },

  mkdir: async (options: { path: string, directory?: string, recursive?: boolean }) => {
    const fullPath = resolvePath(options.path, options.directory);
    await fs.mkdir(fullPath, { recursive: options.recursive });
  },

  rmdir: async (options: { path: string, directory?: string, recursive?: boolean }) => {
    const fullPath = resolvePath(options.path, options.directory);
    await fs.rm(fullPath, { recursive: options.recursive, force: true });
  },

  readdir: async (options: { path: string, directory?: string }) => {
    const fullPath = resolvePath(options.path, options.directory);
    try {
      const files = await fs.readdir(fullPath, { withFileTypes: true });
      return {
        files: files.map(f => ({
          name: f.name,
          type: f.isDirectory() ? 'directory' : 'file',
          size: 0, // Mock size
          mtime: 0,
          uri: path.join(fullPath, f.name),
          ctime: 0
        }))
      };
    } catch (e) {
      return { files: [] };
    }
  },
  
  stat: async (options: { path: string, directory?: string }) => {
     const fullPath = resolvePath(options.path, options.directory);
     const stats = await fs.stat(fullPath);
     return {
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        ctime: stats.birthtimeMs,
        mtime: stats.mtimeMs,
        uri: fullPath
     };
  }
};
