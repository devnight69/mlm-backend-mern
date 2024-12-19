const express = require("express");
const router = express.Router();
const withDrawController = require("../controllers/withDrawController");

// Import the authMiddleware
const authMiddleware = require("../../middleware/authMiddleware");

// Route for creating a withdrawal request (only user needs to be authenticated)
router.post(
  "/withdrawal",
  authMiddleware,
  withDrawController.createWithdrawalRequest
); // User creates a withdrawal request

// Route for admin to approve or deny a withdrawal request (only admin should be authenticated)
router.post(
  "/withdrawal/approve-or-deny",
  authMiddleware,
  withDrawController.approveOrDenyWithdrawal
); // Admin approves or denies a request

// Route for admin to view all withdrawal requests
router.get(
  "/withdrawal/requests",
  authMiddleware,
  withDrawController.getAllWithdrawalRequests
);

module.exports = router;
