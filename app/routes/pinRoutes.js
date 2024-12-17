const express = require('express');
const router = express.Router();

// Import pinController
const pinController = require('../controllers/PinController');

// Import the authMiddleware
const authMiddleware = require("../../middleware/authMiddleware");

// Route to create a new Pin
router.post('/create', authMiddleware, pinController.generatePinAndSave);

// Get all pins for a user
router.get('/pins/:userId', authMiddleware, pinController.getAllPinsByUser);

// Transfer a pin
router.post('/transfer-pin', authMiddleware, pinController.transferPin);


module.exports = router;
