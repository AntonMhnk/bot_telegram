require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const axios = require("axios");

// Добавляем fetch для Node.js < 18
if (typeof fetch === "undefined") {
	global.fetch = require("node-fetch");
}

const app = express();

// Configure CORS with explicit options
app.use(
	cors({
		origin: function (origin, callback) {
			// Allow requests with no origin (like server-to-server)
			if (!origin) {
				return callback(null, true);
			}
			// Allow all origins for now (bot is server-side)
			callback(null, true);
		},
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "x-telegram-init-data"],
		credentials: true,
		maxAge: 86400,
		preflightContinue: false,
		optionsSuccessStatus: 204,
	})
);
app.use(bodyParser.json());

// Configure multer for file uploads (memory storage)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
	},
	fileFilter: (req, file, cb) => {
		// Accept only image files
		if (file.mimetype.startsWith("image/")) {
			cb(null, true);
		} else {
			cb(new Error("Only image files are allowed"), false);
		}
	},
});

const token = process.env.TG_BOT_API_KEY;
const urlCom = "https://t.me/+ur3meeF_bOo1ZGRi";
const photoPath = "./images/IMG_8695.webp";
const botUsername = "NebulaHuntBot"; // Add your bot username
const myAppName = "myapp";

// Helper function to sanitize secret for HTTP headers
// Removes all control characters and invalid header characters
// Note: HTTP headers should ideally contain only ASCII characters
function sanitizeHeaderValue(value) {
	if (!value) return "";
	let sanitized = String(value)
		.trim()
		.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")
		.replace(/[\r\n]/g, "");

	// Check for non-ASCII characters and warn (but don't remove them)
	// Some HTTP clients/servers may have issues with non-ASCII in headers
	const hasNonASCII = /[^\x20-\x7E]/.test(sanitized);
	if (hasNonASCII) {
		console.warn(
			`⚠️ WARNING: REMINDER_SECRET contains non-ASCII characters. This may cause issues with HTTP headers. Consider using only ASCII characters.`
		);
		// Try to encode as base64 for safety, but this changes the value
		// For now, just return as-is but warn
	}

	return sanitized;
}

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

// Функция для получения понятного названия предмета
function getItemName(payload, language = "en") {
	const translations = {
		en: {
			stardust: "Stardust Package",
			darkMatter: "Dark Matter Package",
			galaxyUpgrade: "Galaxy Upgrade",
			galaxyCapture: "Galaxy Capture",
			package: "Package",
			gameObject: "Game Object",
			unknown: "Unknown Item",
		},
		ru: {
			stardust: "Пакет звездной пыли",
			darkMatter: "Пакет темной материи",
			galaxyUpgrade: "Улучшение галактики",
			galaxyCapture: "Захват галактики",
			package: "Пакет",
			gameObject: "Игровой объект",
			unknown: "Неизвестный предмет",
		},
	};

	const lang = language === "ru" ? "ru" : "en";
	// Поддерживаем как короткие ключи (t), так и полные (type)
	const type = payload?.t || payload?.type || "unknown";

	// Для улучшения галактики добавляем тип улучшения
	if (type === "galaxyUpgrade") {
		const upgradeType = payload?.ut || payload?.upgradeType;
		const upgradeNames = {
			en: {
				name: "Galaxy Name",
				type: "Galaxy Type",
				color: "Color Palette",
				background: "Background",
			},
			ru: {
				name: "Название галактики",
				type: "Тип галактики",
				color: "Цветовая палитра",
				background: "Фон",
			},
		};
		const upgradeName =
			upgradeNames[lang]?.[upgradeType] || upgradeNames[lang].name;
		return `${translations[lang].galaxyUpgrade}: ${upgradeName}`;
	}

	// Для пакетов пытаемся получить название из metadata, если есть
	if (type === "package" || type === "gameObject") {
		const packageName = payload?.packageName || payload?.pn || null;
		if (packageName) {
			return packageName;
		}
	}

	return translations[lang][type] || translations[lang].unknown;
}

// Функция для получения переведенного сообщения об успешной оплате
function getPaymentSuccessMessage(payload, payment, language = "en") {
	const translations = {
		en: {
			title: "🎉 Payment processed successfully!",
			item: "📦 Item:",
			amount: "💰 Amount:",
			currency: "Telegram Stars",
			message:
				"Your purchase has been completed and resources have been added to your account.",
		},
		ru: {
			title: "🎉 Платеж успешно обработан!",
			item: "📦 Предмет:",
			amount: "💰 Сумма:",
			currency: "Telegram Stars",
			message: "Ваша покупка завершена, и ресурсы добавлены на ваш счет.",
		},
	};

	const lang = language === "ru" ? "ru" : "en";
	const t = translations[lang];
	const itemName = getItemName(payload, language);
	const currency = payment.currency === "XTR" ? t.currency : payment.currency;

	return `${t.title}\n\n${t.item} ${itemName}\n${t.amount} ${payment.total_amount} ${currency}\n\n${t.message}`;
}

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

		// Получаем язык пользователя
		const userLanguage = user?.language_code || "en";

		// Отправляем уведомление пользователю с переведенным сообщением
		const successMessage = getPaymentSuccessMessage(
			payload,
			payment,
			userLanguage
		);

		await bot.sendMessage(msg.chat.id, successMessage);
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

			// URL игры - используем прямой URL на домен
			const gameUrl = `https://nebulahunt.site/?startapp=${startParam}`;

			// Send welcome message
			await bot.sendPhoto(chatId, photoPath, {
				caption: caption,
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: buttonText.openGame,
								web_app: {
									url: gameUrl,
								},
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
					const gameUrl = "https://nebulahunt.site/";

					await bot.sendMessage(referrerId, referrerMessage, {
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: buttonTexts.en.openGame,
										web_app: { url: gameUrl },
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
		const {
			amount,
			description,
			title,
			paymentType,
			galaxySeed,
			upgradeType,
			upgradeValue,
		} = req.body;

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
			galaxySeed,
			upgradeType,
			upgradeValue,
		});

		// Determine appropriate title and description for the invoice
		let invoiceTitle = title || "Buy Stars";
		let invoiceDescription =
			description || `Purchase ${amount} stars to expand your galaxy`;

		// Create payload with payment metadata
		const payloadData = {
			type: paymentType,
			price: amount,
		};

		// Set more detailed descriptions based on payment type
		if (paymentType === "buyStardust") {
			invoiceTitle = "Buy Stardust";
			invoiceDescription = `Purchase ${amount} Telegram Stars to get Stardust in Nebula Hunt. Stardust is used to create new stars in your galaxies.`;
		} else if (paymentType === "captureGalaxy") {
			invoiceTitle = "Capture Galaxy";
			invoiceDescription = `Purchase ${amount} Telegram Stars to capture a galaxy with ${galaxySeed} stars. Once captured, the galaxy will be permanently owned by you.`;
			payloadData.galaxySeed = galaxySeed;
		} else if (paymentType === "darkMatter") {
			invoiceTitle = "Buy Dark Matter";
			invoiceDescription = `Purchase ${amount} Telegram Stars to get Dark Matter in Nebula Hunt. Dark Matter is a premium resource used for rare upgrades.`;
		} else if (paymentType === "galaxyUpgrade") {
			invoiceTitle = "Galaxy Upgrade";
			invoiceDescription = `Purchase ${amount} Telegram Stars to upgrade your galaxy. This will permanently enhance your galaxy with custom features.`;
			payloadData.galaxySeed = galaxySeed;
			payloadData.upgradeType = upgradeType;
			payloadData.upgradeValue = upgradeValue;
		}

		// Create invoice link for Telegram Stars payment
		const invoiceLink = await bot.createInvoiceLink(
			invoiceTitle,
			invoiceDescription, // Improved description
			JSON.stringify(payloadData), // payload with metadata
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

// Endpoint to process galaxy upgrade after successful payment
app.post("/api/upgrade-galaxy", async (req, res) => {
	try {
		const { galaxySeed, upgradeType, upgradeValue, userId } = req.body;

		console.log("Processing galaxy upgrade:", {
			galaxySeed,
			upgradeType,
			upgradeValue,
			userId,
		});

		// Validate inputs
		if (!galaxySeed || !upgradeType || !upgradeValue || !userId) {
			return res.status(400).json({
				success: false,
				error: "Missing required fields",
			});
		}

		// Validate upgrade types
		const validUpgradeTypes = ["name", "type", "color", "background"];
		if (!validUpgradeTypes.includes(upgradeType)) {
			return res.status(400).json({
				success: false,
				error: `Invalid upgrade type. Must be one of: ${validUpgradeTypes.join(
					", "
				)}`,
			});
		}

		// TODO: Add actual database update logic here
		// For now, just return success
		console.log(`✅ Galaxy upgrade successful for ${galaxySeed}`);

		res.json({
			success: true,
			message: "Galaxy upgraded successfully",
			upgrade: {
				galaxySeed,
				upgradeType,
				upgradeValue,
			},
		});
	} catch (error) {
		console.error("Error upgrading galaxy:", error);
		res.status(500).json({
			success: false,
			error: "Failed to upgrade galaxy",
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
			const gameUrl = "https://nebulahunt.site/";

			await bot.sendMessage(referrerId, referrerMessage, {
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: buttonText,
								web_app: { url: gameUrl },
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

			// Парсим body (может быть Buffer, строка или уже объект)
			let update;
			if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
				update = JSON.parse(req.body.toString());
			} else if (typeof req.body === "object" && req.body !== null) {
				update = req.body; // Уже распарсен
			} else {
				throw new Error("Invalid request body format");
			}

			// Обработка обычных сообщений (команды, текстовые сообщения)
			if (update.message) {
				const msg = update.message;
				const chatId = msg.chat.id;
				const text = msg.text;
				const userLanguage = msg.from?.language_code || "en";

				// Обработка команды /start
				if (text && text.startsWith("/start")) {
					try {
						const captions = {
							en: `Welcome to Nebula Hunt! 🚀\n\nYou are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap "Open game!" to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`,
							ru: `Добро пожаловать в Nebula Hunt! 🚀\n\nВы готовы отправиться в путешествие по неизведанным уголкам вселенной.\n\nСканируйте глубокий космос, открывайте древние планеты и создавайте своё галактическое наследие.\n\n🌌 Нажмите "Открыть игру!", чтобы начать миссию.\n\n🪐 Редкие миры ждут. Некоторые... могут даже изменить всё.\n\nУдачи, Первопроходец. Звёзды наблюдают за вами.`,
						};

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

						const caption = captions[userLanguage] || captions.en;
						const buttonText =
							buttonTexts[userLanguage] || buttonTexts.en;

						const args = text.split(" ");
						let startParam = "ABC";
						if (args.length > 1) {
							startParam = args[1];
						}

						// URL игры - используем прямой URL на домен
						const gameUrl = `https://nebulahunt.site/?startapp=${startParam}`;

						await bot.sendPhoto(chatId, photoPath, {
							caption: caption,
							reply_markup: {
								inline_keyboard: [
									[
										{
											text: buttonText.openGame,
											web_app: {
												url: gameUrl,
											},
										},
									],
									[
										{
											text: buttonText.joinCommunity,
											url: urlCom,
										},
									],
								],
							},
						});

						console.log("✅ /start command processed");
						return res.sendStatus(200);
					} catch (error) {
						console.error("❌ Error processing /start:", error);
					}
				}

				// Если это не платеж и не команда, просто отвечаем 200
				if (!msg.successful_payment) {
					return res.sendStatus(200);
				}
			}

			// Обработка pre_checkout_query (платежи)
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
						// API_BASE_URL может быть с /api или без, проверяем
						const baseUrl = (
							process.env.API_BASE_URL || "https://api.nebulahunt.site"
						).replace(/\/$/, ""); // Убираем trailing slash
						const apiUrl = baseUrl.endsWith("/api")
							? `${baseUrl}/game/complete-payment`
							: `${baseUrl}/api/game/complete-payment`;

						const requestBody = {
							payment,
							payload,
							user: {
								...user,
								id: Number(user.id), // Преобразуем в число для избежания проблем с BigInt
							},
						};

						console.log("🔐 [BOT] Sending request to API:", {
							url: apiUrl,
							method: "POST",
							body: JSON.stringify(requestBody),
							userId: user.id,
							paymentId: payment.telegram_payment_charge_id,
						});

						const apiResponse = await fetch(apiUrl, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify(requestBody),
						});

						console.log(
							"🔐 [BOT] API Response status:",
							apiResponse.status,
							apiResponse.statusText
						);

						// Читаем тело ответа даже при ошибке
						const responseText = await apiResponse.text();
						console.log("🔐 [BOT] API Response body:", responseText);

						if (apiResponse.ok) {
							let result;
							try {
								result = JSON.parse(responseText);
							} catch (e) {
								console.error(
									"❌ Failed to parse response JSON:",
									e
								);
								result = {
									success: false,
									error: "Invalid JSON response",
								};
							}
							console.log("✅ Payment completed via API:", result);

							// Отправляем уведомление пользователю об успешном завершении
							const userLanguage = user?.language_code || "en";
							const successMessage = getPaymentSuccessMessage(
								payload,
								payment,
								userLanguage
							);
							await bot.sendMessage(
								update.message.chat.id,
								successMessage
							);
						} else {
							let errorData;
							try {
								errorData = JSON.parse(responseText);
							} catch (e) {
								errorData = { message: responseText };
							}

							console.error(
								"❌ API call failed:",
								apiResponse.status,
								apiResponse.statusText,
								"Error data:",
								errorData
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

// ============================================
// 📬 DAILY REMINDER SYSTEM
// ============================================

/**
 * Send a custom notification to a user
 * @param {number} userId - Telegram user ID
 * @param {string} message - Custom message text
 * @param {boolean} showOpenGameButton - Show "Open Game" button
 * @param {boolean} showCommunityButton - Show "Community" button
 * @param {string} language - User language (en/ru)
 * @param {Buffer} photoBuffer - Optional photo buffer to attach
 */
async function sendCustomNotification(
	userId,
	message,
	showOpenGameButton = false,
	showCommunityButton = false,
	language = "en",
	photoBuffer = null
) {
	try {
		console.log(`📬 Sending custom notification to user ${userId}`);

		const gameUrl = "https://nebulahunt.site/";
		const communityUrl = "https://t.me/+ur3meeF_bOo1ZGRi";

		const buttons = {
			en: {
				openGame: "🎮 Open Game",
				community: "💬 Community",
			},
			ru: {
				openGame: "🎮 Открыть игру",
				community: "💬 Сообщество",
			},
		};

		const btn = buttons[language] || buttons.en;

		// Build inline keyboard - buttons vertically (each in its own row)
		const inlineKeyboard = [];
		if (showOpenGameButton) {
			// Open Game button first (top)
			inlineKeyboard.push([{ text: btn.openGame, web_app: { url: gameUrl } }]);
		}
		if (showCommunityButton) {
			// Community button second (bottom)
			inlineKeyboard.push([{ text: btn.community, url: communityUrl }]);
		}

		const messageOptions = {
			// No parse_mode - plain text with line breaks and emojis
			reply_markup:
				inlineKeyboard.length > 0
					? { inline_keyboard: inlineKeyboard }
					: undefined,
		};

		// Send with photo if provided, otherwise send text only
		if (photoBuffer) {
			// Ensure photoBuffer is a proper Buffer
			const buffer = Buffer.isBuffer(photoBuffer)
				? photoBuffer
				: Buffer.from(photoBuffer);

			await bot.sendPhoto(userId, buffer, {
				caption: message,
				...messageOptions,
			});
		} else {
			await bot.sendMessage(userId, message, messageOptions);
		}

		console.log(`✅ Custom notification sent successfully to ${userId}`);
		return { success: true };
	} catch (error) {
		console.error(
			`❌ Failed to send custom notification to ${userId}:`,
			error.message
		);
		return { success: false, error: error.message };
	}
}

/**
 * Send a reminder notification to a user
 * @param {number} userId - Telegram user ID
 * @param {string} username - Username
 * @param {string} language - User language (en/ru)
 */
async function sendReminderNotification(userId, username, language = "en") {
	try {
		console.log(`📬 Sending reminder to user ${userId} (${username})`);

		const messages = {
			en: {
				text:
					`🌟 <b>Hey ${username || "Space Explorer"}!</b>\n\n` +
					`💎 Your galaxies are waiting for you!\n` +
					`⭐️ Collect stardust and expand your cosmic empire!\n\n` +
					`🚀 <i>The universe never sleeps, and neither should your ambitions!</i>`,
				button: "🎮 Open Game",
			},
			ru: {
				text:
					`🌟 <b>Привет, ${username || "Исследователь космоса"}!</b>\n\n` +
					`💎 Твои галактики ждут тебя!\n` +
					`⭐️ Собери звездную пыль и расширь свою космическую империю!\n\n` +
					`🚀 <i>Вселенная никогда не спит, как и твои амбиции!</i>`,
				button: "🎮 Открыть игру",
			},
		};

		const msg = messages[language] || messages.en;
		const gameUrl = "https://nebulahunt.site/";

		await bot.sendMessage(userId, msg.text, {
			parse_mode: "HTML",
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: msg.button,
							web_app: { url: gameUrl },
						},
					],
				],
			},
		});

		console.log(`✅ Reminder sent successfully to ${userId}`);
		return { success: true };
	} catch (error) {
		console.error(`❌ Failed to send reminder to ${userId}:`, error.message);
		return { success: false, error: error.message };
	}
}

/**
 * Force send reminders to all users or specified user IDs
 */
async function sendRemindersForced(userIds = null) {
	try {
		console.log("\n⚡ ========== FORCE SENDING REMINDERS ==========");
		console.log(`⏰ Time: ${new Date().toLocaleString()}`);

		const API_URL = process.env.API_URL || "https://nebulahunt.site/api";
		let users = [];

		if (userIds && Array.isArray(userIds) && userIds.length > 0) {
			// Send to specific users
			console.log(`📋 Sending to ${userIds.length} specified users`);
			for (const userId of userIds) {
				try {
					// Get user info from API
					const userResponse = await axios.get(
						`${API_URL}/users/${userId}`,
						{
							timeout: 5000,
							headers: { "Content-Type": "application/json" },
						}
					);
					if (userResponse.data && userResponse.data.user) {
						users.push({
							id: userId,
							username: userResponse.data.user.username || "User",
							language: userResponse.data.user.language || "en",
						});
					}
				} catch (err) {
					console.warn(`⚠️ Failed to fetch user ${userId}:`, err.message);
				}
			}
		} else {
			// Send to all users with reminders enabled
			console.log(`📋 Fetching all users with reminders enabled`);
			const response = await axios.get(`${API_URL}/users/all-for-reminders`, {
				timeout: 30000,
				headers: {
					"Content-Type": "application/json",
					"x-bot-secret": sanitizeHeaderValue(process.env.REMINDER_SECRET),
				},
			});
			users = response.data.users || [];
		}

		console.log(`📊 Found ${users.length} users to notify`);

		if (users.length === 0) {
			console.log("⚠️ No users found to send reminders");
			return;
		}

		let sentCount = 0;
		let failedCount = 0;

		// Send reminders with delay to avoid rate limits
		for (const user of users) {
			try {
				const result = await sendReminderNotification(
					user.id,
					user.username,
					user.language || "en"
				);

				if (result.success) {
					sentCount++;

					// Update lastReminderSentAt on the API server
					await axios
						.post(
							`${API_URL}/users/update-reminder-time`,
							{
								userId: user.id,
								secret: sanitizeHeaderValue(
									process.env.REMINDER_SECRET
								),
							},
							{
								timeout: 5000,
								headers: {
									"Content-Type": "application/json",
									"x-bot-secret": sanitizeHeaderValue(
										process.env.REMINDER_SECRET
									),
								},
							}
						)
						.catch((err) => {
							console.warn(
								`⚠️ Failed to update reminder time for ${user.id}:`,
								err.message
							);
						});
				} else {
					failedCount++;
				}

				// Delay between messages to avoid rate limits (1 second)
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (error) {
				console.error(
					`❌ Error sending reminder to ${user.id}:`,
					error.message
				);
				failedCount++;
			}
		}

		console.log(`\n📈 Force reminder summary:`);
		console.log(`   ✅ Sent: ${sentCount}`);
		console.log(`   ❌ Failed: ${failedCount}`);
		console.log("========================================\n");
	} catch (error) {
		console.error("❌ Error in sendRemindersForced:", error.message);
		throw error;
	}
}

/**
 * Check inactive users and send reminders
 */
async function checkAndSendReminders() {
	try {
		console.log("\n🔔 ========== CHECKING FOR INACTIVE USERS ==========");
		console.log(`⏰ Time: ${new Date().toLocaleString()}`);

		const API_URL = process.env.API_URL || "https://nebulahunt.site/api";

		// Get list of users who need reminders from the main API
		const response = await axios.get(`${API_URL}/users/inactive`, {
			timeout: 30000,
			headers: {
				"Content-Type": "application/json",
				"x-bot-secret": sanitizeHeaderValue(process.env.REMINDER_SECRET),
			},
		});

		const inactiveUsers = response.data.users || [];
		console.log(`📊 Found ${inactiveUsers.length} inactive users`);

		if (inactiveUsers.length === 0) {
			console.log("✅ No users need reminders right now");
			return;
		}

		let sentCount = 0;
		let failedCount = 0;

		// Send reminders with delay to avoid rate limits
		for (const user of inactiveUsers) {
			try {
				const result = await sendReminderNotification(
					user.id,
					user.username,
					user.language || "en"
				);

				if (result.success) {
					sentCount++;

					// Update lastReminderSentAt on the API server
					await axios
						.post(
							`${API_URL}/users/update-reminder-time`,
							{
								userId: user.id,
								secret: sanitizeHeaderValue(
									process.env.REMINDER_SECRET
								),
							},
							{
								timeout: 5000,
								headers: {
									"Content-Type": "application/json",
									"x-bot-secret": sanitizeHeaderValue(
										process.env.REMINDER_SECRET
									),
								},
							}
						)
						.catch((err) => {
							console.warn(
								`⚠️ Failed to update reminder time for ${user.id}:`,
								err.message
							);
						});
				} else {
					failedCount++;
				}

				// Delay between messages to avoid rate limits (1 second)
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch (error) {
				console.error(
					`❌ Error sending reminder to ${user.id}:`,
					error.message
				);
				failedCount++;
			}
		}

		console.log(`\n📈 Reminder summary:`);
		console.log(`   ✅ Sent: ${sentCount}`);
		console.log(`   ❌ Failed: ${failedCount}`);
		console.log("========================================\n");
	} catch (error) {
		console.error("❌ Error in checkAndSendReminders:", error.message);
	}
}

// Schedule reminder checks
// Run twice a day: at 10:00 and 18:00 (server time)
cron.schedule(
	"0 10,18 * * *",
	() => {
		console.log("🕐 Cron job triggered: Checking for inactive users...");
		checkAndSendReminders();
	},
	{
		timezone: "UTC", // Adjust to your timezone
	}
);

console.log("✅ Daily reminder cron job scheduled (10:00 and 18:00 UTC)");

// Manual trigger endpoint for testing (protected by simple auth)
app.post("/api/trigger-reminders", async (req, res) => {
	try {
		const { secret, force = false, userIds = null } = req.body;

		// Simple secret check (add REMINDER_SECRET to .env)
		const expectedSecret = sanitizeHeaderValue(process.env.REMINDER_SECRET);
		const providedSecret = sanitizeHeaderValue(secret);
		if (providedSecret !== expectedSecret) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		console.log("🔧 Manual reminder trigger requested");
		console.log(`⚡ Force mode: ${force}`);
		console.log(`👥 User IDs: ${userIds ? JSON.stringify(userIds) : "all"}`);

		if (force) {
			// Force send to all users or specified users
			await sendRemindersForced(userIds);
		} else {
			// Normal check for inactive users
			await checkAndSendReminders();
		}

		res.json({ success: true, message: "Reminders sent" });
	} catch (error) {
		console.error("Error triggering reminders:", error);
		res.status(500).json({ error: error.message });
	}
});

// Custom notification endpoint
app.post(
	"/api/send-custom-notification",
	upload.single("photo"),
	async (req, res) => {
		try {
			const {
				secret,
				message,
				userIds,
				showOpenGameButton,
				showCommunityButton,
			} = req.body;

			// Get file from multer if uploaded
			const photoFile = req.file;

			// Log file info for debugging
			if (photoFile) {
				console.log("📸 Photo file received:", {
					originalname: photoFile.originalname,
					mimetype: photoFile.mimetype,
					size: photoFile.size,
					bufferType: photoFile.buffer
						? photoFile.buffer.constructor.name
						: "no buffer",
					isBuffer: Buffer.isBuffer(photoFile.buffer),
				});
			}

			// Secret check
			const expectedSecret = sanitizeHeaderValue(process.env.REMINDER_SECRET);
			const providedSecret = sanitizeHeaderValue(secret);
			if (providedSecret !== expectedSecret) {
				return res.status(401).json({ error: "Unauthorized" });
			}

			if (!message || !message.trim()) {
				return res.status(400).json({ error: "Message is required" });
			}

			// Parse userIds if it's a JSON string (from FormData)
			let parsedUserIds = userIds;
			if (typeof userIds === "string") {
				try {
					parsedUserIds = JSON.parse(userIds);
				} catch (e) {
					// If parsing fails, treat as null (send to all)
					parsedUserIds = null;
				}
			}

			// Convert string booleans from FormData to actual booleans
			const showOpenGame =
				showOpenGameButton === true || showOpenGameButton === "true";
			const showCommunity =
				showCommunityButton === true || showCommunityButton === "true";

			if (
				parsedUserIds !== null &&
				(!Array.isArray(parsedUserIds) || parsedUserIds.length === 0)
			) {
				return res.status(400).json({
					error: "User IDs must be null (for all users) or a non-empty array",
				});
			}

			console.log("\n📨 ========== SEND CUSTOM NOTIFICATION ==========");
			console.log(`💬 Message: ${message}`);
			console.log(
				`👥 User IDs: ${
					parsedUserIds === null ? "ALL USERS" : parsedUserIds.length
				} users`
			);
			console.log(`🎮 Open Game button: ${showOpenGame}`);
			console.log(`💬 Community button: ${showCommunity}`);

			const API_URL = process.env.API_URL || "https://nebulahunt.site/api";
			let sentCount = 0;
			let failedCount = 0;

			// If userIds is null, get all users
			let finalUserIds = parsedUserIds;
			if (parsedUserIds === null) {
				try {
					const allUsersResponse = await axios.get(
						`${API_URL}/users/all-for-reminders`,
						{
							timeout: 30000,
							headers: {
								"Content-Type": "application/json",
								"x-bot-secret": sanitizeHeaderValue(
									process.env.REMINDER_SECRET
								),
							},
						}
					);
					finalUserIds = allUsersResponse.data.users.map((u) =>
						u.id.toString()
					);
					console.log(`✅ Found ${finalUserIds.length} users to notify`);
				} catch (err) {
					console.error(`❌ Failed to fetch all users:`, err.message);
					return res.status(500).json({ error: "Failed to fetch users" });
				}
			}

			// Send to each user
			for (const userId of finalUserIds) {
				try {
					// Get user language from API
					let language = "en";
					try {
						const userResponse = await axios.get(
							`${API_URL}/users/${userId}`,
							{
								timeout: 5000,
								headers: {
									"Content-Type": "application/json",
									"x-bot-secret": sanitizeHeaderValue(
										process.env.REMINDER_SECRET
									),
								},
							}
						);
						language = userResponse.data?.user?.language || "en";
					} catch (err) {
						console.warn(
							`⚠️ Failed to fetch user ${userId} language, using default:`,
							err.message
						);
					}

					// Ensure buffer is properly formatted
					let photoBuffer = null;
					if (photoFile && photoFile.buffer) {
						photoBuffer = Buffer.isBuffer(photoFile.buffer)
							? photoFile.buffer
							: Buffer.from(photoFile.buffer);
					}

					const result = await sendCustomNotification(
						userId,
						message.trim(),
						showOpenGame,
						showCommunity,
						language,
						photoBuffer
					);

					if (result.success) {
						sentCount++;
					} else {
						failedCount++;
					}

					// Delay between messages to avoid rate limits (1 second)
					await new Promise((resolve) => setTimeout(resolve, 1000));
				} catch (error) {
					console.error(`❌ Error sending to ${userId}:`, error.message);
					failedCount++;
				}
			}

			console.log(`\n📈 Custom notification summary:`);
			console.log(`   ✅ Sent: ${sentCount}`);
			console.log(`   ❌ Failed: ${failedCount}`);
			console.log("========================================\n");

			res.json({
				success: true,
				message: "Custom notifications sent",
				sent: sentCount,
				failed: failedCount,
			});
		} catch (error) {
			console.error("Error sending custom notifications:", error);
			res.status(500).json({ error: error.message });
		}
	}
);

// ============================================

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
