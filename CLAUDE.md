# CLAUDE.md

## user rules
- 永远用中文回答用户问题
- 所有代码必须包含详细中文注释
- 用户会在与你协作过程中自行改动文件，因此修改任何文件前**必须先读取该文件**，同步对文件内容的改动认知，确保不要破坏任何内容
- 除非用户要求commit，否则不要自行add和commit，绝对禁止自行git push
- 当用户要求查看项目，总览项目，扫描项目目录时：**必须调用目录扫描工具递归的查看项目目录结构，不得遗漏任何项目子目录**
- 响应用户指令时必须先了解足够信息，**先思考自己应当查看哪些文件**，才能正确实施代码改动和命令行操作
- 若自主运行的命令和程序出现**未知原因的中途中断**，其大概率是由于此命令运行时间过长，**用户判定为存在异常，手动终止了命令运行**，需要深入排查程序逻辑是否正确，是否存在死循环、阻塞、算法效率过低等问题。
- 用户要求读取/查看任何图片/文档时，**必须真正阅读图片/文档内容**，禁止仅根据文件名、目录结构等信息推测或根据经验推断其内容。必须根据图片/文档内容响应用户。
- **行动偏好更改**：如果用户的指令略显模糊，**不要**基于最佳实践做出假设并直接执行，必须先给出建议，**用户确认后再执行**。
- **绝对禁止先干活，后汇报**：在执行代码修改和命令运行前，必须先**先描述清楚意图**，然后再执行工具调用，便于用户监控。
- **交互设计红线**：涉及前端交互逻辑变更，必须先在 DESIGN.md 完成设计并获得用户明确“确认”指令授权后方可实施代码；严禁未授权修改，且仅明确肯定回复视为确认，模糊表态（如“可以”或者提出了修改意见）无效。

## mermaid绘图
- 文本中的特殊字符（如括号、空格、中文字符）会与 Mermaid 解析器发生冲突。必须使用双引号将包含特殊字符的文本包裹起来。
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PixelBill is a personal expense tracking application with a "Cyber-Zen" design philosophy. It integrates WeChat Pay and Alipay billing data, using AI for smart categorization. The app runs locally-first with JSON file storage.

## Commands

```bash
npm run dev          # Start Vite dev server (Web preview with mock filesystem)
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint check
npm run preview      # Preview production build

# Android development
npx cap sync         # Sync build to Android project
npx cap open android # Open Android Studio
npx cap run android  # Run on connected device/emulator
```

## Architecture

### Core-UI Separation

The codebase follows a **"Wrapper + Strategy Pattern"** architecture:

- **`src/core/`** - Platform-agnostic business logic (services, arbiter, plugins)
- **`src/views/`** - Platform-specific view containers (`DesktopApp.tsx`, `MobileApp.tsx`)
- **`src/components/`** - UI components split into `common/`, `desktop/`, `mobile/`
- **`src/hooks/`** - React hooks that bridge UI to core services

### The Arbiter System

The central categorization mechanism in `src/core/arbiter/Arbiter.ts`:

1. **Priority Chain**: USER > RULE_ENGINE > AI_AGENT
2. **Proposal Cache**: Stores categorization proposals from multiple sources
3. **Persistence Callbacks**: Writes decisions back to JSON via `PersistenceManager`

### Plugin Architecture

Plugins implement `ICategoryPlugin` interface (`src/core/plugin/types.ts`):

- `UserMetaPlugin` - Highest priority, loads user manual classifications
- `AIEnginePlugin` - Async AI-based categorization
- `RegexRulePlugin` - Pattern-based rules (lowest priority)
- `LocalAIMetaPlugin` - Batch AI analysis

### Data Flow

```
CSV Import → Parser → LedgerService → Arbiter → Plugins → FinalDecision
                                    ↓
                            PersistenceManager
                                    ↓
                         *.pixelbill.json (JSON storage)
```

### Storage Layer (`src/utils/fs-storage.ts`)

- **Web**: File System Access API
- **Android**: Capacitor Filesystem API
- **Dev Mock**: Vite alias redirects to `src/mocks/` which proxies to Node.js filesystem

### Key Services

- **LedgerService** (`src/core/services/LedgerService.ts`): Singleton managing transaction state, subscriptions, and coordination
- **PersistenceManager**: Handles debounced JSON writes
- **ConfigManager**: Encrypted AI provider configuration storage

### Type System

- `TransactionBase` - Raw transaction data from CSV
- `TransactionMeta` - AI/user classification metadata
- `FullTransactionRecord` - Combined record
- `LedgerMemory` - Full JSON file structure

## Development Notes

### Mock Filesystem

During `npm run dev`, Capacitor APIs are redirected to mocks (`vite.config.ts` aliases). The mock layer writes to `virtual_android_filesys/` directory in project root, simulating Android storage.

### Testing Strategy

The project uses console-driven E2E testing rather than Node.js unit tests:
- Run `npm run dev`
- Access `window.__DEBUG_TOOLS__` in browser DevTools console
- Test scripts located in `scripts/` directory (Node.js scripts for verification)

### Splash Screen Timing

The app enforces a 1.5s minimum splash screen to ensure smooth data loading ("No Flash" principle). See `src/App.tsx`.

## Design Philosophy

Refer to `SOUL.md` for the "Cyber-Zen" design ethos: simplicity, order, serenity, spirituality. Key visual principles:
- Deep black (Zinc-950) backgrounds with emerald accents
- Dot matrix visualizations instead of traditional charts
- In-place animations with Framer Motion `layoutId`
- 4-second breathing rhythm for UI elements