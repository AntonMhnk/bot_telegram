require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");

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

// Initialize Telegram bot with optimized settings
const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg) => {
	const chatId = msg.chat.id;
	const text = msg.text;

	const caption = `Welcome to Nebula Hunt! 🚀\n\nYou are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap "Open game!" to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`;

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
						`Referral detected! User ${chatId} was referred by ${referrerId}`
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
								text: "🪐 Open game!",
								url: webAppUrl,
							},
						],
						[{ text: "Join community!", url: urlCom }],
					],
				},
			});

			// If this was a referral, send additional messages
			if (isReferral) {
				await bot.sendMessage(
					chatId,
					"🎁 You were invited by a friend! Open the game to receive your welcome bonus of 5,000 Stardust and 10 Dark Matter!"
				);

				// Notify the referrer if possible
				try {
					await bot.sendMessage(
						referrerId,
						`🎉 Great news! Someone joined using your referral link. You'll receive your reward of 5,000 Stardust and 10 Dark Matter when they open the game!`
					);
				} catch (referrerError) {
					console.log(
						`Could not notify referrer ${referrerId}: ${referrerError.message}`
					);
				}
			}
		} catch (error) {
			console.error("Error sending start message:", error);
			await bot.sendMessage(
				chatId,
				"Welcome to Nebula Hunt! Please try opening the game again."
			);
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
		const { userId, referrerId } = req.body;

		// In a real implementation, you would:
		// 1. Verify this is a valid referral (check if not already processed)
		// 2. Store the referral in your database
		// 3. Track rewards given to both users

		console.log(
			`Processing referral: User ${userId} was referred by ${referrerId}`
		);

		// For now, just return success
		res.json({
			success: true,
			message: "Referral processed successfully",
			rewards: {
				stardust: 5000,
				darkMatter: 10,
			},
		});
	} catch (error) {
		console.error("Error processing referral:", error);
		res.status(500).json({
			success: false,
			error: "Failed to process referral",
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

		if (userLanguage === "ru") {
			// Русская версия сообщения
			messageText = "🌟 Ваше хранилище ресурсов заполнено и готово к сбору!";

			// Добавляем информацию о доступных ресурсах
			if (stardustAmount && stardustAmount > 0) {
				messageText += `\n\n✨ Звездная пыль: ${stardustAmount}`;
			}

			if (darkMatterAmount && darkMatterAmount > 0) {
				messageText += `\n\n🌑 Темная материя: ${darkMatterAmount}`;
			}

			messageText += "\n\nЗайдите в игру, чтобы собрать ресурсы!";
		} else {
			// Английская версия сообщения
			messageText = "🌟 Your resource storage is full and ready to collect!";

			// Добавляем информацию о доступных ресурсах
			if (stardustAmount && stardustAmount > 0) {
				messageText += `\n\n✨ Stardust: ${stardustAmount}`;
			}

			if (darkMatterAmount && darkMatterAmount > 0) {
				messageText += `\n\n🌑 Dark Matter: ${darkMatterAmount}`;
			}

			messageText += "\n\nOpen the game to collect your resources!";
		}

		// Создаем кнопку для быстрого перехода в игру с текстом в зависимости от языка
		const webAppUrl = `https://t.me/${botUsername}/${myAppName}`;
		const buttonText =
			userLanguage === "ru" ? "🪐 Открыть игру" : "🪐 Open Game";

		// Отправляем сообщение пользователю через бот
		await bot.sendMessage(userId, messageText, {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

// Export the Express API
module.exports = app;
