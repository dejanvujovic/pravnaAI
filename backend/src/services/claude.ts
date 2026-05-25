/**
 * Tanak wrapper oko Anthropic SDK-a.
 *
 * - Lazy inicijalizacija klijenta: ANTHROPIC_API_KEY se čita tek pri
 *   prvom pozivu, da bi backend mogao da krene bez ključa (npr. samo
 *   ingest tok bez Q&A).
 * - Centralizovan model name iz config.ts (config.anthropic.model).
 */

import Anthropic from "@anthropic-ai/sdk";
import { config, getAnthropicApiKey } from "../config.js";

let cached: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: getAnthropicApiKey() });
  }
  return cached;
}

export const CLAUDE_MODEL = config.anthropic.model;
