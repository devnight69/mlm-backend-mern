const express = require('express');
const router = express.Router();

// Import UserController
const UserController = require('../controllers/userController');

// Route to create a new user
router.post('/users', UserController.createUser);

// Route to get all users
router.get('/users', UserController.getAllUsers);

// Route to get a user by ID
router.get('/users/:id', UserController.getUserById);

// Route to update a user by ID
router.put('/users/:id', UserController.updateUser);

// Route to delete a user by ID
router.delete('/users/:id', UserController.deleteUser);

module.exports = router;
