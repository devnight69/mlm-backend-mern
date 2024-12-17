const { createLogger, transports, format } = require("winston");
const fs = require("fs");
const path = require("path");
// Path to the logs directory
const logDir = path.join(__dirname, "../logs");

// Check if the logs directory exists; if not, create it
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true }); // Create directory recursively
}

// Define the log format
const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(
    ({ timestamp, level, message }) =>
      `${timestamp} [${level.toUpperCase()}]: ${message}`
  )
);

// Create the logger instance
const logger = createLogger({
  level: "info", // Default log level
  format: logFormat,
  transports: [
    new transports.Console(), // Logs to the console
    new transports.File({ filename: "logs/server.log" }), // Logs to a file
  ],
});

module.exports = logger;
