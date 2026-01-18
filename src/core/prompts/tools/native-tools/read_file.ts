import type OpenAI from "openai"

const READ_FILE_SUPPORTS_NOTE = `Supports text extraction from PDF and DOCX files, but may not handle other binary files properly.`

/**
 * Options for creating the read_file tool definition.
 */
export interface ReadFileToolOptions {
	/** Whether to include line_ranges parameter (default: true) */
	partialReadsEnabled?: boolean
	/** Maximum number of files that can be read in a single request (default: 5) */
	maxConcurrentFileReads?: number
}

/**
 * Creates the read_file tool definition, optionally including line_ranges support
 * based on whether partial reads are enabled.
 *
 * @param options - Configuration options for the tool
 * @returns Native tool definition for read_file
 */
export function createReadFileTool(options: ReadFileToolOptions = {}): OpenAI.Chat.ChatCompletionTool {
	const { partialReadsEnabled = true, maxConcurrentFileReads = 5 } = options
	const isMultipleReadsEnabled = maxConcurrentFileReads > 1

	// Build description intro with concurrent reads limit message
	const descriptionIntro = isMultipleReadsEnabled
		? `Request to read the contents of one or more files. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code. IMPORTANT: You can read a maximum of ${maxConcurrentFileReads} files in a single request. If you need to read more files, use multiple sequential read_file requests. `
		: `Request to read the contents of a file. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code. IMPORTANT: Multiple file reads are currently disabled. You can only read one file at a time. `

	const strategy = `
IMPORTANT: You MUST use this Efficient Reading Strategy:
- ${isMultipleReadsEnabled ? `You MUST read all related files and implementations together in a single operation (up to ${maxConcurrentFileReads} files at once)` : "You MUST read files one at a time, as multiple file reads are currently disabled"}
- You MUST obtain all necessary context before proceeding with changes
${
	partialReadsEnabled
		? `- You MUST use line_ranges to read specific portions of large files, rather than reading entire files when not needed
- You MUST combine adjacent line ranges (<10 lines apart)
- You MUST use multiple ranges for content separated by >10 lines
- You MUST include sufficient line context for planned modifications while keeping ranges minimal`
		: ""
}`

	const baseDescription =
		descriptionIntro +
		(partialReadsEnabled ? "Use line ranges to efficiently read specific portions of large files. " : "") +
		READ_FILE_SUPPORTS_NOTE +
		strategy +
		"\n\nExample single file: { files: [{ path: 'src/app.ts' }] }. " +
		(partialReadsEnabled
			? "Example with line ranges: { files: [{ path: 'src/app.ts', line_ranges: [[1, 50], [100, 150]] }] }. "
			: "") +
		(isMultipleReadsEnabled
			? `Example multiple files (within ${maxConcurrentFileReads}-file limit): { files: [{ path: 'file1.ts'${partialReadsEnabled ? ", line_ranges: [[1, 50]]" : ""} }, { path: 'file2.ts' }] }`
			: "")

	// Build the properties object conditionally
	const fileProperties: Record<string, any> = {
		path: {
			type: "string",
			description: "Path to the file to read, relative to the workspace",
		},
	}

	// Only include line_ranges if partial reads are enabled
	if (partialReadsEnabled) {
		fileProperties.line_ranges = {
			type: ["array", "null"],
			description:
				"Optional line ranges to read. Each range is a [start, end] tuple with 1-based inclusive line numbers. Use multiple ranges for non-contiguous sections.",
			items: {
				type: "array",
				items: { type: "integer" },
				minItems: 2,
				maxItems: 2,
			},
		}
	}

	// When using strict mode, ALL properties must be in the required array
	// Optional properties are handled by having type: ["...", "null"]
	const fileRequiredProperties = partialReadsEnabled ? ["path", "line_ranges"] : ["path"]

	return {
		type: "function",
		function: {
			name: "read_file",
			description: baseDescription,
			strict: true,
			parameters: {
				type: "object",
				properties: {
					files: {
						type: "array",
						description: "List of files to read; request related files together when allowed",
						items: {
							type: "object",
							properties: fileProperties,
							required: fileRequiredProperties,
							additionalProperties: false,
						},
						minItems: 1,
					},
				},
				required: ["files"],
				additionalProperties: false,
			},
		},
	} satisfies OpenAI.Chat.ChatCompletionTool
}

export const read_file = createReadFileTool({ partialReadsEnabled: false })
