export type SourceType = 'wechat' | 'alipay';

export interface Transaction {
  id: string;           // 唯一标识 (MD5 or simple hash of content)
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

export interface DayActivity {
  date: string; // YYYY-MM-DD
  totalExpense: number;
  count: number;
}
