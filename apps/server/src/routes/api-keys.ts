import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/index.js';
import { saveApiKey, listApiKeys, deleteApiKey } from '../auth/api-keys.js';

const router = Router();

router.use(requireAuth);

// Request body types
interface SaveApiKeyBody {
  apiKey: string | Record<string, any>; // String for simple keys, object for complex credentials
}

// ============================================
// LIST API KEYS
// ============================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const keys = await listApiKeys(req.userId!);
    res.json({ keys });
  } catch (err) {
    console.error('[API-KEYS] List error:', err);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

/// ============================================
// SAVE API KEY
// ============================================
router.post('/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as string;
    const { apiKey } = req.body as SaveApiKeyBody;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key or credentials required' });
    }

    // Convert object credentials to JSON string for storage
    const keyToStore = typeof apiKey === 'string' ? apiKey : JSON.stringify(apiKey);

    // BYOK model: Allow any provider string
    // No validation needed - users can configure any provider they want

    const key = await saveApiKey(req.userId!, provider, keyToStore);
    res.json(key);
  } catch (err) {
    console.error('[API-KEYS] Save error:', err);
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// ============================================
// DELETE API KEY
// ============================================
router.delete('/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as string;
    await deleteApiKey(req.userId!, provider);
    res.json({ success: true });
  } catch (err) {
    console.error('[API-KEYS] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
