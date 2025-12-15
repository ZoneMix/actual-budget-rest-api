import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { getActualApi } from '../services/actualApi.js';

const router = express.Router();
router.use(authenticateJWT);

router.get('/', async (req, res) => {
  try {
    const api = await getActualApi();
    await api.sync();
    const accounts = await api.getAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;