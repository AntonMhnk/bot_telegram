import TelegramBot from "node-telegram-bot-api";
import "dotenv/config";

const token = process.env.TG_BOT_API_KEY;
const url = "t.me/NebulaHuntBot/NebulaHunt";
const urlCom = "https://t.me/+ur3meeF_bOo1ZGRi";
const photoPath = "./images/spaceImage.webp";

const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg) => {
	const chatId = msg.chat.id;
	const text = msg.text;
	const firstName = msg.from.first_name;
	const lastName = msg.from.last_name;
	const username = msg.from.username;
	const id = msg.from.id;
	const is_bot = msg.from.is_bot;

	const caption = `You are about to embark on a journey through the unexplored corners of the universe.\n\nScan deep space, discover ancient planets, and build your own galactic legacy.\n\n🌌 Tap “Open game!” to begin your mission.\n\n🪐 Rare worlds await. Some… may even change everything.\n\nGood luck, Pioneer. The stars are watching.`;

	if (text === "/start") {
		await bot.sendPhoto(chatId, photoPath, {
			caption: caption,
			reply_markup: {
				inline_keyboard: [
					[{ text: "Open game!", url: url }],
					[{ text: "Join community!", url: urlCom }],
				],
			},
		});
	}
});
