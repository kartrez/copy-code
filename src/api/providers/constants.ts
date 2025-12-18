import { X_KILOCODE_VERSION } from "../../shared/kilocode/headers"
import { Package } from "../../shared/package"

export const DEFAULT_HEADERS = {
	// DO NOT ADJUST HTTP-Referer, OpenRouter uses this as an identifier
	// This needs coordination with them if adjustment is needed
	"HTTP-Referer": "https://gpt-chat.by",
	"X-Title": "Copy Code",
	[X_KILOCODE_VERSION]: Package.version,
	"User-Agent": `Copy-Code/${Package.version}`,
}
