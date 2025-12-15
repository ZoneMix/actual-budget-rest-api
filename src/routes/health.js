import express from 'express';
import { getDb } from '../db/authDb.js';
import { getActualApi } from '../services/actualApi.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const db = getDb();
  const activeUsers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active = 1').get().c;

  const api = await getActualApi().catch(() => null);

  res.json({
    status: 'ok'
  });
});

export default router;