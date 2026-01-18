import { gptChatByDefaultModelId, gptChatByModels, NATIVE_TOOL_DEFAULTS } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { OpenAiHandler } from "./openai"

export class GptChatByHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.gptChatByApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? gptChatByDefaultModelId,
			openAiBaseUrl: "https://gpt-chat.by/api",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})
	}

	override getModel() {
		const id = (this.options.apiModelId as keyof typeof gptChatByModels) || gptChatByDefaultModelId
		const info = {
			...NATIVE_TOOL_DEFAULTS,
			...(gptChatByModels[id] || gptChatByModels[gptChatByDefaultModelId]),
		}
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	// Override to handle usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.prompt_tokens_details?.cache_miss_tokens,
			cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens,
		}
	}
}
