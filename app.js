const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");
const morgan = require("morgan");
const logger = require("./utils/logger");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize app
const app = express();

app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()), // Pipe Morgan logs into Winston
    },
  })
);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
const userRoutes = require("./app/routes/userRoutes");
const authRoutes = require("./app/routes/authRoutes");
const pinRoutes = require('./app/routes/pinRoutes')
const packageRoutes = require("./app/routes/PackageRoutes");
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/pin", pinRoutes);
app.use("/api/packages", packageRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
