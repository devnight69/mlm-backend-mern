const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");
const morgan = require("morgan");
const logger = require("./utils/logger");
const { setupCors } = require("./config/Security");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize app
const app = express();

// Apply CORS configuration
setupCors(app);

app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()), // Pipe Morgan logs into Winston
    },
  })
);
//last
// Middleware
app.use(bodyParser.json());

// Routes
const userRoutes = require("./app/routes/userRoutes");
const authRoutes = require("./app/routes/authRoutes");
const pinRoutes = require("./app/routes/pinRoutes");
const packageRoutes = require("./app/routes/PackageRoutes");
const withDrawRoutes = require("./app/routes/withDrawRoute");
const updateUserRoutes = require("./app/routes/updateUserRoute");

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/pin", pinRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/withdraw", withDrawRoutes);
app.use("/api/update/user/", updateUserRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));