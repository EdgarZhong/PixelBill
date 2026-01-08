/**
 * 自动化测试脚本：验证元数据更新触发 React 响应流和仲裁器
 * 
 * 使用方法：
 * 1. 确保项目正在运行 (npm run dev)
 * 2. 在浏览器打开项目并加载数据
 * 3. 打开浏览器控制台 (F12 -> Console)
 * 4. 复制并粘贴以下所有代码，然后回车运行
 */

(async function runTest() {
    console.group('🧪 [Test Script] Metadata Update Trigger');

    // 1. 检查环境
    if (!window.pixelDebug || !window.pixelDebug.ledgerMemory) {
        console.error('❌ Test Environment Not Ready. Please load data first.');
        console.groupEnd();
        return;
    }

    const { ledgerMemory, updateTransactionMetadata } = window.pixelDebug;
    const records = Object.values(ledgerMemory.records);
    
    // 2. 查找一个尚未标记为 'meal' 的 'others' 交易作为测试目标
    const target = records.find(t => 
        t.category === 'others' && 
        (!t.user_category || t.user_category !== 'meal')
    );

    if (!target) {
        console.warn('⚠️ No suitable target transaction found (all are already meal or verify).');
        console.groupEnd();
        return;
    }

    console.log('🎯 Target Found:', {
        id: target.id,
        counterparty: target.counterparty,
        currentCategory: target.category,
        currentUserCat: target.user_category
    });

    // 3. 执行更新
    console.log('🔄 Executing updateTransactionMetadata...');
    const startTime = performance.now();

    await updateTransactionMetadata(target.id, {
        user_category: 'meal',
        user_note: 'Script Automated Test ' + new Date().toISOString()
    });

    // 4. 验证结果 (由于 React 状态更新是异步的，我们稍作延迟或轮询)
    console.log('⏳ Waiting for React render cycle...');
    
    setTimeout(() => {
        // 重新获取最新状态
        const newMemory = window.pixelDebug.ledgerMemory;
        const updatedRecord = newMemory.records[target.id];
        const endTime = performance.now();

        // 验证内存状态
        const isMetaUpdated = updatedRecord.user_category === 'meal';
        
        // 验证仲裁结果 (通过 window.arbiter 验证，如果之前暴露了的话，或者通过 category 字段)
        // 注意：ledgerMemory 中的 category 字段通常是持久化的字段，
        // 但 App.tsx 中的 transactions 数组才是经过 Arbiter 实时计算的。
        // 由于我们无法直接访问 App 内部的 transactions 状态，
        // 我们主要验证元数据是否成功写入内存，这会触发 App 的重渲染。
        // 如果 App 重渲染，Arbiter 就会运行。
        // 我们之前添加的 console.log('[Arbiter Trace]...') 会在控制台证明这一点。

        console.log('📊 Result Verification:', {
            id: target.id,
            newUserCat: updatedRecord.user_category,
            timeTaken: (endTime - startTime).toFixed(2) + 'ms',
            success: isMetaUpdated
        });

        if (isMetaUpdated) {
            console.log('✅ TEST PASSED: Metadata updated successfully.');
            console.log('👉 Please check the console logs above for "[Arbiter Trace]" to verify the arbitration logic triggered.');
        } else {
            console.error('❌ TEST FAILED: Metadata did not update in ledgerMemory.');
        }
        console.groupEnd();
    }, 500); // 500ms should be enough for React render

})();
