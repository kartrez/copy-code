import { gptChatByDefaultModelId, gptChatByModels, NATIVE_TOOL_DEFAULTS, GPT_CHAT_BY_DEFAULT_TEMPERATURE } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import crypto from "crypto"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { normalizeMistralToolCallId } from "../transform/mistral-format"
import { XmlMatcher } from "../../utils/xml-matcher"
import { handleOpenAIError } from "./utils/openai-error-handler"

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

	/**
	 * Генерирует надежный 9-символьный алфавитно-цифровой ID для tool_call
	 */
	private generateToolCallId(): string {
		const buffer = crypto.randomBytes(6)
		const id = buffer.toString('base64url')
			.replace(/[^a-zA-Z0-9]/g, '')
			.slice(0, 9)
			.toLowerCase()
		return id.padEnd(9, '0').slice(0, 9)
	}

	/**
	 * Обрабатывает сообщения, гарантируя наличие tool_call_id для всех tool сообщений
	 */
	private processMessagesForToolCalls(
		messages: OpenAI.Chat.ChatCompletionMessageParam[]
	): OpenAI.Chat.ChatCompletionMessageParam[] {
		const processedMessages = [...messages]
		const toolCallMap = new Map<string, string>()

		// Сначала обрабатываем assistant сообщения с tool_calls
		for (let i = 0; i < processedMessages.length; i++) {
			const msg = processedMessages[i]

			if (msg.role === "assistant" && 'tool_calls' in msg && msg.tool_calls) {
				for (const toolCall of msg.tool_calls) {
					if (!toolCall.id || toolCall.id.trim() === "") {
						const newId = this.generateToolCallId()
						;(toolCall as any).id = newId

						if ((toolCall as any).function?.name) {
							toolCallMap.set((toolCall as any).function.name, newId)
						}
					} else {
						const normalizedId = normalizeMistralToolCallId(toolCall.id)
						;(toolCall as any).id = normalizedId

						if ((toolCall as any).function?.name) {
							toolCallMap.set((toolCall as any).function.name, normalizedId)
						}
					}
				}
			}
		}

		// Затем обрабатываем tool сообщения
		for (let i = 0; i < processedMessages.length; i++) {
			const msg = processedMessages[i]

			if (msg.role === "tool") {
				const toolMsg = msg as any

				if (!toolMsg.tool_call_id || toolMsg.tool_call_id.trim() === "") {
					if (toolMsg.name && toolCallMap.has(toolMsg.name)) {
						toolMsg.tool_call_id = toolCallMap.get(toolMsg.name)
					} else {
						toolMsg.tool_call_id = this.generateToolCallId()
					}
				} else {
					toolMsg.tool_call_id = normalizeMistralToolCallId(toolMsg.tool_call_id)
				}
			}
		}

		return processedMessages
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { info: modelInfo, reasoning } = this.getModel()
		const modelId = this.options.apiModelId ?? gptChatByDefaultModelId

		// Конвертируем сообщения в формат OpenAI
		const openAiMessages = convertToOpenAiMessages(messages, {
			modelInfo,
			mergeToolResultText: true,
			normalizeToolCallId: normalizeMistralToolCallId,
		})

		// Формируем финальные сообщения для отправки
		const messagesToSend: OpenAI.Chat.ChatCompletionMessageParam[] = [{
			role: "system",
			content: systemPrompt,
		}]

		messagesToSend.push(...openAiMessages)

		// Надежная обработка tool calls
		const processedMessages = this.processMessagesForToolCalls(messagesToSend)

		// Подготовка параметров tools с возможностью выбора режима
		const toolsParams = metadata?.tools ? {
			tools: this.convertToolsForOpenAI(metadata.tools),
			...(metadata.tool_choice && metadata.tool_choice !== "auto" && {
				tool_choice: metadata.tool_choice === 'none' ? 'none' :
					metadata.tool_choice
			}),
			parallel_tool_calls: metadata?.parallelToolCalls ?? false,
		} : {}

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			temperature: this.options.modelTemperature ?? GPT_CHAT_BY_DEFAULT_TEMPERATURE,
			messages: processedMessages,
			stream: true as const,
			stream_options: { include_usage: true },
			...(reasoning && reasoning),
			...toolsParams, // Включаем все параметры tools если они есть
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)

		let stream
		try {
			stream = await this.client.chat.completions.create(requestOptions)
		} catch (error) {
			if (error instanceof Error && (error as any).status === 400) {
				console.error('GptChatBy request failed with messages:', JSON.stringify(processedMessages, null, 2))
				console.error('Request options:', JSON.stringify(requestOptions, null, 2))
			}
			throw handleOpenAIError(error, "GptChatBy")
		}

		const matcher = new XmlMatcher(
			"think",
			(chunk) =>
				({
					type: chunk.matched ? "reasoning" : "text",
					text: chunk.data,
				}) as const,
		)

		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta ?? {}

			if (delta.content) {
				for (const chunk of matcher.update(delta.content)) {
					yield chunk as any
				}
			}

			if (delta.tool_calls) {
				for (const toolCall of delta.tool_calls) {
					if (toolCall.function?.arguments) {
						const id = toolCall.id
							? normalizeMistralToolCallId(toolCall.id)
							: this.generateToolCallId()

						yield {
							type: "tool_call_partial",
							index: toolCall.index,
							id,
							name: toolCall.function.name,
							arguments: toolCall.function.arguments,
						} as any
					}
				}
			}

			if (chunk.usage) {
				yield this.processUsageMetrics(chunk.usage)
			}
		}

		for (const chunk of matcher.final()) {
			yield chunk as any
		}
	}

	override getModel() {
		const id = this.options.apiModelId ?? gptChatByDefaultModelId
		const info = {
			...NATIVE_TOOL_DEFAULTS,
			...(gptChatByModels[id as keyof typeof gptChatByModels] || gptChatByModels[gptChatByDefaultModelId]),
			supportsNativeTools: true,
			toolCallIdFormat: "alphanumeric-9" as const,
		}
		const params = getModelParams({
			format: "openai",
			modelId: id,
			model: info,
			settings: this.options
		})
		return { id, info, ...params }
	}

	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			// totalTokens is not present in ApiStreamUsageChunk
		}
	}
}