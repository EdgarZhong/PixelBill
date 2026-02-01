import { CategoryPlugin } from './CategoryPlugin';
import type { Proposal, Transaction } from './types';

/**
 * 远程 AI 插件接口 (Remote AI Plugin Interface)
 * 职责：定义与远程 AI 引擎（如 LLM 服务）交互的标准接口。
 * 注意：此类目前仅定义接口结构，具体实现需对接实际 API。
 */
export class AIPlugin extends CategoryPlugin {
  name = 'AIPlugin';
  version = '0.1.0';

  /**
   * 批量分析接口 (Batch Analysis)
   * 远程 AI 通常采用批量处理以优化 Token 和网络开销。
   */
  async analyzeBatch(transactions: Transaction[]): Promise<Proposal[]> {
    // TODO: Implement actual API call to Remote LLM
    // Example logic:
    // 1. Filter transactions needing classification
    // 2. Construct prompt with Few-Shot examples
    // 3. Call FetchClient (Infrastructure Layer)
    // 4. Parse response and map to Proposals
    
    return [];
  }

  /**
   * 单条分析接口 (Single Analysis)
   * 兼容 CategoryPlugin 基类定义，但推荐使用 analyzeBatch。
   */
  async analyze(transaction: Transaction): Promise<Proposal | null> {
    // In efficient implementation, this might buffer requests or verify cache first.
    return null;
  }
}
