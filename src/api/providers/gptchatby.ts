import { gptChatByDefaultModelId, gptChatByModels, NATIVE_TOOL_DEFAULTS } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { OpenAiHandler } from "./openai"
import type { ApiHandlerCreateMessageMetadata } from "../index"

export class GptChatByHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.gptChatByApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? gptChatByDefaultModelId,
			openAiBaseUrl: "https://gpt-chat.by/api",
			openAiStreamingEnabled: true,
		})
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		if (metadata) {
			const { tool_choice, ...restMetadata } = metadata
			yield* super.createMessage(systemPrompt, messages, restMetadata)
		} else {
			yield* super.createMessage(systemPrompt, messages, metadata)
		}
	}

	override getModel() {
		const id = this.options.apiModelId ?? gptChatByDefaultModelId
		const info = {
			...NATIVE_TOOL_DEFAULTS,
			...(gptChatByModels[id as keyof typeof gptChatByModels] || gptChatByModels[gptChatByDefaultModelId]),
			supportsNativeTools: true,
		}
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	// Override to handle DeepSeek's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
		}
	}
}
