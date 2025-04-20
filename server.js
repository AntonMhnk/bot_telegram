require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const app = express();

// Configure CORS
app.use(
	cors({
		origin: "*", // Allow all origins
		methods: ["GET", "POST", "PUT", "DELETE"],
		allowedHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	})
);
app.use(bodyParser.json());

// Validate environment variables
if (!process.env.TG_BOT_API_KEY) {
	console.error("Error: TG_BOT_API_KEY is not set in environment variables");
	process.exit(1);
}

const token = process.env.TG_BOT_API_KEY;
const urlCom = "https://t.me/+ur3meeF_bOo1ZGRi"; // community
const photoPath = path.join(__dirname, "images", "spaceImage.webp");

// Check if photo exists
if (!fs.existsSync(photoPath)) {
	console.error(`Error: Photo file not found at ${photoPath}`);
	process.exit(1);
}

// Initialize Telegram bot with error handling
let bot;
try {
	bot = new TelegramBot(token, { polling: false });
} catch (error) {
	console.error("Error initializing Telegram bot:", error);
	process.exit(1);
}

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

// Handle incoming messages with error handling
bot.on("message", async (msg) => {
	try {
		const chatId = msg.chat.id;
		const text = msg.text;
		const firstName = msg.from.first_name;
		const lastName = msg.from.last_name;
		const username = msg.from.username;
		const id = msg.from.id;
		const is_bot = msg.from.is_bot;

		const caption = `You are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap "Open game!" to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`;

		if (text === "/start") {
			await bot.sendPhoto(chatId, photoPath, {
				caption: caption,
				reply_markup: {
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
			});
		}
	} catch (error) {
		console.error("Error handling message:", error);
		// Attempt to send error message to user
		try {
			await bot.sendMessage(
				msg.chat.id,
				"Sorry, something went wrong. Please try again later."
			);
		} catch (sendError) {
			console.error("Error sending error message:", sendError);
		}
	}
});

// Handle successful payments
bot.on("pre_checkout_query", async (query) => {
	try {
		await bot.answerPreCheckoutQuery(query.id, true);
	} catch (error) {
		console.error("Error handling pre-checkout query:", error);
	}
});

bot.on("successful_payment", async (msg) => {
	try {
		const payment = msg.successful_payment;
		const payload = JSON.parse(payment.invoice_payload);

		// Here you would typically:
		// 1. Update user's inventory
		// 2. Send confirmation message
		// 3. Log the transaction

		await bot.sendMessage(
			msg.chat.id,
			`�� Thank you for your purchase! You've received: ${payload.type}`
		);
	} catch (error) {
		console.error("Error handling successful payment:", error);
	}
});

// Error handling middleware
app.use((err, req, res, next) => {
	console.error("Unhandled error:", err);
	res.status(500).json({
		success: false,
		error: "Internal server error",
		message: process.env.NODE_ENV === "development" ? err.message : undefined,
	});
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

// Export the Express API
module.exports = app;
