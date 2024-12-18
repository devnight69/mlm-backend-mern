const cors = require('cors');

// CORS Configuration - Allow specific origins
const corsOptions = {
  origin: '*',  // Allow all origins (or specify specific origins like 'http://localhost:5174')
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,  // Allow cookies or authorization headers
};

// Middleware to apply CORS settings globally
function setupCors(app) {
  app.use(cors(corsOptions)); // Apply CORS settings globally
}

// Allow all access without any role check
function permitAll(req, res, next) {
  next();  // Allows the request to proceed without any role check
}

// Exporting the functions for use in routes or globally
module.exports = {
  setupCors,
  permitAll,  // Export only the permitAll function
};