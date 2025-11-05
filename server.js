require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");

// Добавляем fetch для Node.js < 18
if (typeof fetch === "undefined") {
	global.fetch = require("node-fetch");
}

const app = express();

// Configure CORS with more detailed options
app.use(
	cors({
		origin: "*", // Allow all origins
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: ["Content-Type"],
	})
);
app.use(bodyParser.json());

const token = process.env.TG_BOT_API_KEY;
const urlCom = "https://t.me/+ur3meeF_bOo1ZGRi";
const photoPath = "./images/spaceImage.webp";
const botUsername = "NebulaHuntBot"; // Add your bot username
const myAppName = "myapp";

// Определяем режим работы бота
const isProduction =
	process.env.NODE_ENV === "production" && process.env.BOT_WEBHOOK_URL;

// Initialize Telegram bot
// В production НЕ используем polling, чтобы webhook работал
const botOptions = {};
if (!isProduction) {
	botOptions.polling = true; // Polling только в dev mode
}

const bot = new TelegramBot(token, botOptions);

// 🔐 Настройка webhook URL для платежей (только в продакшене)
if (isProduction) {
	const webhookUrl = `${process.env.BOT_WEBHOOK_URL}/webhook/telegram-payment`;
	const webhookOptions = {
		drop_pending_updates: true, // Удалить старые обновления при старте
	};

	// Добавляем секретный токен если он установлен
	if (process.env.WEBHOOK_SECRET_TOKEN) {
		webhookOptions.secret_token = process.env.WEBHOOK_SECRET_TOKEN;
		console.log("🔐 Webhook secret token configured");
	}

	// Используем прямой API вызов через fetch (библиотека не поддерживает setWebhook без polling)
	fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			url: webhookUrl,
			...webhookOptions,
		}),
	})
		.then((response) => response.json())
		.then((data) => {
			if (data.ok) {
				console.log(`✅ Webhook URL set: ${webhookUrl}`);
				console.log("🔐 Production mode: using webhook for payments");
			} else {
				console.error(`❌ Failed to set webhook: ${data.description}`);
			}
		})
		.catch((error) => {
			console.error(`❌ Failed to set webhook: ${error.message}`);
		});
} else {
	console.log("🧪 Development mode: using polling for payments");
}

// 🔐 Обработчики событий для Telegram платежей
bot.on("pre_checkout_query", async (query) => {
	try {
		console.log("🔐 Pre-checkout query received:", query);

		// Проверяем данные платежа
		const payload = JSON.parse(query.invoice_payload);
		console.log("🔐 Payment payload:", payload);

		// Проверяем тип платежа и валидность
		if (payload.type && payload.price && payload.price > 0) {
			// Отвечаем Telegram'у - разрешаем платеж
			await bot.answerPreCheckoutQuery(query.id, true);
			console.log("✅ Pre-checkout approved for:", payload.type);
		} else {
			// Отклоняем платеж если данные некорректны
			await bot.answerPreCheckoutQuery(
				query.id,
				false,
				"Invalid payment data"
			);
			console.log("❌ Pre-checkout rejected - invalid data");
		}
	} catch (error) {
		console.error("❌ Pre-checkout error:", error);
		await bot.answerPreCheckoutQuery(
			query.id,
			false,
			"Payment validation failed"
		);
	}
});

bot.on("successful_payment", async (msg) => {
	try {
		const payment = msg.successful_payment;
		const user = msg.from;

		console.log("🎉 Successful payment received:", {
			payment,
			user,
			chatId: msg.chat.id,
		});

		// Парсим payload для получения данных о платеже
		const payload = JSON.parse(payment.invoice_payload);
		console.log("🔐 Payment payload:", payload);

		// Отправляем уведомление пользователю
		const successMessage = `🎉 Payment successful!\n\n💰 Amount: ${payment.total_amount} ${payment.currency}\n📦 Item: ${payload.type}\n\nYour purchase has been processed successfully!`;

		await bot.sendMessage(msg.chat.id, successMessage);

		// TODO: Здесь нужно обработать платеж и обновить БД
		// Вызвать соответствующий API для завершения операции
		// Например: POST /api/game/complete-payment
	} catch (error) {
		console.error("❌ Payment processing error:", error);
	}
});

bot.on("message", async (msg) => {
	const chatId = msg.chat.id;
	const text = msg.text;
	const userLanguage = msg.from?.language_code || "en";

	// Prepare captions for different languages
	const captions = {
		en: `Welcome to Nebula Hunt! 🚀\n\nYou are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap "Open game!" to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`,
		ru: `Добро пожаловать в Nebula Hunt! 🚀\n\nВы готовы отправиться в путешествие по неизведанным уголкам вселенной.\n\nСканируйте глубокий космос, открывайте древние планеты и создавайте своё галактическое наследие.\n\n🌌 Нажмите "Открыть игру!", чтобы начать миссию.\n\n🪐 Редкие миры ждут. Некоторые... могут даже изменить всё.\n\nУдачи, Первопроходец. Звёзды наблюдают за вами.`,
	};

	// Prepare button text for different languages
	const buttonTexts = {
		en: {
			openGame: "🪐 Open game!",
			joinCommunity: "Join community!",
		},
		ru: {
			openGame: "🪐 Открыть игру!",
			joinCommunity: "Присоединиться к сообществу!",
		},
	};

	// Get the appropriate caption and button texts based on user language
	const caption = captions[userLanguage] || captions.en;
	const buttonText = buttonTexts[userLanguage] || buttonTexts.en;

	// Prepare referral messages for different languages
	const referralMessages = {
		en: {
			invitedUser:
				"🎁 You were invited by a friend! Open the game to receive your welcome bonus of 5,000 Stardust and 10 Dark Matter!",
			referrer:
				"🎉 Great news! Someone joined using your referral link. You have received a reward of 5,000 Stardust and 10 Dark Matter!",
		},
		ru: {
			invitedUser:
				"🎁 Вас пригласил друг! Откройте игру, чтобы получить приветственный бонус в размере 5,000 Звездной пыли и 10 Темной материи!",
			referrer:
				"🎉 Отличные новости! Кто-то присоединился по вашей реферальной ссылке. Вы получили награду: 5,000 звездной пыли и 10 темной материи!",
		},
	};

	if (text && text.startsWith("/start")) {
		try {
			// Check if this is a referral link
			const args = text.split(" ");
			let startParam = "ABC";
			let isReferral = false;
			let referrerId = null;

			if (args.length > 1) {
				startParam = args[1];
				// Check if it's a referral code
				if (startParam.startsWith("ref_")) {
					isReferral = true;
					referrerId = startParam.substring(4);
					console.log(
						`Referral detected! User ${chatId} was referred by ${referrerId}. User language: ${userLanguage}`
					);

					// Here you would store this referral in your database
					// For this example, we'll just log it
				}
			}

			const webAppUrl = `https://t.me/${botUsername}/${myAppName}?startapp=${startParam}`;

			// Send welcome message
			await bot.sendPhoto(chatId, photoPath, {
				caption: caption,
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: buttonText.openGame,
								url: webAppUrl,
							},
						],
						[{ text: buttonText.joinCommunity, url: urlCom }],
					],
				},
			});

			// If this was a referral, send additional messages
			if (isReferral) {
				// Get appropriate message based on user language
				const invitedUserMessage =
					referralMessages[userLanguage]?.invitedUser ||
					referralMessages.en.invitedUser;

				await bot.sendMessage(chatId, invitedUserMessage);

				// Notify the referrer if possible
				try {
					// For the referrer, we don't know their language, so we'll use English for now
					// In a real app, you'd look up the referrer's language preference from a database
					const referrerMessage = referralMessages.en.referrer;

					await bot.sendMessage(referrerId, referrerMessage, {
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: buttonTexts.en.openGame,
										url: `https://t.me/${botUsername}/${myAppName}`,
									},
								],
							],
						},
					});
					console.log(
						`Sent referral notification to referrer ${referrerId}`
					);
				} catch (referrerError) {
					console.log(
						`Could not notify referrer ${referrerId}: ${referrerError.message}`
					);
				}
			}
		} catch (error) {
			console.error("Error sending start message:", error);
			// Fallback error message in user's language
			const errorMessages = {
				en: "Welcome to Nebula Hunt! Please try opening the game again.",
				ru: "Добро пожаловать в Nebula Hunt! Пожалуйста, попробуйте открыть игру снова.",
			};

			const errorMessage = errorMessages[userLanguage] || errorMessages.en;
			await bot.sendMessage(chatId, errorMessage);
		}
	}
});

// Store items
const storeItems = [
	{
		id: 1,
		name: "Space Explorer Pack",
		description: "Unlock special space exploration features",
		stars: 100,
		image: "🚀",
	},
	{
		id: 2,
		name: "Cosmic Boost",
		description: "Temporary speed boost for your spaceship",
		stars: 50,
		image: "⚡",
	},
	{
		id: 3,
		name: "Galactic Weapon",
		description: "Powerful weapon for space battles",
		stars: 200,
		image: "��",
	},
	{
		id: 4,
		name: "VIP Explorer",
		description: "VIP status with exclusive benefits",
		stars: 150,
		image: "👑",
	},
];

// Get store items with invoice links
app.get("/api/store-items", async (req, res) => {
	try {
		const itemsWithInvoiceLinks = await Promise.all(
			storeItems.map(async (item) => {
				try {
					const invoiceLink = await bot.createInvoiceLink(
						item.name, // title
						item.description, // description
						"{}", // payload - must be empty for Stars
						"", // provider_token - must be empty for Stars
						"XTR", // currency - must be XTR for Stars
						[{ amount: item.stars, label: `${item.stars} Stars` }] // prices
					);
					return {
						...item,
						invoiceLink,
					};
				} catch (error) {
					console.error(
						`Error creating invoice link for item ${item.id}:`,
						error
					);
					return {
						...item,
						error: "Failed to create invoice link",
					};
				}
			})
		);

		res.json({ success: true, items: itemsWithInvoiceLinks });
	} catch (error) {
		console.error("Error getting store items:", error);
		res.status(500).json({
			success: false,
			error: error.message,
		});
	}
});

// API endpoint to create payment
app.post("/api/create-payment", async (req, res) => {
	try {
		const { amount, description, title, paymentType, galaxySeed } = req.body;

		// Validate amount
		if (!amount || amount < 1 || amount > 100000) {
			return res.status(400).json({
				success: false,
				error: "Invalid amount. Must be between 1 and 100,000 stars.",
			});
		}

		console.log("Creating invoice with data:", {
			amount,
			title,
			description,
			paymentType,
		});

		// Determine appropriate title and description for the invoice
		let invoiceTitle = title || "Buy Stars";
		let invoiceDescription =
			description || `Purchase ${amount} stars to expand your galaxy`;

		// Set more detailed descriptions based on payment type
		if (paymentType === "buyStardust") {
			invoiceTitle = "Buy Stardust";
			invoiceDescription = `Purchase ${amount} Telegram Stars to get Stardust in Nebula Hunt. Stardust is used to create new stars in your galaxies.`;
		} else if (paymentType === "captureGalaxy") {
			invoiceTitle = "Capture Galaxy";
			invoiceDescription = `Purchase ${amount} Telegram Stars to capture a galaxy with ${galaxySeed} stars. Once captured, the galaxy will be permanently owned by you.`;
		} else if (paymentType === "darkMatter") {
			invoiceTitle = "Buy Dark Matter";
			invoiceDescription = `Purchase ${amount} Telegram Stars to get Dark Matter in Nebula Hunt. Dark Matter is a premium resource used for rare upgrades.`;
		} else if (paymentType === "galaxyUpgrade") {
			invoiceTitle = "Galaxy Upgrade";
			invoiceDescription = `Purchase ${amount} Telegram Stars to upgrade your galaxy. This will permanently enhance your galaxy with custom features.`;
		}

		// Create invoice link for Telegram Stars payment
		const invoiceLink = await bot.createInvoiceLink(
			invoiceTitle,
			invoiceDescription, // Improved description
			"{}", // payload - must be empty for Stars
			"", // provider_token - must be empty for Stars
			"XTR", // currency - must be XTR for Stars
			[
				{
					amount: amount,
					label: `${amount} ${amount === 1 ? "Star" : "Stars"}`,
				},
			] // prices
		);

		console.log("Invoice link created successfully:", invoiceLink);
		res.json({ success: true, invoiceLink });
	} catch (error) {
		console.error("Error creating payment:", {
			message: error.message,
			stack: error.stack,
			response: error.response?.data,
		});
		res.status(500).json({
			success: false,
			error: "Failed to create payment. Please try again.",
			details: error.response?.data || "No additional details available",
		});
	}
});

// Create a new API endpoint to verify and process referrals
app.post("/api/process-referral", async (req, res) => {
	try {
		const { userId, referrerId, language } = req.body;

		// Проверяем, что оба ID предоставлены
		if (!userId || !referrerId) {
			return res.status(400).json({
				success: false,
				error: "Both user ID and referrer ID are required",
			});
		}

		console.log(
			`Processing referral: User ${userId} was referred by ${referrerId}, language: ${
				language || "en"
			}`
		);

		// Определяем язык пользователя (по умолчанию английский)
		const userLanguage = language || "en";

		// В реальном приложении здесь должна быть проверка, не получил ли уже пользователь награду
		// Например, проверка в базе данных
		// Для примера мы создадим заглушку, которая будет имитировать эту проверку

		// Создаем сообщение для реферрера (того, кто пригласил) с учетом языка
		let referrerMessage = "";
		let buttonText = "";

		if (userLanguage === "ru") {
			// Русская версия сообщения
			referrerMessage =
				"🎉 Отличные новости! Кто-то присоединился по вашей реферальной ссылке. Вы получили награду: 5,000 звездной пыли и 10 темной материи!";
			buttonText = "🪐 Открыть игру";
		} else {
			// Английская версия сообщения (по умолчанию)
			referrerMessage =
				"🎉 Great news! Someone joined using your referral link. You have received a reward of 5,000 Stardust and 10 Dark Matter!";
			buttonText = "🪐 Open Game";
		}

		// Отправляем сообщение реферреру
		try {
			await bot.sendMessage(referrerId, referrerMessage, {
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: buttonText,
								url: `https://t.me/${botUsername}/${myAppName}`,
							},
						],
					],
				},
			});
			console.log(
				`Sent referral reward notification to referrer ${referrerId} in ${userLanguage}`
			);
		} catch (referrerError) {
			console.log(
				`Could not notify referrer ${referrerId}: ${referrerError.message}`
			);
			// Продолжаем выполнение даже если сообщение не отправилось
		}

		// Возвращаем информацию о награде для обоих пользователей
		res.json({
			success: true,
			message: "Referral processed successfully",
			rewards: {
				invitedUser: {
					stardust: 5000,
					darkMatter: 10,
				},
				referrer: {
					stardust: 5000,
					darkMatter: 10,
				},
			},
		});
	} catch (error) {
		console.error("Error processing referral:", error);
		res.status(500).json({
			success: false,
			error: "Failed to process referral",
			details: error.message,
		});
	}
});

// API endpoint для проверки наличия реферальных наград
app.post("/api/check-referral-rewards", async (req, res) => {
	try {
		const { userId, language, processedReferrals } = req.body;

		// Проверяем, что ID пользователя предоставлен
		if (!userId) {
			return res.status(400).json({
				success: false,
				error: "User ID is required",
			});
		}

		console.log(
			`Checking referral rewards for user ${userId}, language: ${
				language || "en"
			}`
		);

		// В реальном приложении здесь должна быть проверка в базе данных
		// на наличие рефералов, которые еще не получили награду

		// Получаем список уже обработанных рефералов пользователя
		// Это нужно для предотвращения повторного получения наград
		const userProcessedReferrals = processedReferrals || [];

		// Для демонстрационных целей, давайте случайно решим, есть ли награды
		// В реальном приложении здесь будет логика проверки в базе данных
		// В 20% случаев будем возвращать наличие наград (для тестирования)
		const hasRewards = Math.random() < 0.2;

		if (hasRewards) {
			// Для примера создаем фиктивный ID реферала
			const newReferrerId = `test_referral_${Date.now()}`;

			// Проверяем, что этот реферал еще не был обработан
			if (!userProcessedReferrals.includes(newReferrerId)) {
				// Если наличие наград подтверждено, возвращаем информацию о них
				res.json({
					success: true,
					hasRewards: true,
					rewards: {
						stardust: 5000,
						darkMatter: 10,
					},
					referrals: [newReferrerId],
					message: "New referral reward is available",
				});

				return;
			}
		}

		// Если наград нет, или все уже обработаны, возвращаем соответствующий ответ
		res.json({
			success: true,
			hasRewards: false,
			rewards: {
				stardust: 0,
				darkMatter: 0,
			},
			referrals: [],
			message: "No new referral rewards available",
		});
	} catch (error) {
		console.error("Error checking referral rewards:", error);
		res.status(500).json({
			success: false,
			error: "Failed to check referral rewards",
			details: error.message,
		});
	}
});

// API endpoint для отправки уведомлений о заполненном сборе ресурсов
app.post("/api/send-collection-notification", async (req, res) => {
	try {
		const { userId, stardustAmount, darkMatterAmount, language } = req.body;

		// Проверяем, что ID пользователя предоставлен
		if (!userId) {
			return res.status(400).json({
				success: false,
				error: "User ID is required",
			});
		}

		// Определяем язык сообщения (по умолчанию английский)
		const userLanguage = language || "en";

		// Формируем текст сообщения на основе языка и количества ресурсов
		let messageText = "";
		let buttonText = "";

		if (userLanguage === "ru") {
			// Русская версия сообщения
			messageText = "🌟 Ваше хранилище ресурсов заполнено и готово к сбору!";

			// Добавляем информацию о доступных ресурсах
			if (stardustAmount && stardustAmount > 0) {
				messageText += `\n\n✨ Звездная пыль: ${stardustAmount.toLocaleString(
					"ru-RU"
				)}`;
			}

			if (darkMatterAmount && darkMatterAmount > 0) {
				messageText += `\n\n🌑 Темная материя: ${darkMatterAmount.toLocaleString(
					"ru-RU"
				)}`;
			}

			messageText += "\n\nЗайдите в игру, чтобы собрать ваши ресурсы!";
			buttonText = "🪐 Открыть игру";
		} else {
			// Английская версия сообщения
			messageText = "🌟 Your resource storage is full and ready to collect!";

			// Добавляем информацию о доступных ресурсах
			if (stardustAmount && stardustAmount > 0) {
				messageText += `\n\n✨ Stardust: ${stardustAmount.toLocaleString(
					"en-US"
				)}`;
			}

			if (darkMatterAmount && darkMatterAmount > 0) {
				messageText += `\n\n🌑 Dark Matter: ${darkMatterAmount.toLocaleString(
					"en-US"
				)}`;
			}

			messageText += "\n\nOpen the game to collect your resources!";
			buttonText = "🪐 Open Game";
		}

		// Создаем кнопку для быстрого перехода в игру
		const webAppUrl = `https://t.me/${botUsername}/${myAppName}`;

		// Отправляем сообщение пользователю через бот
		await bot.sendMessage(userId, messageText, {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: buttonText,
							url: webAppUrl,
						},
					],
				],
			},
		});

		console.log(
			`Sent collection notification to user ${userId} in ${userLanguage}`
		);

		// Возвращаем успешный ответ
		res.json({
			success: true,
			message: "Notification sent successfully",
		});
	} catch (error) {
		console.error("Error sending collection notification:", error);
		res.status(500).json({
			success: false,
			error: "Failed to send notification",
			details: error.message,
		});
	}
});

// Handle OPTIONS requests for CORS
app.options("*", cors());

// 🔐 Webhook для Telegram платежей
app.post(
	"/webhook/telegram-payment",
	express.raw({ type: "application/json" }),
	async (req, res) => {
		try {
			console.log("🔐 Webhook received from IP:", req.ip);

			// Проверка секретного токена (если установлен)
			const secretToken = req.headers["x-telegram-bot-api-secret-token"];
			if (
				process.env.WEBHOOK_SECRET_TOKEN &&
				secretToken !== process.env.WEBHOOK_SECRET_TOKEN
			) {
				console.error("❌ Invalid webhook secret token");
				return res.sendStatus(403);
			}

			const update = JSON.parse(req.body);

			if (update.pre_checkout_query) {
				// Обработка pre-checkout
				console.log("🔐 Pre-checkout query:", update.pre_checkout_query);

				try {
					// Проверяем данные платежа
					const payload = JSON.parse(
						update.pre_checkout_query.invoice_payload
					);
					console.log("🔐 Payment payload:", payload);

					// Отвечаем Telegram'у - разрешаем платеж
					await bot.answerPreCheckoutQuery(
						update.pre_checkout_query.id,
						true
					);
					console.log("✅ Pre-checkout approved");
				} catch (error) {
					console.error("❌ Pre-checkout error:", error);
					await bot.answerPreCheckoutQuery(
						update.pre_checkout_query.id,
						false,
						"Invalid payment data"
					);
				}
			}

			if (update.message && update.message.successful_payment) {
				// Обработка успешного платежа
				const payment = update.message.successful_payment;
				const user = update.message.from;

				console.log("🎉 Successful payment received:", {
					payment,
					user,
					chatId: update.message.chat.id,
				});

				try {
					// Парсим payload для получения данных о платеже
					const payload = JSON.parse(payment.invoice_payload);
					console.log("🔐 Payment payload:", payload);

					// Вызываем API для завершения платежа
					try {
						const apiResponse = await fetch(
							`${
								process.env.API_BASE_URL || "http://localhost:5000"
							}/api/game/complete-payment`,
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									payment,
									payload,
									user,
								}),
							}
						);

						if (apiResponse.ok) {
							const result = await apiResponse.json();
							console.log("✅ Payment completed via API:", result);

							// Отправляем уведомление пользователю об успешном завершении
							const successMessage = `🎉 Payment processed successfully!\n\n📦 Item: ${payload.type}\n💰 Amount: ${payment.total_amount} ${payment.currency}\n\nYour purchase has been completed and resources have been added to your account.`;
							await bot.sendMessage(
								update.message.chat.id,
								successMessage
							);
						} else {
							console.error(
								"❌ API call failed:",
								apiResponse.status,
								apiResponse.statusText
							);

							// Отправляем уведомление об ошибке
							const errorMessage = `⚠️ Payment processing failed\n\nWe received your payment but encountered an error while processing it. Please contact support with your payment ID: ${payment.telegram_payment_charge_id}`;
							await bot.sendMessage(
								update.message.chat.id,
								errorMessage
							);
						}
					} catch (apiError) {
						console.error("❌ API call error:", apiError);

						// Отправляем уведомление об ошибке
						const errorMessage = `⚠️ Payment processing failed\n\nWe received your payment but encountered an error while processing it. Please contact support with your payment ID: ${payment.telegram_payment_charge_id}`;
						await bot.sendMessage(update.message.chat.id, errorMessage);
					}
				} catch (error) {
					console.error("❌ Payment processing error:", error);
				}
			} // Закрывающая скобка для successful_payment

			res.sendStatus(200);
		} catch (error) {
			console.error("❌ Webhook error:", error);
			res.sendStatus(500);
		}
	}
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

// Lightweight health check endpoint for load balancers and uptime checks
app.get("/health", (req, res) => {
	res.status(200).send("ok");
});

// Export the Express API
module.exports = app;
