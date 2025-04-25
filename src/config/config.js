require("dotenv").config(); // Ensure .env variables are loaded

const config = {
	telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
	jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
	jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
	nodeEnv: process.env.NODE_ENV || "development",
	clientUrl: process.env.CLIENT_URL,
	// Add other configurations if needed
};

// Basic validation to ensure critical variables are set
if (
	!config.telegramBotToken ||
	!config.jwtAccessSecret ||
	!config.jwtRefreshSecret
) {
	console.error(
		"FATAL ERROR: Missing critical environment variables (TELEGRAM_BOT_TOKEN, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET). Please check your .env file."
	);
	// In a real app, you might want to exit gracefully
	// process.exit(1);
}

module.exports = config;
