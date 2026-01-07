import type { TransactionBase } from '../../types/metadata';

export type ProposalSource = 'USER' | 'RULE_ENGINE' | 'AI_AGENT';

export interface Proposal {
  /**
   * 提案来源：
   * - USER: 用户手动指定（最高优先级）
   * - RULE_ENGINE: 正则/关键词规则匹配
   * - AI_AGENT: LLM 模型推理
   */
  source: ProposalSource;
  
  /**
   * 建议的分类名称
   */
  category?: string;
  
  /**
   * 推理理由（用于 AI 解释或规则名称）
   */
  reasoning?: string;
  
  /**
   * 置信度 (0.0 - 1.0)
   * 注意：目前仲裁策略仅基于优先级，暂不使用置信度进行加权
   */
  confidence: number;
  
  /**
   * 提案生成时间戳
   */
  timestamp: number;
}

export interface ICategoryPlugin {
  /**
   * 插件唯一标识名
   */
  name: string;
  
  /**
   * 插件版本
   */
  version: string;
  
  /**
   * 核心分析函数
   * @param transaction 原始交易数据
   * @returns 分类提案或 null (如果无法分类)
   */
  analyze(transaction: TransactionBase): Promise<Proposal | null>;
}
