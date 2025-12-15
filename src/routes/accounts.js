import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { getAccounts } from '../services/actualApi.js';

const router = express.Router();
router.use(authenticateJWT);

// GET /accounts – just await getAccounts()
router.get('/', async (req, res) => {
  try {
    const accounts = await getAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;