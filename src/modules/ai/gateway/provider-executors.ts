import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  MediaAnalysisRequest,
  MediaAnalysisResult,
  TextGenerationRequest,
  TextGenerationResult,
  VideoGenerationRequest,
  VideoGenerationResult,
} from "@/modules/providers/interfaces";
import type { AICapability } from "./types";

export interface TextCallResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface ProviderExecutor {
  readonly providerId: string;
  isConfigured(): boolean;
  generateText?(
    req: TextGenerationRequest,
    model: string
  ): Promise<TextGenerationResult & { model: string; latencyMs: number }>;
  reason?(
    req: TextGenerationRequest,
    model: string
  ): Promise<TextGenerationResult & { model: string; latencyMs: number }>;
  analyzeImage?(
    req: MediaAnalysisRequest,
    model: string
  ): Promise<MediaAnalysisResult & { model: string; latencyMs: number }>;
  generateImage?(
    req: ImageGenerationRequest,
    model: string
  ): Promise<ImageGenerationResult & { model: string; latencyMs: number }>;
  generateVideo?(
    req: VideoGenerationRequest,
    model: string
  ): Promise<VideoGenerationResult & { model: string; latencyMs: number }>;
  supports?(capability: AICapability): boolean;
}

const executors = new Map<string, ProviderExecutor>();

export function registerProviderExecutor(executor: ProviderExecutor) {
  executors.set(executor.providerId, executor);
}

export function getProviderExecutor(
  providerId: string
): ProviderExecutor | undefined {
  return executors.get(providerId);
}

export function listProviderExecutors(): ProviderExecutor[] {
  return [...executors.values()];
}
