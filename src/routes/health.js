import express from 'express';
import { getActualApi } from '../services/actualApi.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const api = await getActualApi().catch(() => null);

  res.json({
    status: 'ok'
  });
});

export default router;