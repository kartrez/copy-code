import type OpenAI from "openai"

const SEARCH_AND_REPLACE_DESCRIPTION = `Apply precise, targeted modifications to an existing file using search and replace operations. This tool is for surgical edits only; provide an array of operations where each operation specifies the exact text to search for and what to replace it with. The search text must exactly match the existing content, including whitespace and indentation.

Example: Surgical edit to a file
{ "path": "src/app.ts", "operations": [{ "search": "console.log('Hello');", "replace": "console.log('Hello, world!');" }] }`

const PATH_PARAMETER_DESCRIPTION = `The path of the file to modify, relative to the current workspace directory.`

const OPERATIONS_PARAMETER_DESCRIPTION = `Array of search and replace operations to perform on the file.`

const SEARCH_PARAMETER_DESCRIPTION = `The exact literal text to find in the file. Must match exactly, including whitespace and indentation.`

const REPLACE_PARAMETER_DESCRIPTION = `The text to replace the search text with.`

const search_and_replace = {
	type: "function",
	function: {
		name: "search_and_replace",
		description: SEARCH_AND_REPLACE_DESCRIPTION,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: PATH_PARAMETER_DESCRIPTION,
				},
				operations: {
					type: "array",
					description: OPERATIONS_PARAMETER_DESCRIPTION,
					items: {
						type: "object",
						properties: {
							search: {
								type: "string",
								description: SEARCH_PARAMETER_DESCRIPTION,
							},
							replace: {
								type: "string",
								description: REPLACE_PARAMETER_DESCRIPTION,
							},
						},
						required: ["search", "replace"],
					},
					minItems: 1,
				},
			},
			required: ["path", "operations"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

export default search_and_replace
