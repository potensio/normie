/**
 * Intent Detector
 *
 * Detects user intent from messages and suggests appropriate toolkits.
 * Uses keyword-based matching against known toolkit patterns.
 */

import {
  findToolkitByKeyword,
  findAllToolkitsByKeywords,
  type ToolkitKeywordMapping,
} from './toolkit-keywords.js';

export interface IntentDetectionResult {
  detected: boolean;
  toolkitSlug: string | null;
  toolkitName: string | null;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  mapping: ToolkitKeywordMapping | null;
}

export interface IntentDetectorConfig {
  /** Whether intent detection is enabled */
  enabled: boolean;
  /** Minimum confidence level to return a result */
  minConfidence: 'high' | 'medium' | 'low';
}

/**
 * Default configuration for intent detection.
 */
export const DEFAULT_INTENT_CONFIG: IntentDetectorConfig = {
  enabled: true,
  minConfidence: 'medium',
};

/**
 * Determine confidence level based on match characteristics.
 */
function determineConfidence(
  matchedKeywords: string[],
  message: string,
): 'high' | 'medium' | 'low' {
  const normalizedMessage = message.toLowerCase();

  // High confidence: multiple keywords OR exact phrase match
  if (matchedKeywords.length >= 2) {
    return 'high';
  }

  // Check for exact phrase match (keyword appears as standalone word/phrase)
  const keyword = matchedKeywords[0]?.toLowerCase() || '';
  const words = normalizedMessage.split(/\s+/);

  // High confidence if keyword is a full word match
  if (words.some((word) => word === keyword)) {
    return 'high';
  }

  // Medium confidence if the message is short and focused
  if (normalizedMessage.length < 50 && matchedKeywords.length === 1) {
    return 'medium';
  }

  // Low confidence for single keyword in longer message
  return 'low';
}

/**
 * Detect toolkit intent from a user message.
 *
 * Analyzes the message for keywords that indicate a specific toolkit
 * might be needed to fulfill the user's request.
 *
 * @param message - The user's message
 * @param config - Optional configuration for detection behavior
 * @returns Intent detection result, or null if no intent detected or below threshold
 */
export function detectToolkitIntent(
  message: string,
  config: Partial<IntentDetectorConfig> = {},
): IntentDetectionResult | null {
  const finalConfig: IntentDetectorConfig = {
    ...DEFAULT_INTENT_CONFIG,
    ...config,
  };

  if (!finalConfig.enabled) {
    return null;
  }

  // Find best matching toolkit
  const mapping = findToolkitByKeyword(message);

  if (!mapping) {
    return {
      detected: false,
      toolkitSlug: null,
      toolkitName: null,
      confidence: 'low',
      matchedKeywords: [],
      mapping: null,
    };
  }

  // Get all matched keywords for this toolkit
  const allMatches = findAllToolkitsByKeywords(message);
  const match = allMatches.find((m) => m.mapping.toolkitSlug === mapping.toolkitSlug);
  const matchedKeywords = match?.matchedKeywords || [];

  const confidence = determineConfidence(matchedKeywords, message);

  // Check against minimum confidence threshold
  const confidenceLevels = { low: 0, medium: 1, high: 2 };
  if (
    confidenceLevels[confidence] < confidenceLevels[finalConfig.minConfidence]
  ) {
    return null;
  }

  return {
    detected: true,
    toolkitSlug: mapping.toolkitSlug,
    toolkitName: mapping.toolkitName,
    confidence,
    matchedKeywords,
    mapping,
  };
}

/**
 * Detect all toolkit intents from a message.
 *
 * Returns all detected toolkits, useful when multiple integrations
 * might be relevant.
 *
 * @param message - The user's message
 * @param config - Optional configuration
 * @returns Array of intent detection results
 */
export function detectAllToolkitIntents(
  message: string,
  config: Partial<IntentDetectorConfig> = {},
): IntentDetectionResult[] {
  const finalConfig: IntentDetectorConfig = {
    ...DEFAULT_INTENT_CONFIG,
    ...config,
  };

  if (!finalConfig.enabled) {
    return [];
  }

  const allMatches = findAllToolkitsByKeywords(message);
  const results: IntentDetectionResult[] = [];

  for (const { mapping, matchedKeywords } of allMatches) {
    const confidence = determineConfidence(matchedKeywords, message);

    // Check against minimum confidence threshold
    const confidenceLevels = { low: 0, medium: 1, high: 2 };
    if (
      confidenceLevels[confidence] < confidenceLevels[finalConfig.minConfidence]
    ) {
      continue;
    }

    results.push({
      detected: true,
      toolkitSlug: mapping.toolkitSlug,
      toolkitName: mapping.toolkitName,
      confidence,
      matchedKeywords,
      mapping,
    });
  }

  // Sort by confidence (high first), then by match count
  results.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    }
    return b.matchedKeywords.length - a.matchedKeywords.length;
  });

  return results;
}

/**
 * Check if a message suggests a specific toolkit action.
 *
 * This is a simpler check that just returns true/false without
 * detailed analysis, useful for quick filtering.
 *
 * @param message - The user's message
 * @param toolkitSlug - The toolkit to check for
 * @returns True if the message contains keywords for the toolkit
 */
export function messageSuggestsToolkit(
  message: string,
  toolkitSlug: string,
): boolean {
  const normalizedMessage = message.toLowerCase();

  const mapping = findToolkitByKeyword(message);
  return mapping?.toolkitSlug === toolkitSlug;
}