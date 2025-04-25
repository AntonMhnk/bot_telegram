const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
	const token = req.cookies.access_token;

	if (!token) {
		return res.status(401).json({ success: false, error: "No token provided" });
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);
		req.user = decoded;
		next();
	} catch (error) {
		return res.status(401).json({ success: false, error: "Invalid token" });
	}
};

module.exports = { verifyToken };
