const express = require("express");
const UpdateUserService = require("../controllers/UpdateUserDetailsController"); // Adjust the path as necessary
const router = express.Router();

// Import the authMiddleware
const authMiddleware = require("../../middleware/authMiddleware");

// Route to update user details
router.put("/:userId", authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const response = await UpdateUserService.updateUserDetails(userId, req.body);
  return res.status(response.status).json(response);
});

// Route to update bank details
router.put("/:userId/bank-details", authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const response = await UpdateUserService.updateBankDetails(userId, req.body);
  return res.status(response.status).json(response);
});

// Route to fetch user and bank details
router.get("/:userId", authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const response = await UpdateUserService.getUserAndBankDetails(userId);
  return res.status(response.status).json(response);
});

// Route to fetch user and bank details
router.get("/:referralCode/users", authMiddleware, async (req, res) => {
  const { referralCode } = req.params;
  const response = await UpdateUserService.getUserReferreDetails(referralCode);
  return res.status(response.status).json(response);
});

router.get("/wallet/:userId", authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const response = await UpdateUserService.getWalletDetailsByUserId(userId);
  return res.status(response.status).json(response);
});

router.get("/total-count/:userId", authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const response = await UpdateUserService.getTotalReferralCount(userId);
  return res.status(response.status).json(response);
});

module.exports = router;
