const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

// User Registration Route
router.post('/register', (req, res) => {
  AuthController.registerUser(req, res);
});

// User Login Route
router.post('/login', (req, res) => {
  AuthController.loginUser(req, res);
});

module.exports = router;