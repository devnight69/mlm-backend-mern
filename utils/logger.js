const { createLogger, transports, format } = require("winston");

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
