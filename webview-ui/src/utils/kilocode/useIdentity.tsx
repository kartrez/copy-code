import { useEffect, useState } from "react"
import { ProfileDataResponsePayload } from "@roo/WebviewMessage"
import { vscode } from "@/utils/vscode"

export function useIdentity(gptChatByApiKey: string, machineId: string) {
	const [Identity, setIdentity] = useState("")
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data.type === "profileDataResponse") {
				const payload = event.data.payload as ProfileDataResponsePayload | undefined
				const success = payload?.success || false
				const tokenFromMessage = payload?.data?.token || ""
				const tgId = payload?.data?.telegram?.id || ""
				if (!success) {
					console.error("KILOTEL: Failed to identify Kilo user, message doesn't indicate success:", payload)
				} else if (tokenFromMessage !== gptChatByApiKey) {
					console.error("KILOTEL: Failed to identify Kilo user, token mismatch:", payload)
				} else if (!tgId) {
					console.error("KILOTEL: Failed to identify Kilo user, email missing:", payload)
				} else {
					console.debug("KILOTEL: Kilo user identified:", tgId)
					setIdentity(tgId)
					window.removeEventListener("message", handleMessage)
				}
			}
		}

		if (gptChatByApiKey) {
			console.debug("KILOTEL: fetching profile...")
			window.addEventListener("message", handleMessage)
			vscode.postMessage({
				type: "fetchProfileDataRequest",
			})
		} else {
			console.debug("KILOTEL: no Kilo user")
			setIdentity("")
		}

		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [gptChatByApiKey])
	return Identity || machineId
}
