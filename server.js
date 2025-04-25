require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const TelegramBot = require("node-telegram-bot-api");
const { signin, protectedRoute } = require("./src/controllers/auth.controller");
const { verifyToken } = require("./src/middleware/auth.middleware");

const app = express();

// Configure CORS with more detailed options
app.use(
	cors({
		origin:
			process.env.NODE_ENV === "production"
				? process.env.CLIENT_URL
				: "http://localhost:5173",
		credentials: true,
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: ["Content-Type"],
	})
);
app.use(bodyParser.json());
app.use(cookieParser());

const token = process.env.TG_BOT_API_KEY;
const urlCom = "https://t.me/+ur3meeF_bOo1ZGRi";
const photoPath = "./images/spaceImage.y";
const botUsername = "NebulaHuntBot"; // Add your bot username
const myAppName = "myapp";

// Initialize Telegram bot with optimized settings
const bot = new TelegramBot(token, { polling: true });

// Authentication routes
app.post("/auth/signin", signin);
app.get("/auth/protected", verifyToken, protectedRoute);

bot.on("message", async (msg) => {
	const chatId = msg.chat.id;
	const text = msg.text;

	const caption = `Welcome to Nebula Hunt! 🚀\n\nYou are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap "Open game!" to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`;

	if (text === "/start") {
		try {
			const webAppUrl = `https://t.me/${botUsername}/${myAppName}?startapp=ABC`;
			await bot.sendPhoto(chatId, photoPath, {
				caption: caption,
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: "🪐 Open game!",
								url: webAppUrl, // Changed from web_app to url for deep link
							},
						],
						[{ text: "Join community!", url: urlCom }],
					],
				},
			});
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
		const { amount, description } = req.body;

		// Validate amount
		if (!amount || amount < 1 || amount > 10000) {
			return res.status(400).json({
				success: false,
				error: "Invalid amount. Must be between 1 and 10,000 stars.",
			});
		}

		console.log("Creating invoice with data:", { amount, description });

		// Create invoice link for Telegram Stars payment
		const invoiceLink = await bot.createInvoiceLink(
			"Buy Stars", // title
			`Purchase ${amount} stars to expand your galaxy`, // description
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

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).json({ success: false, error: "Something went wrong!" });
});

// Handle OPTIONS requests for CORS
app.options("*", cors());

// Export the Express API
module.exports = app;
