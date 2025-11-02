// PM2 Ecosystem Configuration for Bot Server (VPS #2)

module.exports = {
	apps: [
		{
			name: "nebulahunt-bot",
			script: "server.js",
			instances: 1,
			exec_mode: "fork",
			env: {
				NODE_ENV: "production",
				TG_BOT_API_KEY: "7778437028:AAF-90jbbHgMzNYUxvdXjoTHcglql5WbP68",
				API_BASE_URL: "https://api.nebulahunt.site",
				PORT: "3000",
			},
			error_file: "./logs/bot-error.log",
			out_file: "./logs/bot-out.log",
			log_date_format: "YYYY-MM-DD HH:mm:ss Z",
			autorestart: true,
			watch: false,
			max_memory_restart: "500M",
		},
	],
};
