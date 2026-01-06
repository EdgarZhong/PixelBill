# 极简像素风账单整合器设计文档 (PixelBill)

## 1. 项目概述
本项目是一个运行在本地的纯前端单页应用（SPA）个人记账应用，旨在安全、高效地整合微信和支付宝的账单流水 CSV 文件。项目采用 **"当代生成式点阵" (Contemporary Generative Dot Matrix)** 风格，去除多余装饰，强调数据的纯粹与美感。

PixelBill 奉行“生成式极简主义”与“赛博禅意”的设计哲学，采用 “当代生成式点阵” (Contemporary Generative Dot Matrix) 风格，旨在构建一个 冷静、理性、清晰、秩序感、像素美学的数字化金融终端 。

它摒弃一切多余装饰，利用 实体像素 （象征金钱/价值）与 虚空网格 （象征秩序/空间）的二元隐喻将抽象数据具象化；通过 固定深空背景 与 4秒呼吸光晕 营造出独特的 赛博禅意 (Cyber-Zen) ；让数据成为界面本身，利用 动态活跃度矩阵 与 心理账户点阵 ，将冰冷的流水重构为富有韵律的视觉秩序。

## 2. 视觉设计系统 (Visual Design System)

本章节定义了 PixelBill 的核心视觉语言，旨在构建一个精密、理性且富有生命力的数字金融终端界面。

### 2.1 核心设计哲学 (Design Philosophy)

*   **混合像素点阵 (Hybrid Pixel-Dot)**: 
    *   **Pixels (实体)**: 方形像素块象征确定的“金额”与“实体资产”。使用绿色像素块从隐喻层面与金钱挂钩。
    *   **Dots (虚空)**: 圆形点阵或网格象征“数据流”与“底层结构”。用于背景、装饰和非强调性信息。
*   **生成式极简主义 (Generative Minimalism)**: 界面元素并非静态堆砌，而是由数据驱动生成。活跃度矩阵、金额条形码等元素随数据的变化而呈现不同形态。
*   **非侵入式交互 (Non-intrusive Interaction)**: 摒弃弹窗和强引导，采用呼吸光效、微小的故障 (Glitch) 效果和透明度变化来提示状态。

### 2.2 栅格与布局 (Grid & Layout)

*   **Base Unit**: 4px。所有间距、尺寸均为 4px 的倍数。
*   **Layout Grid**: 12 列响应式栅格系统。
    *   Desktop: 最大宽度 1024px，居中显示。
    *   Mobile: 100% 宽度，两侧保留 24px padding。
*   **Fixed Background**: 背景采用固定定位 (`fixed inset-0`) 的点阵纹理，层级 `z-[-1]`，确保内容滚动时背景保持静止，营造深邃的“空间感”。
*   **Spacing**: 强调疏密有致。
    *   Tight: 4px / 8px (组件内部)
    *   Default: 16px / 24px (组件之间)
    *   Loose: 48px / 64px (区块之间)

### 2.3 字体排印 (Typography)

采用混合字体策略，以区分“数据阅读”与“品牌表达”。

*   **Display Font (标题/品牌)**: 
    *   **Pixel**: `Press Start 2P` - 用于 "PIXEL" 字样，传递复古计算感。
    *   **Grid Dot Matrix**: **自定义网格点阵实现** - 用于 "BILL" 字样。弃用字体渲染，改用 4x5 标准点阵网格构建字母，确保行列严格对齐。
    *   **视觉对齐**: "BILL" 点阵字样通过 `-translate-y-[2px]` 微调，确保与左侧 "PIXEL" 文字实现完美的光学对齐。
*   **Body/Data Font (正文/数据)**: 
    *   **Monospace**: `Space Mono`, `Microsoft YaHei Mono` - 用于所有金额、日期、正文。
    *   **特性**: 等宽字体确保了数据列表的纵向对齐，增强了“账单”的表格属性。

### 2.4 色彩系统 (Color System)

基于 Dark Mode 优先的设计，使用高对比度的荧光色点缀深色背景。

*   **Background (Canvas)**:
    *   `--bg-color`: `#09090b` (Zinc 950)
    *   `--card-bg`: `#111111` (卡片背景，微弱提升层级)
*   **Foreground (Content)**:
    *   `--text-primary`: `#e4e4e7` (Zinc 200)
    *   `--text-dim`: `#6b7280` (Gray 500，用于辅助信息)
*   **Semantic Colors (Functional)**:
    *   **Pixel Green**: `#10b981` (Emerald 500) - 仅用于品牌标识和 Logo 呼吸灯。
    *   **Alipay Blue**: `#0ea5e9` (Sky 500) - 支付宝支付、链接。
    *   **Expense Red**: `#ef4444` (Red 500) - 所有支出金额显示。
    *   **Income Yellow**: `#eab308` (Yellow 500) - 所有收入金额显示。

### 2.5 动效与交互 (Motion & Interaction)

*   **Breathing & Glow (呼吸与光晕)**: 
    *   **Cycle**: 4秒 (4s) 慢速呼吸周期，模拟电子设备的待机状态。
    *   **Text Glow**: 标题 "BILL" 采用 `drop-shadow` 动画，在 50% 透明度时收缩光晕，100% 时扩散光晕。
    *   **Box Glow**: Logo 像素块采用 `box-shadow` 动画，产生真实的“发光元件”质感。
*   **Glitch (故障)**: 在活跃度矩阵中引入极低概率的随机位移或透明度抖动，模拟老式显示器的信号不稳定感。
*   **Micro-interactions**:
    *   **Hover**: 列表项悬停时，左侧指示器旋转 45 度，边框高亮。
    *   **Load**: 数据加载时，使用类似终端打字机或数据流解码的动画。

### 2.6 核心组件规范 (Component Specifications)

#### A. Header (控制台)
*   **Logo**: 结合像素与点阵字体，左侧绿色像素块应用 `animate-box-glow` 动画。
*   **Title**: "PIXEL" 使用像素字体，"BILL" 使用自定义点阵组件并应用 `animate-text-glow` 绿色光晕。
*   **Subtitle**: "GENERATIVE FINANCIAL TRACKER" 左侧 padding 对齐 Logo 宽度，保持视觉整洁。
*   **Controls**: 按钮摒弃传统实体背景，采用“文本+前置像素块”的形式，Hover 时改变透明度。

#### B. Activity Matrix (活跃度矩阵)
*   **Visualization**: 14 天数据可视化。
*   **Data-Ink**: 每一列代表一天，由 20 个垂直排列的微型像素块组成。
*   **Intensity**: 
    *   高度：固定 20 格。
    *   激活数量：由 `Total Expense` 决定。
    *   透明度/颜色：当日无消费则微弱显示占位符，有消费则高亮。支持 Hover 查看详情。

#### C. Transaction List (流水清单)
*   **Row Style**: 极简条目，去除斑马纹，仅保留底部分割线或 margin。
*   **Indicator**: 
    *   **WeChat**: 3x3 绿色实心像素块。
    *   **Alipay**: 3x3 蓝色实心像素块。
*   **Amount Visualization**: **心理账户分级点阵 (Psychological Account Matrix)**。
    *   **问题解决**: 解决线性归一化导致小额交易（如 5元 vs 40元）无法区分的问题。
    *   **逻辑**: 采用符合生活经验的**非线性固定阈值**，确保不同量级的消费有稳定的视觉反馈。
    *   **分级标准**:
        *   **1 Dot**: ≤ 20 (琐碎/早餐/饮料)
        *   **2 Dots**: ≤ 100 (正餐/日用品/打车)
        *   **3 Dots**: ≤ 300 (聚餐/购物/超市)
        *   **4 Dots**: ≤ 2000 (轻奢/电子/大额)
        *   **5 Dots**: > 2000 (巨额/房租/理财)
    *   **视觉**: 保持 5 点阵列，使用 **像素方块**（非圆点）表示消费量级，**支出使用红色**，收入使用黄色。

## 3. 功能特性与交互流程 (Features & Interaction)

### 3.1 核心功能 (Core Features)

*   **F1. 智能数据导入 (Smart Import)**:
    *   **批量处理**: 支持一次性选择文件夹，系统自动递归读取其中所有 `.csv` 文件。
    *   **格式自适应**: 自动识别微信支付 (UTF-8) 和支付宝 (GBK) 账单格式，无需人工干预编码。
    *   **隐私安全**: 采用纯前端解析 (Local Parsing)，所有数据均在浏览器内存中处理，绝不上传服务器。

*   **F2. 生成式活跃度矩阵 (Generative Activity Matrix)**:
    *   **时间窗口**: 动态展示最近 14 天的消费热力。
    *   **数据映射**: 像素阵列的高度与透明度直接映射当日消费总额 (Total Expense)。
    *   **动态阈值**: 系统根据当前数据范围自动计算最大值 (Max Value)，动态调整可视化比例。

*   **F3. 智能交易分类 (Smart Categorization)**:
    *   **自动标记**: 内置关键词引擎（支持扩展），自动识别“餐饮”、“外卖”等消费场景并标记为 `[MEAL]`。
    *   **多维视图**: 提供 `ALL` (全部)、`MEAL` (正餐)、`OTHER` (非正餐) 三种视图，支持一键切换。

*   **F4. 极简数据清洗 (Data Sanitization)**:
    *   自动清洗金额字段中的特殊符号（如 `¥`、`,`）和异常字符。
    *   统一时间戳格式，默认按交易时间倒序排列。

### 3.2 交互设计 (Interaction Design)

*   **I1. 数据加载流 (Data Loading Flow)**:
    *   `[Action]`: 用户点击 `[LOAD DATA]` 按钮。
    *   `[System]`: 唤起操作系统原生文件选择器（支持多选/文件夹）。
    *   `[Feedback]`: 界面进入 `PROCESSING DATA STREAMS...` 状态，显示像素加载动画。
    *   `[Result]`: 数据解析完成，界面刷新，活跃度矩阵执行生长动画。

*   **I2. 视图与过滤 (View & Filtering)**:
    *   **视图切换**: 点击 `MEAL` 标签 -> 交易列表执行过滤 -> 顶部统计数据 (Total Expense) 实时重算 -> 活跃度矩阵重绘以反映筛选后的数据分布。
    *   **时间范围**: 修改 `FROM` / `TO` 日期 -> 系统实时过滤在此时间窗口之外的交易。

*   **I3. 微交互与反馈 (Micro-interactions)**:
    *   **Hover Matrix**: 鼠标悬停在矩阵某列 -> 浮现详细信息 Tooltip (日期/金额/笔数) -> 该列像素块高亮。
    *   **Hover Transaction**: 鼠标悬停在交易行 -> 左侧来源方块 (Source Pixel) 旋转 45° -> 背景色微弱发光 -> 增强行内信息的对比度。
    *   **Theme Toggle**: (目前锁定为 Dark Mode) 使用高对比度配色方案。
    *   **Date Range Picker**: 
        *   **Trigger**: 点击 Dashboard 顶部的 `DATA_RANGE` 区域触发（支持点击文字、箭头或下方条状区域）。
        *   **Style**: 非传统日历弹窗。采用**双滑块像素时间轴 (Dual-Slider Pixel Timeline)** 与 **原位展开编辑面板** 结合。
        *   **Interaction**: 
            *   **常态**: 紧凑的日期显示，下方仅有一条细微的进度条。
            *   **展开**: 也就是“生长”。面板从常态位置原位扩大，托举起日期数据，并平滑过渡到可编辑状态。
            *   **操作**: 支持拖拽滑块快速选择，也支持点击日期文字进行精确输入。

### 3.3 交互设计案例分析：二级面板 (Case Study: Secondary Panel)

本项目以 `DateRangePicker` 为例，定义了 PixelBill 的“二级面板”交互规范。

#### 1. 设计哲学：从“弹出”到“生长” (From Pop-up to Growth)
*   **拒绝突兀 (Anti-Modal)**: 传统的 UI 使用模态弹窗强行打断用户流。PixelBill 要求**同源性**——编辑面板不应是凭空跳出来的“异物”，而应当是原数据（日期文字）在受激（交互）后，自然**生长、舒展**而成的形态。
*   **秩序感 (Order)**: 动画过程必须维护 Grid（4px网格）对齐。
*   **光影隐喻 (Light Metaphor)**: 鼠标悬停时的微光、展开时的边框高光，都暗示了数据正在“被激活”。

#### 2. 动画基本原则
*   **同一性 (Identity)**: 屏幕上的像素变了，但逻辑上的组件不能变。不再销毁/创建组件，而是让组件在“紧凑”和“松散”两种状态间呼吸。
*   **空间锚定 (Spatial Anchoring)**: 运动物体以原数据中心为锚点，向两侧舒展。这给了用户一种“它还是它，只是变大了”的心理安全感。
*   **完全可逆 (Reversibility)**: 收起的动画必须是展开的**严格倒放**。能量耗尽后，物体应当沿原路回归平静。

#### 3. 实现策略
*   **状态驱动 (State-Driven)**: 使用 React State (`readOnly`) 配合 CSS transition 驱动样式变化，而非手动计算关键帧。
*   **布局投影的克制 (Layout Projection Control)**: 对于精密排版，**显式地控制尺寸和位置**（如明确指定 `width`, `left`）比交给自动布局引擎更稳健，消除“果冻效应”。
*   **分层交互 (Layered Interaction)**: 引入透明覆盖层 (`z-40 overlay`) 简化触发逻辑，将视觉层与交互层分离，提升容错率。

## 4. 数据结构 (Data Structure)

### 4.1 数据模型 (TypeScript Interface)
```typescript
type SourceType = 'wechat' | 'alipay';

interface Transaction {
  id: string;           // 唯一标识
  originalDate: Date;   // 原始时间对象
  timestamp: number;    // 时间戳
  type: SourceType;     // 来源
  category: string;     // 交易类型
  counterparty: string; // 交易对方
  product: string;      // 商品名称
  amount: number;       // 金额 (绝对值)
  direction: 'in' | 'out'; // 收支方向
  isMeal?: boolean;     // 是否为正餐
  raw: any;             // 原始CSV行数据
}
```

## 4. 版权信息
Footer 显示: `@edgarzhong 2026`
