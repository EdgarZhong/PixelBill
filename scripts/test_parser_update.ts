
import { parseFiles } from '../src/utils/parser';
import { Transaction } from '../src/types';

// Mock File class if not available in Node.js environment (for testing)
class MockFile {
  name: string;
  content: string;

  constructor(name: string, content: string) {
    this.name = name;
    this.content = content;
  }

  async arrayBuffer() {
    const encoder = new TextEncoder();
    return encoder.encode(this.content).buffer;
  }
}

async function testParser() {
  console.log('Testing WeChat Parser...');
  const wechatContent = `微信支付账单明细,,,,,,,,
,,,,,,,,
,,,,,,,,
交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2023-10-01 12:00:00,餐饮,餐厅,午餐,支出,25.00,零钱,支付成功,10000001,M1001,好吃`;
  
  const wechatFile = new MockFile('wechat.csv', wechatContent) as unknown as File;
  const wechatResult = await parseFiles([wechatFile]);
  
  if (wechatResult.length > 0 && wechatResult[0].originalId === '10000001') {
    console.log('✅ WeChat Parser Success: originalId is 10000001');
  } else {
    console.error('❌ WeChat Parser Failed:', wechatResult[0]);
  }

  console.log('\nTesting Alipay Parser...');
  const alipayContent = `
电子客户回单,,,,,,,,
,,,,,,,,
交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注
2023-10-02 13:00:00,购物,超市,Store123,日用品,支出,50.00,余额宝,交易成功,20231002001,,买东西`;

  const alipayFile = new MockFile('alipay.csv', alipayContent) as unknown as File;
  const alipayResult = await parseFiles([alipayFile]);

  if (alipayResult.length > 0 && alipayResult[0].originalId === '20231002001') {
    console.log('✅ Alipay Parser Success: originalId is 20231002001');
  } else {
    console.error('❌ Alipay Parser Failed:', alipayResult[0]);
  }
}

testParser();
