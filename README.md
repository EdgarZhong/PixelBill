# PixelBill 账单管理系统

![PixelBill](./public/icon.svg)

**PixelBill** 是一个奉行“生成式极简主义”与“赛博禅意”设计哲学的个人记账应用。它运行在本地，采用 **"当代生成式点阵" (Contemporary Generative Dot Matrix)** 风格，旨在安全、高效地整合微信和支付宝的账单流水。

> 冷静、理性、清晰、秩序感、像素美学。

## ✨ 核心特性

*   **本地优先 (Local-First)**: 基于 File System Access API 实现，数据完全存储在用户本地的 JSON 文件中，无服务器交互，隐私绝对安全。
*   **智能导入**: 自动识别并解析微信支付和支付宝的 CSV 账单文件，无需手动转码。
*   **生成式可视化**:
    *   **活跃度矩阵**: 动态展示最近 14 天的消费热力，像素高度与透明度随消费额动态生成。
    *   **心理账户点阵**: 使用非线性的 5 级像素点阵来直观呈现金额量级，而非枯燥的数字。
*   **多信源仲裁系统 (Arbiter)**: 
    *   内置强大的分类仲裁器，支持多插件协作。
    *   **UserMetaPlugin**: 最高优先级，负责加载用户已存在的手动分类记录（不直接处理交互，交互由 UI 触发 Arbiter 写入）。
    *   **AIEnginePlugin**: 异步后台智能引擎，基于上下文进行批量化分类分析。
    *   **RegexRulePlugin**: 预留扩展位，供极客用户自定义正则规则（默认低优先级）。
    *   **Fallback 机制**: 确保在所有插件失效时保留历史分类，防止数据丢失。
*   **JSON 即数据库**: 采用 `Raw Data` + `Meta Data` 分层架构，支持使用外部编辑器直接修改 JSON 文件来干预应用数据。

## 🛠️ 技术栈

*   **Frontend**: React 19, TypeScript
*   **Mobile Framework**: Capacitor (Android Adapter)
*   **Build Tool**: Vite
*   **Styling**: TailwindCSS, Framer Motion (动画)
*   **Data Processing**: PapaParse (CSV解析), date-fns (日期处理)

## 🚀 快速开始

### 环境要求
*   **基础环境**: Node.js >= 18
*   **Web 开发**: 现代浏览器 (支持 File System Access API，如 Chrome, Edge)
*   **Android 开发**:
    *   Android Studio (最新版)
    *   Java JDK 17
    *   Android SDK Platform 34 (或更高)

### 🧪 Mock 文件系统测试环境 (已验证与安卓模拟器的一致性)

为了在 PC 开发阶段完美复刻 Android 的文件读写行为，文件读写不依赖笨重的安卓模拟器，本项目内置了一套 **API 级劫持 (API Hijacking)** 的测试环境。

#### 目标
*   在 Web 浏览器中开发时，无需连接真机，即可测试 `fs-storage.ts` 中针对 Android 编写的复杂文件逻辑。
*   保持业务代码的纯净性：业务代码中不包含任何测试逻辑 (`if (DEV) ...`)，完全按照“我在运行安卓”的假设编写。

#### 设计原理
*   **API 劫持**: 利用 Vite Alias 在开发模式下将 `@capacitor/filesystem` 和 `@capacitor/core` 重定向到 `src/mocks/*`。
*   **后端代理**: Mock 模块将文件操作转发给 Vite 中间件 (`mock-fs-middleware.ts`)，由 Node.js 直接读写本地磁盘。
*   **双根目录沙箱**:
    *   `Directory.Documents` -> 映射至项目根目录 `virtual_android_filesys/Documents_path` (模拟公共存储)
    *   `Directory.Data` -> 映射至项目根目录 `virtual_android_filesys/sandbox_path` (模拟 App 私有沙箱)

#### 功能支持程度
| 特性 | 状态 | 说明 |
| :--- | :--- | :--- |
| **基础读写** | ✅ | `readFile`, `writeFile` (覆盖), `appendFile` (追加) |
| **目录管理** | ✅ | `mkdir` (递归), `rmdir`, `readdir` |
| **元数据** | ✅ | `stat` (支持 size, mtime, ctime) |
| **文件操作** | ✅ | `deleteFile`, `rename` (支持跨目录移动) |
| **权限模拟** | ⚠️ | 默认全通过 (Auto-granted)，不支持拒绝场景 |
| **错误码** | ⚠️ | 返回 Node.js 风格错误，与 Android 系统错误码不完全一致 |
| **二进制** | ❌ | 目前仅支持 UTF-8 文本读写，二进制/Base64 暂不支持 |

### 安装与运行

1.  **克隆仓库**
    ```bash
    git clone git@github.com:EdgarZhong/PixelBill.git
    cd PixelBill
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **开发模式**

    *   **Web 预览** (快速 UI 调试):
        ```bash
        npm run dev
        ```

    *   **Android 真机调试** (需连接手机或启动模拟器):
        ```bash
        # 1. 构建前端并同步资源到 Android 项目
        npm run build
        npx cap sync
    
        # 2. 打开 Android Studio 运行
        npx cap open android
        
        # 或者直接命令行运行 (需配置好 gradle 环境变量)
        npx cap run android
        ```

4.  **构建生产版本**
    ```bash
    npm run build
    ```

## 🏗️ 架构概览

### 架构设计：双端共存与 Core-UI 分离 (Architecture: Core-UI Separation)

为了兼顾比赛（移动端优先）与发布（桌面端实用性）需求，采用 **Monorepo-lite Style** 的 **"Wrapper + Strategy Pattern"** 架构。

#### 核心原则 (Core Principles)
1.  **UI/Logic 物理隔离**: 
    *   桌面端与移动端拥有完全独立的视图文件（View）和差异化组件（Components）。
    *   严禁在单一组件内部通过大量 `if (isMobile)` 进行面条式渲染。
2.  **Core Logic Decoupling (核心逻辑解耦)**:
    *   **Service Layer**: 引入 `LedgerService` 和 `PersistenceManager` 单例，封装核心业务逻辑与 I/O 操作，严禁耦合在 React 组件生命周期内。
    *   **View Model**: React 组件仅作为 View Model 订阅 Service 状态，通过 Hooks (`useLedger`) 获取数据，不直接处理底层逻辑。
3.  **Conditional Entry (条件入口)**:
    *   通过环境变量或运行时检测，在根节点 (`App.tsx`) 决定加载哪套视图系统。

#### 目录结构 (Directory Structure)
```
src/
  ├── core/              # [SHARED] 核心逻辑 (Service, Arbiter, Plugin, Types)
  │    ├── services/     # Service Layer (LedgerService, PersistenceManager)
  │    ├── arbiter/      # 仲裁器 (Arbiter)
  │    └── plugin/       # 插件系统 (AIPlugin, RulePlugin)
  ├── hooks/             # [SHARED] 通用 Hooks (useLedger, useAppLogic)
  ├── utils/             # [SHARED] 工具函数
  ├── components/
  │    ├── common/       # [SHARED] 通用原子组件
  │    ├── desktop/      # [DESKTOP] 桌面端特有组件
  │    └── mobile/       # [MOBILE] 移动端特有组件
  ├── views/
  │    ├── DesktopApp.tsx  # [DESKTOP] 桌面端主视图容器
  │    └── MobileApp.tsx   # [MOBILE] 移动端主视图容器
  └── App.tsx            # [ENTRY] 路由分发器
```


### 数据流与仲裁器设计 (The Arbiter)

PixelBill 的核心是一个基于优先级的仲裁系统，用于决定每一笔交易最终展示的分类。

1.  **Ingest**: 导入 CSV 流水，转换为标准化的 `TransactionBase` 对象。
2.  **Arbiter**: 遍历交易，并行询问所有注册插件。
3.  **Plugins**:
    *   `UserMetaPlugin`: 读取 `*.pixelbill.json` 中的 `user_category` 字段，确保用户手动分类具有最高优先级 (Priority: HIGH)。
    *   `AIEnginePlugin`: 异步后台运行，批量分析数据并提交智能分类提案 (Priority: MEDIUM)。
    *   `RegexRulePlugin`: 正则规则匹配，预留给高级用户扩展 (Priority: LOW)。
4.  **Decision**: 仲裁器根据优先级选出最佳提案 (Proposal)，生成最终视图。

### 元数据存储

系统会在导入 CSV 的同级目录下生成 `*.pixelbill.json` 文件，结构如下：

```json
{
  "version": "1.0",
  "records": {
    "SHA256_HASH_ID": {
      "id": "...",
      "user_category": "meal",
      "ai_category": "others",
      "ai_reasoning": "Detected keywords...",
      "updated_at": "2024-01-01 12:00:00"
    }
  }
}
```


## 📅 开发进展

*   **已完成**:
    *   [x] 核心 UI 框架搭建 (Header, Transaction List, Activity Matrix)。
    *   [x] CSV 解析与智能编码识别。
    *   [x] 基于 File System Access API 的文件读写。
    *   [x] 仲裁器 (Arbiter) 基础逻辑与 Fallback 策略。
    *   [x] 解决 React Render Loop 和 File Watcher IO Loop 问题。
*   **进行中**:
    *   [x] AI 插件实装 (对接 LLM API 或完善离线清洗脚本)。
    *   [ ] UI 优化：添加元数据编辑入口与分类仲裁的可视化反馈。

## 📅 7日冲刺计划 (7-Day Sprint Plan)

**前提**: 基础 Capacitor 环境已同步 (`npx cap sync`)，Android 工程可编译。

### 🛠️ Phase 1: 核心功能与 AI 开发 (Day 1-5)

*   **Day 1: Android 文件系统适配 (File System Adapter)**
    *   **目标**: 彻底打通移动端读写本地文件的能力。
    *   [x] **核心重构**: 重构 `src/utils/fs-storage.ts`，区分 Web 环境 (File System Access API) 与 Native 环境 (Capacitor Filesystem)。
    *   [x] **权限逻辑**: 实现 Android 运行时权限申请 (Runtime Permission Request)，处理存储权限拒绝的边界情况。
    *   [x] **数据验证**: 在 Android 真机上验证 CSV 文件的读取、解析与元数据写入稳定性。(通过 Mock 环境完成验证)

*   **Day 2: 移动端交互重构 (Mobile UX/UI)**
    *   **目标**: 让应用拥有原生 App 的触感与视觉体验。
    *   [x] **视口适配**: 适配刘海屏、灵动岛与底部手势条 (`SafeArea`)，防止内容遮挡。
    *   [x] **手势系统**: 实现列表项的左滑/右滑手势（支持归档、删除或快速标记分类）。
    *   [x] **触感反馈**: 集成 Haptics 插件，在仲裁成功、切换视图等关键操作加入细腻的震动反馈。

*   **Day 3: AI 插件基础设施 (AI Infrastructure)**
    *   **目标**: 建立 AI 参与账单分类的底层通道。
    *   [x] **插件架构**: 开发 `src/core/plugin/AIPlugin.ts`，实现标准的 `ArbiterPlugin` 接口。
    *   [x] **API 对接**: 集成 LLM API (OpenAI/DeepSeek)，封装网络请求，处理超时与鉴权。
    *   [x] **Prompt 初版**: 设计用于解析中文账单描述的基础 System Prompt，确立输出 JSON 格式。

*   **Day 4: AI 智能优化与闭环 (AI Intelligence)**
    *   **目标**: 提升 AI 准确率，构建“越用越聪明”的反馈循环。
    *   [ ] **Prompt 调优**: 针对支付宝/微信的特殊字段（如“扫二维码付款-给XXX”）优化 Prompt，精准提取商户实体。
    *   [ ] **学习机制**: 实现 User-in-the-loop 反馈，将用户的手动修正记录为 Few-shot 样本，存入本地元数据供 AI 下次参考。

*   **Day 5: 综合集成与性能 (Integration & Performance)**
    *   **目标**: 将 AI 决策可视化，并保证应用丝滑流畅。
    *   [ ] **可视化仲裁**: 在 UI 上通过不同颜色的像素点或标记，直观区分“人工分类”与“AI 预测”。
    *   [ ] **列表优化**: 针对移动端算力，优化 `TransactionList` 的虚拟滚动与渲染开销。
    *   [ ] **启动优化**: 优化 Splash Screen 体验，减少首屏白屏时间。

### 🧪 Phase 2: 测试与交付 (Day 6-7)

*   **Day 6: 全面测试 (QA & Testing)**
    *   [ ] **真机压力测试**: 导入数千条账单，检测内存占用与 AI 响应速度。
    *   [ ] **边界条件**: 测试飞行模式（无网 AI 降级）、权限拒绝、后台切换等极端情况。
    *   [ ] **Bug Fix Sprint**: 集中修复测试中发现的阻断性问题与 UI 错位。

*   **Day 7: 材料准备与提交 (Delivery)**
    *   [ ] **演示视频**: 录制高光时刻 (Highlight) 视频，展示“导入 -> AI 分类 -> 像素图生成”的完整心流。
    *   [ ] **Store Assets**: 制作符合比赛要求的应用图标、Banner 和宣传截图。
    *   [ ] **文档封版**: 最终更新 README 和 DESIGN.md，打包 Release APK 并签名。

## 🎨 设计细节

详细设计文档请参阅 [DESIGN.md](docs/DESIGN.md)。

Day 2 移动端交互重构的实现文档请参阅 [DAY2_IMPLEMENTATION.md](docs/DAY2_IMPLEMENTATION.md)。

*   **视觉风格**: 赛博禅意 (Cyber-Zen)，使用深空背景与呼吸光效。
*   **交互原则**: 非侵入式交互，拒绝弹窗，强调数据本身的韵律。
*   **字体**: 混合使用 `Press Start 2P` (标题) 与 `Space Mono` (数据)。

---

## 🧪 维护与测试计划 (Maintenance & Testing)

### 1. 零侵入 E2E 测试策略 (Zero-Intrusion E2E Testing Strategy)

**核心原则**: 
> "Do not mock the code; mock the world." (不要为了测试修改代码，而是模拟代码运行的世界)

在 PixelBill 中，我们摒弃了传统的 "Node.js 单元测试驱动业务逻辑" 的方案（因为这需要大量修改业务代码以适配 Node 环境），转而采用 **"浏览器/真机控制台驱动 (Console Driver)"** 模式。

**驱动原生运行时：使用原生数据，复用原生模块/组件，驱动原生数据流，测试原生代码**

#### 最佳实践方案
1.  **运行环境一致性**: 测试直接在 `npm run dev` (浏览器) 或 `npx cap run android` (真机) 的运行态中进行。
2.  **无代码修改**: 禁止在 `src/` 业务代码中为了测试暴露私有方法或添加 `.ts` 后缀。
3.  **驱动方式**:
    *   利用 JavaScript 的动态特性，在 DevTools Console 中访问全局单例 (如 `ConfigManager`, `LedgerService`)。
    *   通过脚本模拟用户行为（如调用 `runBatchAnalysis()`），而非直接调用底层函数。
4.  **数据验证**:
    *   不注入假数据 (Mock Data)。
    *   直接操作真实文件系统（或 Mock 文件系统），验证 `default.pixelbill.json` 的物理变更。

### 2. 边界异常测试 (Boundary Testing)
已通过 `src/scripts/test_boundaries.ts` 验证以下核心逻辑的健壮性：
- [x] **数据畸形恢复**: 模拟 JSON 字段缺失或类型错误时，Arbiter 能够安全降级到 Fallback 状态，不导致 Crash。
- [x] **高频并发一致性**: 模拟 1ms 内连续 5 次状态变更，验证时间戳最新的状态最终胜出。
- [x] **乱序到达防御**: 模拟网络延迟导致旧数据（Timestamp 小）晚于新数据到达，系统正确拒绝旧数据，保护最新状态。

### 3. UI/交互极端情况测试 (UI/UX Extreme Cases)
**[待执行]** 下一阶段需在真实设备或 E2E 环境中验证以下场景：
- **权限被拒 (Permission Denied)**: 
    - Android 端拒绝文件存储权限后，App 应弹出友好提示并禁用相关功能，而非崩溃。
- **文件被锁 (File Lock)**: 
    - 模拟文件正在被其他应用占用（或系统备份中）时的写入行为，验证 `fs-storage` 的重试机制。
- **UI 压力测试 (UI Stress)**:
    - **快速连击**: 在 1s 内连续点击分类标签 10 次，验证防抖 (Debounce) 逻辑是否只触发一次文件写入。
    - **大数据量渲染**: 导入 > 5000 条数据时，验证虚拟列表滚动流畅度及内存占用。
    - **长文件名/特殊字符**: 导入包含 Emoji 或超长文件名的 CSV，验证显示与存储是否正常。

---

Made with ❤️ by **CyberZen Studio**

License: MIT
