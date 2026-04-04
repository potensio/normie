import OpenAI from 'openai';

// Singleton OpenAI client
let openai: OpenAI | null = null;
let embeddingsEnabled: boolean = false;

/**
 * Get or create the OpenAI client for embeddings
 */
function getClient(): OpenAI | null {
  if (!openai) {
    const apiKey = process.env.OPENAI_EMBEDDING_KEY;
    if (!apiKey || apiKey === 'your-openai-embedding-key') {
      console.warn('[EMBEDDINGS] OPENAI_EMBEDDING_KEY not set. Memory search will use text fallback.');
      return null;
    }
    openai = new OpenAI({ apiKey });
    embeddingsEnabled = true;
  }
  return openai;
}

/**
 * Check if embeddings are available
 */
export function isEmbeddingsEnabled(): boolean {
  return embeddingsEnabled || (process.env.OPENAI_EMBEDDING_KEY !== undefined && 
    process.env.OPENAI_EMBEDDING_KEY !== 'your-openai-embedding-key');
}

/**
 * Generate embedding for text using OpenAI text-embedding-3-small
 * @param text - Text to embed
 * @returns Embedding vector or null if unavailable
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;
  
  try {
    // Truncate to ~8000 tokens (roughly 32000 chars for most text)
    const truncatedText = text.slice(0, 32000);
    
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedText,
      dimensions: 1536
    });
    
    return response.data[0].embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMBEDDINGS] Failed to generate embedding:', message);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  const client = getClient();
  if (!client) return texts.map(() => null);
  
  try {
    // Truncate each text
    const truncatedTexts = texts.map(t => t.slice(0, 32000));
    
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedTexts,
      dimensions: 1536
    });
    
    return response.data.map(d => d.embedding);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EMBEDDINGS] Failed to generate embeddings:', message);
    return texts.map(() => null);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score (0-1)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
