const { isValid } = require("@telegram-apps/init-data-node");
const jwt = require("jsonwebtoken");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;

exports.signin = async (req, res) => {
	try {
		const { initData } = req.body;

		if (!initData) {
			return res
				.status(400)
				.json({ success: false, error: "No initData provided" });
		}

		// Validate Telegram initData
		const isValidData = isValid(initData, BOT_TOKEN);
		if (!isValidData) {
			return res
				.status(401)
				.json({ success: false, error: "Invalid initData" });
		}

		// Parse initData to get user info
		const userData = new URLSearchParams(initData);
		const user = JSON.parse(userData.get("user"));

		if (!user) {
			return res
				.status(400)
				.json({ success: false, error: "No user data found" });
		}

		// Generate JWT tokens
		const accessToken = jwt.sign(
			{ id: user.id, username: user.username },
			JWT_SECRET,
			{ expiresIn: "1h" }
		);

		const refreshToken = jwt.sign(
			{ id: user.id, username: user.username },
			JWT_SECRET,
			{ expiresIn: "7d" }
		);

		// Set cookies
		res.cookie("access_token", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 3600000, // 1 hour
		});

		res.cookie("refresh_token", refreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 604800000, // 7 days
		});

		res.json({ success: true, user });
	} catch (error) {
		console.error("Signin error:", error);
		res.status(500).json({ success: false, error: "Internal server error" });
	}
};

exports.protectedRoute = async (req, res) => {
	try {
		const accessToken = req.cookies.access_token;
		const refreshToken = req.cookies.refresh_token;

		if (!accessToken && !refreshToken) {
			return res
				.status(401)
				.json({ success: false, error: "No tokens provided" });
		}

		try {
			// Try to verify access token
			const decoded = jwt.verify(accessToken, JWT_SECRET);
			return res.json({ success: true, user: decoded });
		} catch (error) {
			// If access token is invalid, try to refresh
			if (refreshToken) {
				try {
					const decoded = jwt.verify(refreshToken, JWT_SECRET);

					// Generate new tokens
					const newAccessToken = jwt.sign(
						{ id: decoded.id, username: decoded.username },
						JWT_SECRET,
						{ expiresIn: "1h" }
					);

					const newRefreshToken = jwt.sign(
						{ id: decoded.id, username: decoded.username },
						JWT_SECRET,
						{ expiresIn: "7d" }
					);

					// Set new cookies
					res.cookie("access_token", newAccessToken, {
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
						sameSite: "strict",
						maxAge: 3600000,
					});

					res.cookie("refresh_token", newRefreshToken, {
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
						sameSite: "strict",
						maxAge: 604800000,
					});

					return res.json({ success: true, user: decoded });
				} catch (error) {
					return res
						.status(401)
						.json({ success: false, error: "Invalid refresh token" });
				}
			}
			return res
				.status(401)
				.json({ success: false, error: "Invalid access token" });
		}
	} catch (error) {
		console.error("Protected route error:", error);
		res.status(500).json({ success: false, error: "Internal server error" });
	}
};
