import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/index.js';
import { saveApiKey, listApiKeys, deleteApiKey } from '../auth/api-keys.js';

const router = Router();

router.use(requireAuth);

// Request body types
interface SaveApiKeyBody {
  apiKey: string;
}

// Valid API key providers
const VALID_PROVIDERS = ['anthropic', 'openai', 'kimi', 'opencode', 'google', 'mistral'] as const;
type ValidProvider = typeof VALID_PROVIDERS[number];

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

// ============================================
// SAVE API KEY
// ============================================
router.post('/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as string;
    const { apiKey } = req.body as SaveApiKeyBody;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider as ValidProvider)) {
      return res.status(400).json({ error: `Invalid provider. Valid: ${VALID_PROVIDERS.join(', ')}` });
    }

    const key = await saveApiKey(req.userId!, provider, apiKey);
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
