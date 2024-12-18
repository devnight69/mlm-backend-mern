const { Wallet, User } = require("../models/DataBaseModel");
const WithdrawalRequest = require("../models/WithdrwalModel");
const mongoose = require("mongoose");
const logger = require("../../utils/logger");
const Joi = require("joi");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");

class WithDrawController {
  // Login Validation Schema
  withDrawSchema = Joi.object({
    userId: Joi.string().required(),
    amountRequested: Joi.string().required(),
  });

  // Method to create withdrawal request
  async createWithdrawalRequest(req, res) {
    const session = await mongoose.startSession();

    try {
      const { error, value } = this.withDrawSchema.validate(req.body);
      if (error) {
        logger.warn(
          `Validation error during withdrawal request: ${error.details[0].message}`
        );
        return res
          .status(400)
          .send(
            baseResponse.errorResponseWithMessage(error.details[0].message)
          );
      }

      const { userId, amountRequested } = value; // Use validated input

      // Start the transaction
      session.startTransaction();

      // Find the user's wallet
      const wallet = await Wallet.findOne({ user: userId }).session(session);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const totalBalance =
        wallet.directReferralIncome + wallet.indirectReferralIncome;
      if (totalBalance < 100) {
        throw new Error("Minimum balance of 100 required for withdrawal");
      }

      // Calculate deductions
      const deductionAmount = amountRequested * 0.08;
      const netAmount = amountRequested - deductionAmount;

      // Create the withdrawal request
      const withdrawalRequest = new WithdrawalRequest({
        user: userId,
        amountRequested,
        deductionAmount,
        netAmount,
      });

      await withdrawalRequest.save({ session });

      // Commit the transaction
      await session.commitTransaction();

      logger.info(`Withdrawal request created successfully for user ${userId}`);

      return res
        .status(201)
        .json(
          baseResponse.successResponseWithMessage(
            "Withdrawal request created successfully",
            withdrawalRequest
          )
        );
    } catch (error) {
      logger.error(`Error in createWithdrawalRequest: ${error.message}`);
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      return res
        .status(500)
        .json(baseResponse.errorResponseWithMessage(error.message));
    } finally {
      session.endSession();
    }
  }

  // Method to approve or deny withdrawal
  async approveOrDenyWithdrawal(req, res) {
    const session = await mongoose.startSession();
    try {
      const { withdrawalRequestId, status } = req.body;

      // Only admin can approve or deny
      if (req.user.userType !== "Admin") {
        logger.warn(
          `User ${req.user._id} attempted to approve/deny a withdrawal request without permission.`
        );
        return res
          .status(403)
          .json(
            baseResponse.errorResponseWithMessage(
              "You do not have permission to perform this action"
            )
          );
      }

      const withdrawalRequest = await WithdrawalRequest.findById(
        withdrawalRequestId
      )
        .populate("user")
        .session(session);

      if (!withdrawalRequest) {
        throw new Error("Withdrawal request not found");
      }

      // Start the session
      session.startTransaction();

      // If approved, deduct the amount from the user's wallet
      if (status === "approved") {
        const wallet = await Wallet.findOne({
          user: withdrawalRequest.user._id,
        }).session(session);

        if (!wallet) {
          throw new Error("User wallet not found");
        }

        const totalBalance =
          wallet.directReferralIncome + wallet.indirectReferralIncome;

        const totalDeductionAmount = withdrawalRequest.amountRequested;

        if (totalBalance < totalDeductionAmount) {
          throw new Error("Insufficient funds in wallet");
        }

        // Deduct the net amount, first from directReferralIncome, then from indirectReferralIncome if necessary
        if (wallet.directReferralIncome >= totalDeductionAmount) {
          wallet.directReferralIncome -= totalDeductionAmount;
        } else {
          const remainingAmount =
            totalDeductionAmount - wallet.directReferralIncome;
          wallet.directReferralIncome = 0;
          wallet.indirectReferralIncome -= remainingAmount;
        }

        // Save the updated wallet
        await wallet.save({ session });

        // Update withdrawal request status and approval date
        withdrawalRequest.status = "approved";
        withdrawalRequest.approvalDate = new Date();
        await withdrawalRequest.save({ session });

        // Commit the transaction
        await session.commitTransaction();

        logger.info(
          `Withdrawal request ${withdrawalRequestId} approved successfully for user ${withdrawalRequest.user._id}`
        );
        return res
          .status(200)
          .json(
            baseResponse.successResponseWithMessage(
              "Withdrawal request approved successfully"
            )
          );
      }

      // If denied, no deduction is made, just update the request status
      if (status === "denied") {
        withdrawalRequest.status = "denied";
        withdrawalRequest.approvalDate = new Date();
        await withdrawalRequest.save({ session });

        // Commit the transaction
        await session.commitTransaction();

        logger.info(
          `Withdrawal request ${withdrawalRequestId} denied for user ${withdrawalRequest.user._id}`
        );
        return res
          .status(200)
          .json(
            baseResponse.successResponseWithMessage(
              "Withdrawal request denied and refunded"
            )
          );
      }

      // Invalid status
      return res
        .status(400)
        .json(baseResponse.errorResponseWithMessage("Invalid status provided"));
    } catch (error) {
      logger.error(`Error in approveOrDenyWithdrawal: ${error.message}`);
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      return res.status(500).json(baseResponse.errorResponse(error));
    } finally {
      // Always end the session
      session.endSession();
    }
  }
}

// Export the controller instance
module.exports = new WithDrawController();
