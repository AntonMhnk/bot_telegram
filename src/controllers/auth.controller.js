const { parse, isValid } = require("@telegram-apps/init-data-node");
const jwt = require("jsonwebtoken");
const config = require("../config/config"); // Import config

// Use secrets from config
const BOT_TOKEN = config.telegramBotToken;
const JWT_ACCESS_SECRET = config.jwtAccessSecret;
const JWT_REFRESH_SECRET = config.jwtRefreshSecret;

const ACCESS_TOKEN_EXPIRY = "15m"; // Example: Access token lasts 15 minutes
const REFRESH_TOKEN_EXPIRY = "7d"; // Example: Refresh token lasts 7 days

// Helper to set cookies
const setAuthCookies = (res, accessToken, refreshToken) => {
	const cookieOptions = {
		httpOnly: true,
		secure: config.nodeEnv === "production", // Use nodeEnv from config
		path: "/",
		sameSite: "Strict", // Use 'Strict' or 'Lax'. 'None' requires secure=true.
	};

	res.cookie("access_token", accessToken, {
		...cookieOptions,
		maxAge: 1000 * 60 * 15, // 15 minutes in ms
	});

	res.cookie("refresh_token", refreshToken, {
		...cookieOptions,
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days in ms
	});
};

exports.signin = async (req, res) => {
	try {
		const { initData } = req.body;

		if (!initData) {
			return res
				.status(400)
				.json({ success: false, error: "No initData provided" });
		}

		if (!BOT_TOKEN || !JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
			console.error("Missing required environment variables for auth!");
			return res
				.status(500)
				.json({ success: false, error: "Server configuration error" });
		}

		// 1. Validate initData
		try {
			await isValid(initData, BOT_TOKEN);
		} catch (error) {
			console.error("Invalid initData:", error.message);
			return res
				.status(401)
				.json({ success: false, error: "Invalid initData" });
		}

		// 2. Parse user data
		const parsedData = parse(initData);
		const user = parsedData.user;

		if (!user || !user.id) {
			console.error("Could not parse user from initData");
			return res
				.status(400)
				.json({ success: false, error: "Invalid user data in initData" });
		}

		// TODO: Here you would typically find or create the user in your database
		// const dbUser = await findOrCreateUserByTgId(user.id, user);
		// For now, just use the parsed user data directly
		const userDataForToken = {
			id: user.id, // Use Telegram ID as primary ID for now
			tg_id: user.id,
			username: user.username,
			// Add any other relevant user fields or roles from your DB user if applicable
		};

		// 3. Generate JWT tokens
		const accessToken = jwt.sign(userDataForToken, JWT_ACCESS_SECRET, {
			expiresIn: ACCESS_TOKEN_EXPIRY,
		});
		const refreshToken = jwt.sign(userDataForToken, JWT_REFRESH_SECRET, {
			expiresIn: REFRESH_TOKEN_EXPIRY,
		});

		// 4. Set cookies
		setAuthCookies(res, accessToken, refreshToken);

		// 5. Send success response (including user info)
		res.json({ success: true, user: userDataForToken });
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
				.json({ success: false, error: "Authentication required" });
		}

		// 1. Try verifying the access token
		try {
			const decoded = jwt.verify(accessToken, JWT_ACCESS_SECRET);
			// Access token is valid, return user data
			return res.json({ success: true, user: decoded });
		} catch (error) {
			// Access token is invalid or expired, proceed to check refresh token
			if (
				error.name !== "TokenExpiredError" &&
				error.name !== "JsonWebTokenError"
			) {
				console.error("Access token verification error:", error);
				// Unexpected error
			}
		}

		// 2. Access token failed, try verifying the refresh token
		if (!refreshToken) {
			return res.status(401).json({
				success: false,
				error: "Session expired, please re-authenticate",
			});
		}

		try {
			const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

			// Refresh token is valid, issue new tokens
			const userDataForToken = {
				id: decoded.id,
				tg_id: decoded.tg_id,
				username: decoded.username,
				// roles: decoded.roles // Include roles if they are in the token
			};

			const newAccessToken = jwt.sign(userDataForToken, JWT_ACCESS_SECRET, {
				expiresIn: ACCESS_TOKEN_EXPIRY,
			});
			const newRefreshToken = jwt.sign(userDataForToken, JWT_REFRESH_SECRET, {
				expiresIn: REFRESH_TOKEN_EXPIRY,
			});

			// Set new cookies
			setAuthCookies(res, newAccessToken, newRefreshToken);

			// Return user data with success
			return res.json({ success: true, user: userDataForToken });
		} catch (error) {
			// Refresh token is also invalid
			console.error("Refresh token verification failed:", error);
			// Clear potentially invalid cookies
			res.clearCookie("access_token");
			res.clearCookie("refresh_token");
			return res.status(401).json({
				success: false,
				error: "Session expired, please re-authenticate",
			});
		}
	} catch (error) {
		console.error("Protected route error:", error);
		res.status(500).json({ success: false, error: "Internal server error" });
	}
};
