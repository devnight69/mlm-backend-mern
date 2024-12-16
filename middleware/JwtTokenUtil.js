const jwt = require('jsonwebtoken');

// Secret key for signing the JWT (should be stored securely in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const JWT_EXPIRATION = '24h'; // Token expiration time

class JwtTokenUtil {
  static createToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
  }

  static validateToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      throw new Error('Invalid or expired token');
    }
  }

  static decodeToken(token) {
    return jwt.decode(token);
  }
}

module.exports = JwtTokenUtil;