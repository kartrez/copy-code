import type OpenAI from "openai"

const BROWSER_ACTION_DESCRIPTION = `Request to interact with a Puppeteer-controlled browser. Every action, except "close", will be responded to with a screenshot of the browser's current state, along with any new console logs. You may only perform one browser action per message, and wait for the user's response including a screenshot and logs to determine the next action.

This tool is particularly useful for web development tasks as it allows you to launch a browser, navigate to pages, interact with elements through clicks and keyboard input, and capture the results through screenshots and console logs. Use it at key stages of web development tasks - such as after implementing new features, making substantial changes, when troubleshooting issues, or to verify the result of your work. Analyze the provided screenshots to ensure correct rendering or identify errors, and review console logs for runtime issues.

The user may ask generic non-development tasks (such as "what's the latest news" or "look up the weather"), in which case you might use this tool to complete the task if it makes sense to do so, rather than trying to create a website or using curl to answer the question. However, if an available MCP server tool or resource can be used instead, you should prefer to use it over browser_action.

Browser Session Lifecycle:
- Browser sessions start with "launch" and end with "close"
- The session remains active across multiple messages and tool uses
- You can use other tools while the browser session is active - it will stay open in the background

Action Details:
- launch: Launch a new Puppeteer-controlled browser instance at the specified URL. This must always be the first action. Ensure the URL is valid and includes the appropriate protocol (e.g. http://localhost:3000/page, file:///path/to/file.html, etc.).
- click: Click at a specific x,y coordinate. Always click in the center of an element based on coordinates derived from a screenshot.
- hover: Move the cursor to a specific x,y coordinate. Always move to the center of an element based on coordinates derived from a screenshot.
- type: Type a string of text on the keyboard. You might use this after clicking on a text field to input text.
- press: Press a single keyboard key or key combination (e.g., "Enter", "Tab", "Escape", "Cmd+K", "Shift+Enter"). Supported modifiers: "Cmd/Command/Meta", "Ctrl/Control", "Shift", "Alt/Option".
- resize: Resize the viewport to a specific widthxheight size.
- scroll_down: Scroll down the page by one page height.
- scroll_up: Scroll up the page by one page height.
- screenshot: Take a screenshot and save it to a file. Path is relative to the workspace. Supported formats: .png, .jpeg, .webp.
- close: Close the Puppeteer-controlled browser instance. This must always be the final browser action.

Example: Launching a browser
{ "action": "launch", "url": "https://example.com" }

Example: Clicking with coordinates
{ "action": "click", "coordinate": "450,300@1024x768" }`

const ACTION_PARAMETER_DESCRIPTION = `Browser action to perform.`

const URL_PARAMETER_DESCRIPTION = `URL to open when performing the "launch" action; must include protocol.`

const COORDINATE_PARAMETER_DESCRIPTION = `Screen coordinate for hover or click actions in format "x,y@WIDTHxHEIGHT" where x,y is the target position on the screenshot image and WIDTHxHEIGHT is the exact pixel dimensions of the screenshot image (not the browser viewport). Example: "450,203@900x600" means click at (450,203) on a 900x600 screenshot. The coordinates will be automatically scaled to match the actual viewport dimensions.`

const SIZE_PARAMETER_DESCRIPTION = `Viewport dimensions for the "resize" action in format "WIDTHxHEIGHT" or "WIDTH,HEIGHT". Example: "1280x800" or "1280,800".`

const TEXT_PARAMETER_DESCRIPTION = `Text to type when performing the "type" action, or key name/combination to press when performing the "press" action (e.g., "Enter", "Tab", "Escape", "Cmd+K", "Shift+Enter").`

const PATH_PARAMETER_DESCRIPTION = `File path where the screenshot should be saved (relative to workspace). Required for "screenshot" action. Supports .png, .jpeg, and .webp extensions. Example: "screenshots/result.png".`

export default {
	type: "function",
	function: {
		name: "browser_action",
		description: BROWSER_ACTION_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: ACTION_PARAMETER_DESCRIPTION,
					enum: [
						"launch",
						"click",
						"hover",
						"type",
						"press",
						"scroll_down",
						"scroll_up",
						"resize",
						"close",
						"screenshot",
					],
				},
				url: {
					type: ["string", "null"],
					description: URL_PARAMETER_DESCRIPTION,
				},
				coordinate: {
					type: ["string", "null"],
					description: COORDINATE_PARAMETER_DESCRIPTION,
				},
				size: {
					type: ["string", "null"],
					description: SIZE_PARAMETER_DESCRIPTION,
				},
				text: {
					type: ["string", "null"],
					description: TEXT_PARAMETER_DESCRIPTION,
				},
				path: {
					type: ["string", "null"],
					description: PATH_PARAMETER_DESCRIPTION,
				},
			},
			required: ["action"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
