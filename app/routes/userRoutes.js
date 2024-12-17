const express = require("express");
const router = express.Router();

// Import UserController
const UserController = require("../controllers/userController");

// Import the authMiddleware
const authMiddleware = require("../../middleware/authMiddleware");

// Route to get all users
router.get("/users", authMiddleware, UserController.getAllUsers);

// Route to get a user by ID
router.get("/users/:id", authMiddleware, UserController.getUserById);

// Route to update a user by ID
router.put("/users/:id", authMiddleware, UserController.updateUser);

// Route to delete a user by ID
router.delete("/users/:id", authMiddleware, UserController.deleteUser);

router.get("/user/details", authMiddleware, UserController.getUserDetails);

module.exports = router;
