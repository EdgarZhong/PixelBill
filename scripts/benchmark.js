import { webcrypto } from 'node:crypto';

// Polyfill for Node.js environment if global crypto is not available (though in Node 24 it should be)
const crypto = globalThis.crypto || webcrypto;

// The exact implementation from parser.ts
const generateId = async (str) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 取前 16 位 hex 足够了
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

// Simulation
const runBenchmark = async () => {
  const COUNT = 100000;
  console.log(`Starting benchmark for ${COUNT} items...`);
  
  // Generate dummy data
  const data = [];
  for (let i = 0; i < COUNT; i++) {
    data.push(`wx:2024-01-01 12:00:00|${Math.random() * 1000}|支出|Merchant${i}|Product${i}`);
  }
  
  console.log('Data generation complete. Hashing...');
  
  const start = performance.now();
  
  // Process sequentially as in the parser loop
  // Note: Promise.all would be faster but parser uses sequential await in loop
  // for (const item of data) {
  //   await generateId(item);
  // }

  // Parallel Execution
  console.log('Running in parallel (Promise.all)...');
  await Promise.all(data.map(item => generateId(item)));
  
  const end = performance.now();
  const totalMs = end - start;
  
  console.log(`\nResults:`);
  console.log(`Total time: ${totalMs.toFixed(2)} ms`);
  console.log(`Average per item: ${(totalMs / COUNT).toFixed(4)} ms`);
  console.log(`Items per second: ${(COUNT / (totalMs / 1000)).toFixed(0)}`);
};

runBenchmark();
