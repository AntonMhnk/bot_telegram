require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const app = express();
const isDev = process.env.NODE_ENV !== "production";

// Configure CORS with more detailed options
app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
		exposedHeaders: ["Content-Range", "X-Content-Range"],
		credentials: true,
		maxAge: 600,
		preflightContinue: false,
		optionsSuccessStatus: 204,
	})
);
app.use(bodyParser.json());

// Validate environment variables
if (!process.env.TG_BOT_API_KEY) {
	console.error("Error: TG_BOT_API_KEY is not set in environment variables");
	process.exit(1);
}

const token = process.env.TG_BOT_API_KEY;
const urlCom = "https://t.me/+ur3meeF_bOo1ZGRi";
const photoPath = path.join(__dirname, "images", "spaceImage.webp");

// Cache the photo buffer
const photoBuffer = fs.readFileSync(photoPath);

// Initialize Telegram bot with optimized settings
let bot;
try {
	console.log("Initializing Telegram bot...");
	const botOptions = {
		webHook: isDev
			? false
			: {
					port: process.env.PORT || 3000,
			  },
		polling: isDev,
		filepath: false,
	};

	bot = new TelegramBot(token, botOptions);

	if (!isDev) {
		// Set webhook in production
		const url = process.env.VERCEL_URL || "your-production-url.vercel.app";
		bot.setWebHook(`https://${url}/webhook/${token}`);
	}

	console.log("Bot initialized successfully");

	// Cache for welcome message
	const welcomeMessageCache = {
		caption: `Welcome to Nebula Hunt! 🚀\n\nYou are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap "Open game!" to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`,
		keyboard: {
			inline_keyboard: [
				[
					{
						text: "🪐 Open game!",
						web_app: { url: "https://nebula-hunt.vercel.app/" },
					},
				],
				[{ text: "Join community!", url: urlCom }],
			],
		},
	};

	// Handle /start command with optimized response
	bot.onText(/\/start/, async (msg) => {
		const chatId = msg.chat.id;
		try {
			await bot.sendPhoto(chatId, photoBuffer, {
				caption: welcomeMessageCache.caption,
				reply_markup: welcomeMessageCache.keyboard,
				filename: "spaceImage.webp",
			});
		} catch (error) {
			console.error("Error in /start command:", error);
			await bot
				.sendMessage(chatId, welcomeMessageCache.caption, {
					reply_markup: welcomeMessageCache.keyboard,
				})
				.catch(console.error);
		}
	});

	// Handle successful payments with optimized response
	bot.on("pre_checkout_query", async (query) => {
		await bot
			.answerPreCheckoutQuery(query.id, true)
			.catch((error) => console.error("Pre-checkout error:", error));
	});

	bot.on("successful_payment", async (msg) => {
		try {
			const payment = msg.successful_payment;
			const payload = JSON.parse(payment.invoice_payload);

			// Send "typing" action immediately
			await bot.sendChatAction(msg.chat.id, "typing");

			await bot.sendMessage(
				msg.chat.id,
				`🎉 Thank you for your purchase! You've received: ${payload.type}`,
				{ parse_mode: "HTML" } // Enable HTML parsing for faster message rendering
			);
		} catch (error) {
			console.error("Payment confirmation error:", error);
		}
	});
} catch (error) {
	console.error("Bot initialization error:", error);
	process.exit(1);
}

// Webhook endpoint for production
app.post(`/webhook/${token}`, (req, res) => {
	bot.handleUpdate(req.body);
	res.sendStatus(200);
});

// Store items
const storeItems = [
	{
		id: 1,
		name: "Space Explorer Pack",
		description: "Unlock special space exploration features",
		stars: 100,
		image: "🚀",
		type: "pack",
	},
	{
		id: 2,
		name: "Cosmic Boost",
		description: "Temporary speed boost for your spaceship",
		stars: 50,
		image: "⚡",
		type: "boost",
	},
	{
		id: 3,
		name: "Galactic Weapon",
		description: "Powerful weapon for space battles",
		stars: 200,
		image: "��",
		type: "weapon",
	},
	{
		id: 4,
		name: "VIP Explorer",
		description: "VIP status with exclusive benefits",
		stars: 150,
		image: "👑",
		type: "status",
	},
];

// Get store items with invoice links
app.get("/api/store-items", async (req, res) => {
	console.log("Received request for store items");
	try {
		console.log("Available store items:", storeItems);
		const itemsWithInvoiceLinks = await Promise.all(
			storeItems.map(async (item) => {
				try {
					console.log(`Creating invoice link for item: ${item.name}`);
					const invoiceLink = await bot.createInvoiceLink(
						item.name,
						item.description,
						JSON.stringify({ itemId: item.id, type: item.type }),
						"",
						"XTR",
						[{ amount: item.stars, label: `${item.stars} Stars` }]
					);
					console.log(
						`Invoice link created for ${item.name}: ${invoiceLink}`
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

		console.log("Sending response with items:", itemsWithInvoiceLinks);
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
		const { amount, description } = req.body;

		console.log("Creating invoice with data:", { amount, description });

		// Create invoice link for Telegram Stars payment
		const invoiceLink = await bot.createInvoiceLink(
			"Title", // title
			"Some description", // description
			"{}", // payload - must be empty for Stars
			"", // provider_token - must be empty for Stars
			"XTR", // currency - must be XTR for Stars
			[{ amount: amount, label: description || "Stars" }] // prices
		);

		console.log("Invoice link created successfully:", invoiceLink);
		res.json({ success: true, invoiceLink });
	} catch (error) {
		console.error("Detailed error creating payment:", {
			message: error.message,
			stack: error.stack,
			response: error.response?.data,
		});
		res.status(500).json({
			success: false,
			error: error.message,
			details: error.response?.data || "No additional details available",
		});
	}
});

// Add error handling middleware
app.use((err, req, res, next) => {
	console.error("Error:", err);
	res.status(500).json({
		success: false,
		error: err.message || "Internal server error",
		stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
	});
});

// Add request logging middleware
app.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
	next();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
	process.exit(1);
});

// Start the server if this file is run directly
if (require.main === module) {
	const PORT = process.env.PORT || 3000;
	const HOST = "0.0.0.0"; // Listen on all network interfaces

	app.listen(PORT, HOST, () => {
		console.log(`Server is running on http://${HOST}:${PORT}`);
		console.log(
			`Store API available at: http://${HOST}:${PORT}/api/store-items`
		);
		console.log("Press Ctrl+C to stop the server");
	});
}

// Export the Express API
module.exports = app;
