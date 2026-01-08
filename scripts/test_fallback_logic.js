
// 自动化测试脚本：验证仲裁器 Fallback 逻辑
// 用法：在浏览器控制台粘贴运行，或者通过 node 环境（如果环境支持）
// 这里假设在浏览器控制台运行，因为需要访问 window.pixelDebug

(async () => {
    console.group('🧪 Testing Arbiter Fallback Logic');
    
    if (!window.pixelDebug) {
        console.error('❌ window.pixelDebug not found. Please run this in the browser console while the app is running.');
        console.groupEnd();
        return;
    }

    const { updateTransactionMetadata, ledgerMemory } = window.pixelDebug;
    const targetId = Object.keys(ledgerMemory.records)[0]; // Pick first record
    
    if (!targetId) {
        console.error('❌ No records found in ledgerMemory.');
        console.groupEnd();
        return;
    }

    console.log(`🎯 Target Transaction ID: ${targetId}`);

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper to get current category from App state logic
    // 注意：ledgerMemory 里的 category 是上次同步的结果，React 的状态更新可能有一点延迟
    // 我们通过检查 ledgerMemory 来验证反向同步是否发生
    const getCategory = () => window.pixelDebug.ledgerMemory.records[targetId]?.category;

    try {
        // --- Step 1: Set to 'meal' ---
        console.log('🔹 Step 1: Setting user_category to "meal"...');
        await updateTransactionMetadata(targetId, { user_category: 'meal', user_note: 'Test Step 1' });
        await wait(1000); // Wait for React render & Arbiter & Sync
        
        let cat1 = getCategory();
        if (cat1 !== 'meal') throw new Error(`Step 1 Failed: Expected 'meal', got '${cat1}'`);
        console.log('✅ Step 1 Passed: Category is "meal"');

        // --- Step 2: Clear user_category (Should Keep 'meal') ---
        console.log('🔹 Step 2: Clearing user_category (Expect keeping "meal")...');
        await updateTransactionMetadata(targetId, { user_category: '', user_note: 'Test Step 2: Cleared' });
        await wait(1000);

        let cat2 = getCategory();
        if (cat2 !== 'meal') throw new Error(`Step 2 Failed: Expected 'meal' (fallback), got '${cat2}'`);
        console.log('✅ Step 2 Passed: Category kept as "meal" (Fallback working)');

        // --- Step 3: Set to 'others' (Should Change) ---
        console.log('🔹 Step 3: Setting user_category to "others"...');
        await updateTransactionMetadata(targetId, { user_category: 'others', user_note: 'Test Step 3' });
        await wait(1000);

        let cat3 = getCategory();
        if (cat3 !== 'others') throw new Error(`Step 3 Failed: Expected 'others', got '${cat3}'`);
        console.log('✅ Step 3 Passed: Category changed to "others"');

        console.log('🎉 ALL TESTS PASSED!');

    } catch (err) {
        console.error('❌ TEST FAILED:', err.message);
    } finally {
        // Cleanup: Restore empty
        await updateTransactionMetadata(targetId, { user_category: '', user_note: 'Test Finished' });
        console.groupEnd();
    }
})();
