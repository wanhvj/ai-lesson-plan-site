import express from 'express';
const app = express();
app.use(express.json());
import { aiRouter } from './src/routes/ai';
console.log('aiRouter stack:', (aiRouter as any)?.stack?.length);
(aiRouter as any)?.stack?.forEach((r: any) => {
  if (r.route) console.log('ROUTE:', r.route.path, Object.keys(r.route.methods));
});
app.use('/api', aiRouter);
app.listen(7002, () => {
  console.log('test server on 7002');
  setTimeout(async () => {
    try {
      const r = await fetch('http://localhost:7002/api/ai/auto-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      console.log('Status:', r.status);
      const txt = await r.text();
      console.log('Body:', txt.slice(0, 200));
    } catch (e: any) {
      console.log('Error:', e.message);
    }
    process.exit(0);
  }, 500);
});
