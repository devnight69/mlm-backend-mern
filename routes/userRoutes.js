const express = require("express");
const router = express.Router();
const { getAllUsers, createUser } = require("../controllers/userController");

// Routes
router.get("/", getAllUsers);
router.post("/", createUser);

module.exports = router;
