import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { analyzeRouter } from './routes/analyze';
import { generateRouter } from './routes/generate';
import { aiRouter } from './routes/ai';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', analyzeRouter);
app.use('/api', generateRouter);
app.use('/api', aiRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'lesson-plan-server' });
});

const clientDistPath = path.resolve(__dirname, '../../web/client/dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');

if (fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(clientIndexPath);
  });
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 7001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
});
