# 前端剥离架构设计方案

**创建日期**: 2026-04-07  
**目标**: 将 PixelBill 前端从 Capacitor 依赖中剥离，支持 Web/Desktop/Mobile 多端部署

---

## 一、现状分析

### 1.1 Capacitor 依赖分布

通过代码扫描，发现以下文件直接依赖 Capacitor API：

#### 核心服务层 (Core Services)
- `SnapshotManager.ts` - 快照管理
- `MemoryManager.ts` - 记忆文件管理
- `LedgerManager.ts` - 账本生命周期管理
- `LedgerService.ts` - 账本状态管理
- `ExampleStore.ts` - 实例库管理
- `SelfDescriptionManager.ts` - 用户自述管理
- `MigrationManager.ts` - 数据迁移
- `ConfigManager.ts` - 配置管理

#### AI 引擎层 (AI Engine)
- `ClassifyQueue.ts` - 分类任务队列
- `ClassifyTrigger.ts` - 分类触发器
- `LedgerLoader.ts` - 账本加载器
- `RuleLoader.ts` - 规则加载器

#### 工具层 (Utils)
- `fs-storage.ts` - 文件系统抽象（部分抽象已存在）
- `haptics.ts` - 触觉反馈
- `RawLogger.ts` - 日志系统

#### UI 层 (Hooks)
- `useFileWatcher.ts` - 文件监听

**统计**: 共 17 个文件直接依赖 Capacitor

### 1.2 主要依赖的 Capacitor API

1. **@capacitor/filesystem**
   - `Filesystem.readFile()` - 读取文件
   - `Filesystem.writeFile()` - 写入文件
   - `Filesystem.appendFile()` - 追加文件
   - `Filesystem.deleteFile()` - 删除文件
   - `Filesystem.mkdir()` - 创建目录
   - `Filesystem.rmdir()` - 删除目录
   - `Filesystem.readdir()` - 列出目录
   - `Filesystem.stat()` - 获取文件信息
   - `Directory` 枚举 - 目录类型（Documents/Data/Cache）
   - `Encoding` 枚举 - 编码类型（UTF8/ASCII）

2. **@capacitor/core**
   - `Capacitor.isNativePlatform()` - 平台检测

3. **@capacitor/haptics**
   - `Haptics.impact()` - 触觉反馈
   - `Haptics.notification()` - 通知反馈

### 1.3 现有抽象层

项目已有部分抽象：
- `src/mocks/capacitor-filesystem.ts` - 开发环境 Mock 实现
- `src/utils/fs-storage.ts` - 部分平台检测和类型定义
- Vite 中间件 `/api/fs` - 开发环境文件系统代理

---

## 二、架构设计

### 2.1 设计原则

1. **接口优先**: 定义统一的文件系统接口，隔离平台差异
2. **适配器模式**: 为不同平台提供适配器实现
3. **零侵入**: 核心业务逻辑不感知平台差异
4. **渐进式**: 分阶段迁移，保证每个阶段可测试可回滚

### 2.2 抽象层架构

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  (LedgerService, SnapshotManager, AI Engine, etc.)     │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Filesystem Abstraction Layer                │
│                  (IFilesystemAdapter)                    │
└─────────────────────────────────────────────────────────┘
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                   ↓
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Capacitor   │  │   IndexedDB   │  │   Electron    │
│    Adapter    │  │    Adapter    │  │    Adapter    │
│  (Mobile/Web) │  │  (Pure Web)   │  │  (Desktop)    │
└───────────────┘  └───────────────┘  └───────────────┘
```

### 2.3 核心接口定义

```typescript
// src/core/adapters/IFilesystemAdapter.ts

export enum AdapterDirectory {
  Documents = 'DOCUMENTS',
  Data = 'DATA',
  Cache = 'CACHE'
}

export enum AdapterEncoding {
  UTF8 = 'utf8',
  ASCII = 'ascii'
}

export interface ReadFileOptions {
  path: string;
  directory?: AdapterDirectory;
  encoding?: AdapterEncoding;
}

export interface WriteFileOptions {
  path: string;
  data: string;
  directory?: AdapterDirectory;
  encoding?: AdapterEncoding;
  recursive?: boolean;
}

export interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size: number;
  mtime: number;
  ctime: number;
  uri?: string;
}

export interface IFilesystemAdapter {
  // 文件操作
  readFile(options: ReadFileOptions): Promise<string>;
  writeFile(options: WriteFileOptions): Promise<void>;
  appendFile(options: WriteFileOptions): Promise<void>;
  deleteFile(options: { path: string; directory?: AdapterDirectory }): Promise<void>;
  
  // 目录操作
  mkdir(options: { path: string; directory?: AdapterDirectory; recursive?: boolean }): Promise<void>;
  rmdir(options: { path: string; directory?: AdapterDirectory; recursive?: boolean }): Promise<void>;
  readdir(options: { path: string; directory?: AdapterDirectory }): Promise<FileInfo[]>;
  
  // 文件信息
  stat(options: { path: string; directory?: AdapterDirectory }): Promise<FileInfo>;
  exists(options: { path: string; directory?: AdapterDirectory }): Promise<boolean>;
  
  // 权限管理
  requestPermissions?(): Promise<{ publicStorage: string }>;
}
```

### 2.4 触觉反馈抽象

```typescript
// src/core/adapters/IHapticsAdapter.ts

export enum HapticImpactStyle {
  Light = 'LIGHT',
  Medium = 'MEDIUM',
  Heavy = 'HEAVY'
}

export enum HapticNotificationType {
  Success = 'SUCCESS',
  Warning = 'WARNING',
  Error = 'ERROR'
}

export interface IHapticsAdapter {
  impact(style: HapticImpactStyle): Promise<void>;
  notification(type: HapticNotificationType): Promise<void>;
  vibrate(duration?: number): Promise<void>;
}
```

---

## 三、实施计划

### 3.1 阶段划分

#### Phase 1: 基础设施搭建（1-2天）✅ **已完成**
- [x] 创建适配器接口定义
  - `IFilesystemAdapter.ts` - 文件系统接口
  - `IHapticsAdapter.ts` - 触觉反馈接口
- [x] 实现 Capacitor 适配器（包装现有实现）
  - `CapacitorFilesystemAdapter.ts`
  - `CapacitorHapticsAdapter.ts`
- [ ] 实现 IndexedDB 适配器（纯 Web 方案）- **待实现**
- [x] 创建适配器工厂和自动检测逻辑
  - `FilesystemService.ts`
  - `HapticsService.ts`
- [ ] 编写适配器单元测试 - **待实现**

#### Phase 2: 核心服务迁移（2-3天）
- [x] 迁移 `SnapshotManager` - ✅ 已完成
- [x] 迁移 `MemoryManager` - ✅ 已完成（无直接 Capacitor 依赖）
- [ ] 迁移 `LedgerManager`
- [ ] 迁移 `LedgerService`
- [ ] 迁移 `ExampleStore`
- [ ] 迁移 `SelfDescriptionManager`
- [ ] 迁移 `MigrationManager`
- [ ] 迁移 `ConfigManager`

#### Phase 3: AI 引擎迁移（1-2天）
- [ ] 迁移 `ClassifyQueue`
- [ ] 迁移 `ClassifyTrigger`
- [ ] 迁移 `LedgerLoader`
- [ ] 迁移 `RuleLoader`

#### Phase 4: 工具层迁移（1天）
- [ ] 迁移 `RawLogger`
- [ ] 迁移 `haptics` 工具
- [ ] 重构 `fs-storage` 工具

#### Phase 5: UI 层适配（1天）
- [ ] 迁移 `useFileWatcher`
- [ ] 更新相关组件

#### Phase 6: 测试与验证（1-2天）
- [ ] 端到端测试（Capacitor 环境）
- [ ] 端到端测试（纯 Web 环境）
- [ ] 性能测试
- [ ] 兼容性测试

**总计**: 7-11 天

---

## 实施进度跟踪

**最后更新**: 2026-04-07

### Phase 1: 基础设施搭建 ✅ 已完成

**完成时间**: 2026-04-07  
**完成文件**:
- `src/core/adapters/IFilesystemAdapter.ts` - 文件系统接口定义（5.2KB）
- `src/core/adapters/IHapticsAdapter.ts` - 触觉反馈接口定义（1.2KB）
- `src/core/adapters/CapacitorFilesystemAdapter.ts` - Capacitor 文件系统适配器（6.1KB）
- `src/core/adapters/CapacitorHapticsAdapter.ts` - Capacitor 触觉反馈适配器（2.1KB）
- `src/core/adapters/FilesystemService.ts` - 文件系统工厂服务（3.1KB）
- `src/core/adapters/HapticsService.ts` - 触觉反馈工厂服务（2.8KB）
- `src/core/adapters/index.ts` - 模块导出（1.0KB）

**待完成**:
- IndexedDB 适配器实现（Phase 1 后续优化）
- 适配器单元测试（Phase 6 统一测试）

### Phase 2-6: 待开始

**Phase 2: 核心服务迁移** - 🚧 进行中

**开始时间**: 2026-04-07  
**已完成文件**:
- `src/core/services/SnapshotManager.ts` - ✅ 已迁移（7处 Capacitor API 调用）
- `src/core/services/MemoryManager.ts` - ✅ 已迁移（仅更新 import，无直接依赖）

**进行中**:
- 剩余 6 个核心服务文件待迁移

**Phase 3-6**: 待开始

---

### 3.2 迁移模式

每个文件的迁移遵循以下模式：

**迁移前**:
```typescript
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export class SnapshotManager {
  private static async loadIndex(ledgerName: string) {
    const result = await Filesystem.readFile({
      path: `PixelBill/classify_memory/${ledgerName}/index.json`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });
    return JSON.parse(result.data as string);
  }
}
```

**迁移后**:
```typescript
import { FilesystemService } from '../adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '../adapters/IFilesystemAdapter';

export class SnapshotManager {
  private static async loadIndex(ledgerName: string) {
    const fs = FilesystemService.getInstance();
    const data = await fs.readFile({
      path: `PixelBill/classify_memory/${ledgerName}/index.json`,
      directory: AdapterDirectory.Documents,
      encoding: AdapterEncoding.UTF8
    });
    return JSON.parse(data);
  }
}
```

---

## 四、适配器实现方案

### 4.1 Capacitor 适配器

直接包装现有 Capacitor API，保持向后兼容。

```typescript
// src/core/adapters/CapacitorFilesystemAdapter.ts

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { IFilesystemAdapter, ReadFileOptions, WriteFileOptions } from './IFilesystemAdapter';

export class CapacitorFilesystemAdapter implements IFilesystemAdapter {
  async readFile(options: ReadFileOptions): Promise<string> {
    const result = await Filesystem.readFile({
      path: options.path,
      directory: this.mapDirectory(options.directory),
      encoding: this.mapEncoding(options.encoding)
    });
    return result.data as string;
  }
  
  // ... 其他方法实现
}
```

### 4.2 IndexedDB 适配器

使用 IndexedDB 模拟文件系统，支持纯 Web 环境。

```typescript
// src/core/adapters/IndexedDBFilesystemAdapter.ts

export class IndexedDBFilesystemAdapter implements IFilesystemAdapter {
  private db: IDBDatabase | null = null;
  
  async init() {
    // 初始化 IndexedDB
    // 数据库名: pixelbill_fs
    // 对象存储: files, directories
  }
  
  async readFile(options: ReadFileOptions): Promise<string> {
    const fullPath = this.resolvePath(options.path, options.directory);
    const file = await this.getFile(fullPath);
    if (!file) throw new Error(`File not found: ${fullPath}`);
    return file.content;
  }
  
  // ... 其他方法实现
}
```

### 4.3 Electron 适配器（可选）

使用 Node.js `fs` 模块，支持 Electron 桌面应用。

```typescript
// src/core/adapters/ElectronFilesystemAdapter.ts

import * as fs from 'fs/promises';
import * as path from 'path';

export class ElectronFilesystemAdapter implements IFilesystemAdapter {
  private basePath: string;
  
  constructor() {
    // 使用 Electron 的 app.getPath('userData')
    this.basePath = (window as any).electron?.getAppPath() || './data';
  }
  
  async readFile(options: ReadFileOptions): Promise<string> {
    const fullPath = this.resolvePath(options.path, options.directory);
    return await fs.readFile(fullPath, options.encoding || 'utf8');
  }
  
  // ... 其他方法实现
}
```

### 4.4 适配器工厂

```typescript
// src/core/adapters/FilesystemService.ts

import type { IFilesystemAdapter } from './IFilesystemAdapter';
import { CapacitorFilesystemAdapter } from './CapacitorFilesystemAdapter';
import { IndexedDBFilesystemAdapter } from './IndexedDBFilesystemAdapter';
import { Capacitor } from '@capacitor/core';

export class FilesystemService {
  private static instance: IFilesystemAdapter | null = null;
  
  static getInstance(): IFilesystemAdapter {
    if (!this.instance) {
      this.instance = this.createAdapter();
    }
    return this.instance;
  }
  
  private static createAdapter(): IFilesystemAdapter {
    // 检测运行环境
    if (Capacitor.isNativePlatform()) {
      return new CapacitorFilesystemAdapter();
    }
    
    // 检测是否为 Electron
    if ((window as any).electron) {
      // return new ElectronFilesystemAdapter();
    }
    
    // 默认使用 IndexedDB（纯 Web）
    return new IndexedDBFilesystemAdapter();
  }
  
  // 测试辅助：手动设置适配器
  static setAdapter(adapter: IFilesystemAdapter) {
    this.instance = adapter;
  }
}
```

---

## 五、技术细节

### 5.1 IndexedDB 文件系统设计

#### 数据库结构
```
Database: pixelbill_fs
├── ObjectStore: files
│   ├── Key: fullPath (string)
│   └── Value: { path, content, mtime, ctime, size }
└── ObjectStore: directories
    ├── Key: fullPath (string)
    └── Value: { path, mtime, ctime }
```

#### 路径解析规则
```typescript
// Documents/PixelBill/default.pixelbill.json
// → /documents/PixelBill/default.pixelbill.json

// Data/classify_queue/default.json
// → /data/classify_queue/default.json
```

### 5.2 性能优化

1. **缓存策略**: 
   - 内存缓存常用文件（如 ledgers.json）
   - LRU 淘汰策略

2. **批量操作**:
   - 提供 `batchWrite()` 接口
   - 减少 IndexedDB 事务次数

3. **懒加载**:
   - 适配器按需初始化
   - 延迟加载大文件

### 5.3 兼容性考虑

1. **数据迁移**:
   - 提供 Capacitor → IndexedDB 迁移工具
   - 支持导出/导入功能

2. **降级方案**:
   - IndexedDB 不可用时使用 localStorage
   - 提示用户浏览器兼容性问题

3. **平台检测**:
   - 优先使用 Capacitor（移动端）
   - 其次使用 Electron（桌面端）
   - 最后使用 IndexedDB（Web 端）

---

## 六、测试策略

### 6.1 单元测试

为每个适配器编写单元测试：

```typescript
// tests/adapters/CapacitorFilesystemAdapter.test.ts
describe('CapacitorFilesystemAdapter', () => {
  it('should read file correctly', async () => {
    const adapter = new CapacitorFilesystemAdapter();
    const content = await adapter.readFile({
      path: 'test.json',
      directory: AdapterDirectory.Documents
    });
    expect(content).toBeDefined();
  });
});
```

### 6.2 集成测试

测试核心服务在不同适配器下的行为一致性：

```typescript
// tests/integration/SnapshotManager.test.ts
describe('SnapshotManager with different adapters', () => {
  it('should work with Capacitor adapter', async () => {
    FilesystemService.setAdapter(new CapacitorFilesystemAdapter());
    // 测试快照创建、读取、删除
  });
  
  it('should work with IndexedDB adapter', async () => {
    FilesystemService.setAdapter(new IndexedDBFilesystemAdapter());
    // 测试快照创建、读取、删除
  });
});
```

### 6.3 端到端测试

在真实环境中测试完整流程：

1. **Capacitor 环境**: Android 真机/模拟器
2. **Web 环境**: Chrome/Firefox/Safari
3. **Electron 环境**: Windows/macOS/Linux

---

## 七、风险评估

### 7.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| IndexedDB 性能不足 | 高 | 中 | 引入缓存层，优化读写策略 |
| 数据迁移失败 | 高 | 低 | 提供回滚机制，充分测试 |
| 浏览器兼容性问题 | 中 | 中 | 提供降级方案，明确支持范围 |
| 适配器 Bug | 中 | 中 | 充分的单元测试和集成测试 |

### 7.2 进度风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 迁移工作量超预期 | 高 | 中 | 分阶段实施，优先核心功能 |
| 测试时间不足 | 中 | 高 | 自动化测试，并行测试 |
| 回归问题 | 高 | 中 | 保留原有实现，灰度发布 |

---

## 八、后续优化

### 8.1 短期优化（1-2周）

- [ ] 实现文件系统缓存层
- [ ] 优化 IndexedDB 批量操作
- [ ] 添加性能监控

### 8.2 中期优化（1-2月）

- [ ] 实现 Electron 适配器
- [ ] 支持云端同步（WebDAV/S3）
- [ ] 实现增量备份

### 8.3 长期优化（3-6月）

- [ ] 支持 OPFS (Origin Private File System)
- [ ] 实现端到端加密
- [ ] 支持多设备同步

---

## 九、参考资料

- [Capacitor Filesystem API](https://capacitorjs.com/docs/apis/filesystem)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Origin Private File System](https://web.dev/file-system-access/)
- [Adapter Pattern](https://refactoring.guru/design-patterns/adapter)

---

**文档版本**: v1.0  
**最后更新**: 2026-04-07  
**维护者**: PixelBill 开发团队
