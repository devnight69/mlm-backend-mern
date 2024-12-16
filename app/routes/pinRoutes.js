const express = require('express');
const router = express.Router();

// Import pinController
const pinController = require('../controllers/PinController');

// Route to create a new Pin
router.post('/create', pinController.generatePinAndSave);

// Get all pins for a user
router.get('/pins/:userId', pinController.getAllPinsByUser);

// Transfer a pin
router.post('/transfer-pin', pinController.transferPin);


module.exports = router;
