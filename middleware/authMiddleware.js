const JwtTokenUtil = require('../middleware/JwtTokenUtil');

const authMiddleware = (req, res, next) => {
  // Get the token from the Authorization header (expecting "Bearer <token>")
  const token = req.headers['authorization']?.split(' ')[1]; 

  // If no token is provided, send an error response
  if (!token) {
    return res.status(401).json({ message: 'Access token is missing' });
  }

  try {
    // Validate and decode the token using JwtTokenUtil
    const decoded = JwtTokenUtil.validateToken(token);

    // Attach the decoded user data to the request object
    req.user = decoded;

    // Proceed to the next middleware or route handler
    next();
  } catch (err) {
    // If the token is invalid or expired, send an error response
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
