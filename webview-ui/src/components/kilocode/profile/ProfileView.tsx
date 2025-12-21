import React, { useEffect } from "react"
import { vscode } from "@/utils/vscode"
import {
	BalanceDataResponsePayload,
	ProfileData,
	ProfileDataResponsePayload,
	WebviewMessage,
} from "@roo/WebviewMessage"
import { VSCodeButtonLink } from "@/components/common/VSCodeButtonLink"
import { VSCodeButton, VSCodeDivider } from "@vscode/webview-ui-toolkit/react"
import CountUp from "react-countup"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Tab, TabContent, TabHeader } from "@src/components/common/Tab"
import { Button } from "@src/components/ui"
import KiloCodeAuth from "../common/KiloCodeAuth"

interface ProfileViewProps {
	onDone: () => void
}

const ProfileView: React.FC<ProfileViewProps> = ({ onDone }) => {
	const { apiConfiguration, currentApiConfigName} = useExtensionState()
	const { t } = useAppTranslation()
	const [profileData, setProfileData] = React.useState<ProfileData | undefined | null>(null)
	const [balance, setBalance] = React.useState<number | null>(null)
	const [isLoadingBalance, setIsLoadingBalance] = React.useState(true)
	const [isLoadingUser, setIsLoadingUser] = React.useState(true)

	useEffect(() => {
		vscode.postMessage({ type: "fetchProfileDataRequest" })
		vscode.postMessage({ type: "fetchBalanceDataRequest" })
	}, [apiConfiguration?.gptChatByApiKey, apiConfiguration?.gptChatProfileHasSubscription])

	useEffect(() => {
		const handleMessage = (event: MessageEvent<WebviewMessage>) => {
			const message = event.data
			if (message.type === "profileDataResponse") {
				const payload = message.payload as ProfileDataResponsePayload
				if (payload.success) {
					setProfileData(payload.data)
				} else {
					console.error("Error fetching profile data:", payload.error)
					setProfileData(null)
				}
				setIsLoadingUser(false)
			} else if (message.type === "balanceDataResponse") {
				const payload = message.payload as BalanceDataResponsePayload
				if (payload.success) {
					setBalance(payload.data?.balance || 0)
				} else {
					console.error("Error fetching balance data:", payload.error)
					setBalance(null)
				}
				setIsLoadingBalance(false)
			} else if (message.type === "updateProfileData") {
				vscode.postMessage({
					type: "fetchProfileDataRequest",
				})
				vscode.postMessage({
					type: "fetchBalanceDataRequest",
				})
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [profileData])

	const user = profileData?.telegram

	function handleLogout(): void {
		console.info("Logging out...", apiConfiguration)
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: currentApiConfigName,
			apiConfiguration: {
				...apiConfiguration,
				gptChatByApiKey: "",
				gptChatEnableLocalIndexing: false,
				gptChatProfileHasSubscription: false,
			},
		})
	}

	const creditPackages = [
		{
			credits: 10,
			gift: ''
		},
		{
			gift: '',
			credits: 25,
		},
		{
			credits: 50,
			gift: "1 мес. подписки"
		},
		{
			credits: 100,
			gift: "3 мес. подписки"
		},
	]

	const subscriptionPackages = [
		{
			credits: 0,
			period: 0,
			gift: 'Trial'
		},
		{
			credits: 5,
			period: 1,
			gift: ''
		},
		{
			credits: 48,
			period: 12,
			gift: "$5 на баланс"
		},
	]
	if (!profileData?.hasTrial) {
		subscriptionPackages.shift()
	}

	const handleBuyCredits = (credits: number, period?: number) => () => {
		vscode.postMessage({
			type: "shopBuyCredits",
			values: {
				credits: credits,
				period: period,
			},
		})
	}

	if (isLoadingUser) {
		return <>Loading Profile...</>
	}

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center">
				<h3 className="text-vscode-foreground m-0">{t("kilocode:profile.title")}</h3>
				<Button onClick={onDone}>{t("settings:common.done")}</Button>
			</TabHeader>
			<TabContent>
				<div className="h-full flex flex-col">
					<div className="flex-1">
						{user ? (
							<div className="flex flex-col pr-3 h-full">
								<div className="flex flex-col w-full">
									<div className="flex items-center mb-6 flex-wrap gap-y-4">
										<div className="flex flex-col flex-1">
											<div className="w-full flex flex-col items-center">
												Telegram ID: {user.id}
											</div>

											{user.firstname && (
												<h2 className="text-[var(--vscode-foreground)] m-0 mb-1 text-lg font-medium">
													{user.firstname}
												</h2>
											)}

											{user.lastname && (
												<div className="text-sm text-[var(--vscode-descriptionForeground)]">
													{user.lastname}
												</div>
											)}
										</div>
									</div>
								</div>

								<div className="w-full flex gap-2 flex-col min-[225px]:flex-row">
									<VSCodeButton
										appearance="secondary"
										onClick={handleLogout}
										className="w-full min-[225px]:w-1/2">
										{t("kilocode:profile.logOut")}
									</VSCodeButton>
								</div>

								<VSCodeDivider className="w-full my-6" />

								<div className="w-full flex flex-col items-center">
									<div className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
										{t("kilocode:profile.currentBalance")}
									</div>

									<div
										className="text-4xl font-bold text-[var(--vscode-foreground)] mb-6 flex items-center gap-2">
										{isLoadingBalance ? (
											<div className="text-[var(--vscode-descriptionForeground)]">
												{t("kilocode:profile.loading")}
											</div>
										) : (
											balance && (
												<>
													<span>$</span>
													<CountUp end={balance} duration={0.66} decimals={2} />
													<VSCodeButton
														appearance="icon"
														className="mt-1"
														onClick={() => {
															setIsLoadingBalance(true)
															vscode.postMessage({ type: "fetchBalanceDataRequest" })
															vscode.postMessage({ type: "fetchProfileDataRequest" })
														}}>
														<span className="codicon codicon-refresh"></span>
													</VSCodeButton>
												</>
											)
										)}
									</div>
									{profileData?.hasSubscription && (
										<div className="text-center">
											<div className="text-lg font-semibold text-[var(--vscode-foreground)] mb-4 text-center">
												{t("kilocode:profile.subcription.expiredAt")}: {profileData.subscriptionExpairedDate}
											</div>
										</div>
									)}

									{/* Buy Credits Section - Only show for personal accounts */}
									<div className="w-full mt-8">
										<div
											className="text-lg font-semibold text-[var(--vscode-foreground)] mb-4 text-center">
											{profileData?.hasSubscription ? t("kilocode:profile.subcription.title") : t("kilocode:profile.subcription.title")}
										</div>
										<div className="text-center">
											{t("kilocode:profile.subcription.access.title")}
											<ul>
												<li>{t("kilocode:profile.subcription.access.li_1")}</li>
												<li>{t("kilocode:profile.subcription.access.li_2")}</li>
												<li>{t("kilocode:profile.subcription.access.li_3")}</li>
											</ul>
										</div>

										<div className="grid grid-cols-1 min-[300px]:grid-cols-2 gap-3 mb-6">
											{subscriptionPackages.map((pkg) => (
												<div
													key={pkg.credits}
													className={`relative border rounded-lg p-4 bg-[var(--vscode-editor-background)] transition-all hover:shadow-md ${
														pkg.gift
															? "border-[var(--vscode-button-background)] ring-1 ring-[var(--vscode-button-background)]"
															: "border-[var(--vscode-input-border)]"
													}`}>
													{pkg.gift && (
														<div
															className="absolute -top-2 left-1/2 transform -translate-x-1/2">
																<span
																	className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-xs px-2 py-1 rounded-full font-medium">
																	<span className="codicon codicon-gift" style={{
																		position: "relative",
																		top: "3px"
																	}}></span>{pkg.gift}
																</span>
														</div>
													)}

													<div className="text-center">
														<div
															className="text-2xl font-bold text-[var(--vscode-foreground)] mb-1">
															${pkg.credits}
														</div>
														<div
															className="text-sm text-[var(--vscode-descriptionForeground)] mb-2">
															{t(`kilocode:profile.subcription.period_${pkg.period}`)}
														</div>
														<VSCodeButton
															appearance={pkg.gift ? "primary" : "secondary"}
															className="w-full"
															onClick={handleBuyCredits(pkg.credits, pkg.period)}>
															{t("kilocode:profile.shop.action")}
														</VSCodeButton>
													</div>
												</div>
											))}
										</div>
									</div>

									<div className="w-full mt-8">
										<div
											className="text-lg font-semibold text-[var(--vscode-foreground)] mb-4 text-center">
											{t("kilocode:profile.shop.title")}
										</div>

										<div className="grid grid-cols-1 min-[300px]:grid-cols-2 gap-3 mb-6">
											{creditPackages.map((pkg) => (
												<div
													key={pkg.credits}
													className={`relative border rounded-lg p-4 bg-[var(--vscode-editor-background)] transition-all hover:shadow-md ${
														pkg.gift
															? "border-[var(--vscode-button-background)] ring-1 ring-[var(--vscode-button-background)]"
															: "border-[var(--vscode-input-border)]"
													}`}>
													{pkg.gift && (
														<div
															className="absolute -top-2 left-1/2 transform -translate-x-1/2">
																<span
																	className="bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-xs px-2 py-1 rounded-full font-medium">
																	<span className="codicon codicon-gift" style={{ position: "relative", top: "3px" }}></span>{pkg.gift}
																</span>
														</div>
													)}

													<div className="text-center">
														<div
															className="text-2xl font-bold text-[var(--vscode-foreground)] mb-1">
															${pkg.credits}
														</div>
														<VSCodeButton
															appearance={pkg.gift ? "primary" : "secondary"}
															className="w-full"
															onClick={handleBuyCredits(pkg.credits)}>
															{t("kilocode:profile.shop.action")}
														</VSCodeButton>
													</div>
												</div>
											))}
										</div>

										<div className="text-center">
											<VSCodeButtonLink
												href="https://gpt-chat.by"
												appearance="secondary"
												className="text-sm">
												{t("kilocode:profile.shop.viewAll")}
											</VSCodeButtonLink>
										</div>
									</div>
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center pr-3">
								<KiloCodeAuth className="w-full" />
							</div>
						)}
					</div>
				</div>
			</TabContent>
		</Tab>
	)
}

export default ProfileView
