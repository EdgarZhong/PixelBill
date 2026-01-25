# PixelBill 账单管理系统

![PixelBill](./public/icon.svg)

**PixelBill** 是一个奉行“生成式极简主义”与“赛博禅意”设计哲学的个人记账应用。它运行在本地，采用 **"当代生成式点阵" (Contemporary Generative Dot Matrix)** 风格，旨在安全、高效地整合微信和支付宝的账单流水。

> 冷静、理性、清晰、秩序感、像素美学。

## ✨ 核心特性

*   **本地优先 (Local-First)**: 基于 File System Access API 实现，数据完全存储在用户本地的 JSON 文件中，无服务器交互，隐私绝对安全。
*   **智能导入**: 自动识别并解析微信支付 (UTF-8) 和支付宝 (GBK) 的 CSV 账单文件，无需手动转码。
*   **生成式可视化**:
    *   **活跃度矩阵**: 动态展示最近 14 天的消费热力，像素高度与透明度随消费额动态生成。
    *   **心理账户点阵**: 使用非线性的 5 级像素点阵来直观呈现金额量级，而非枯燥的数字。
*   **多信源仲裁系统 (Arbiter)**: 
    *   内置强大的分类仲裁器，支持多插件协作。
    *   **UserMetaPlugin**: 最高优先级，实时响应并持久化用户的分类操作。
    *   **LocalAIMetaPlugin**: 读取本地 AI 预处理数据参与仲裁。（暂时）
    *   **AIPlugin**: 调用 AI 模型（如 GPT-4o）进行分类建议。（待实现，一个微型Agent，能够基于反馈和账单上下文不断改进分类经验，提高个性化分类准确率）
    *   **RegexRulePlugin**: 基于正则表达式的规则匹配插件（可以由专业用户自行扩展开发）。
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

### 数据流与仲裁器 (The Arbiter)

PixelBill 的核心是一个基于优先级的仲裁系统，用于决定每一笔交易最终展示的分类。

1.  **Ingest**: 导入 CSV 流水，转换为标准化的 `TransactionBase` 对象。
2.  **Arbiter**: 遍历交易，并行询问所有注册插件。
3.  **Plugins**:
    *   `UserMetaPlugin`: 检查 `*.pixelbill.json` 中是否有用户手动标记的记录 (Priority: HIGH)。
    *   `LocalAIMetaPlugin`: 检查元数据中是否有 AI 预填充的建议 (Priority: MEDIUM)。
    *   `RegexRulePlugin` (Disabled): 正则规则匹配 (Priority: LOW)。
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
    *   [ ] AI 插件实装 (对接 LLM API 或完善离线清洗脚本)。
    *   [ ] UI 优化：添加元数据编辑入口与分类仲裁的可视化反馈。

## 📅 7日冲刺计划 (7-Day Sprint Plan)

**前提**: 基础 Capacitor 环境已同步 (`npx cap sync`)，Android 工程可编译。

### 🛠️ Phase 1: 核心功能与 AI 开发 (Day 1-5)

*   **Day 1: Android 文件系统适配 (File System Adapter)**
    *   **目标**: 彻底打通移动端读写本地文件的能力。
    *   [ ] **核心重构**: 重构 `src/utils/fs-storage.ts`，区分 Web 环境 (File System Access API) 与 Native 环境 (Capacitor Filesystem)。
    *   [ ] **权限逻辑**: 实现 Android 运行时权限申请 (Runtime Permission Request)，处理存储权限拒绝的边界情况。
    *   [ ] **数据验证**: 在 Android 真机上验证 CSV 文件的读取、解析与元数据写入稳定性。

*   **Day 2: 移动端交互重构 (Mobile UX/UI)**
    *   **目标**: 让应用拥有原生 App 的触感与视觉体验。
    *   [ ] **视口适配**: 适配刘海屏、灵动岛与底部手势条 (`SafeArea`)，防止内容遮挡。
    *   [ ] **手势系统**: 实现列表项的左滑/右滑手势（支持归档、删除或快速标记分类）。
    *   [ ] **触感反馈**: 集成 Haptics 插件，在仲裁成功、切换视图等关键操作加入细腻的震动反馈。

*   **Day 3: AI 插件基础设施 (AI Infrastructure)**
    *   **目标**: 建立 AI 参与账单分类的底层通道。
    *   [ ] **插件架构**: 开发 `src/core/plugin/AIPlugin.ts`，实现标准的 `ArbiterPlugin` 接口。
    *   [ ] **API 对接**: 集成 LLM API (OpenAI/DeepSeek)，封装网络请求，处理超时与鉴权。
    *   [ ] **Prompt 初版**: 设计用于解析中文账单描述的基础 System Prompt，确立输出 JSON 格式。

*   **Day 4: AI 智能优化与闭环 (AI Intelligence)**
    *   **目标**: 提升 AI 准确率，构建“越用越聪明”的反馈循环。
    *   [ ] **Prompt 调优**: 针对支付宝/微信的特殊字段（如“扫二维码付款-给XXX”）优化 Prompt，精准提取商户实体。
    *   [ ] **学习机制**: 实现 User-in-the-loop 反馈，将用户的手动修正记录为 Few-shot 样本，存入本地元数据供 AI 下次参考。
    *   [ ] **离线兜底**: 完善 `LocalAIMetaPlugin`，确保在弱网/无网状态下也能基于历史数据进行分类。

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

## 📋 工作交接 (Handover Notes)

*   **当前状态**:
    *   Web 版核心功能稳定。
    *   Capacitor 环境已初始化，Android 平台已添加。
    *   为了通过构建，暂时注释了 `App.tsx` 中的部分未使用函数 (`verifyTransaction`, `unverifyTransaction`)，后续开发需根据需要恢复。
*   **下一步立即行动**:
    *   执行 `npx cap sync` 确保 Web 资产同步到 Android 项目。
    *   在 Android Studio 中打开 `android` 目录，尝试首次真机运行。
*   **注意事项**:
    *   Android 文件读写权限是最大的技术风险点，需优先攻克。
    *   **AI 准备**: 需提前准备好 LLM API Key，并考虑在移动端不稳定的网络环境下 AI 请求的超时与重试机制。
    *   保持代码风格的统一性，遵循 `DESIGN.md` 中的极简主义原则。

## 🎨 设计细节

详细设计文档请参阅 [DESIGN.md](docs/DESIGN.md)。

*   **视觉风格**: 赛博禅意 (Cyber-Zen)，使用深空背景与呼吸光效。
*   **交互原则**: 非侵入式交互，拒绝弹窗，强调数据本身的韵律。
*   **字体**: 混合使用 `Press Start 2P` (标题) 与 `Space Mono` (数据)。

---

Made with ❤️ by **CyberZen Studio**

License: MIT
