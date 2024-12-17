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

      const { userId, amountRequested } = req.body; // Accept userId and amountRequested in request body

      // Start the session
      session.startTransaction();

      // Find the user's wallet balance
      const wallet = await Wallet.findOne({ user: userId }).session(session);

      if (!wallet) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json(baseResponse.errorResponseWithMessage("Wallet not found"));
      }

      if (wallet.directReferralIncome < 100) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json(
            baseResponse.errorResponseWithMessage(
              "Minimum balance of 100 required for withdrawal"
            )
          );
      }

      // Deduct 8% from the requested amount for transaction charges
      const deductionAmount = amountRequested * 0.08;
      const netAmount = amountRequested - deductionAmount;

      // Create withdrawal request
      const withdrawalRequest = new WithdrawalRequest({
        user: userId,
        amountRequested,
        deductionAmount,
        netAmount,
      });

      await withdrawalRequest.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

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
      session.endSession();
      return res.status(500).json(baseResponse.errorResponse(error));
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
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json(
            baseResponse.errorResponseWithMessage(
              "Withdrawal request not found"
            )
          );
      }

      // Start the session
      session.startTransaction();

      // If approved, deduct the amount from user's wallet
      if (status === "approved") {
        const wallet = await Wallet.findOne({
          user: withdrawalRequest.user._id,
        }).session(session);

        if (!wallet) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(404)
            .json(
              baseResponse.errorResponseWithMessage("User wallet not found")
            );
        }

        if (wallet.directReferralIncome < withdrawalRequest.netAmount) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(400)
            .json(
              baseResponse.errorResponseWithMessage(
                "Insufficient funds in wallet"
              )
            );
        }

        // Deduct the net amount
        wallet.directReferralIncome -= withdrawalRequest.netAmount;
        await wallet.save({ session });

        withdrawalRequest.status = "approved";
        withdrawalRequest.approvalDate = new Date();
        await withdrawalRequest.save({ session });

        await session.commitTransaction();
        session.endSession();

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

      // If denied, refund the full requested amount
      if (status === "denied") {
        const wallet = await Wallet.findOne({
          user: withdrawalRequest.user._id,
        }).session(session);

        if (!wallet) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(404)
            .json(
              baseResponse.errorResponseWithMessage("User wallet not found")
            );
        }

        // Refund the full requested amount
        wallet.directReferralIncome += withdrawalRequest.amountRequested;
        await wallet.save({ session });

        withdrawalRequest.status = "denied";
        withdrawalRequest.approvalDate = new Date();
        await withdrawalRequest.save({ session });

        await session.commitTransaction();
        session.endSession();

        logger.info(
          `Withdrawal request ${withdrawalRequestId} denied and refunded for user ${withdrawalRequest.user._id}`
        );
        return res
          .status(200)
          .json(
            baseResponse.successResponseWithMessage(
              "Withdrawal request denied and refunded"
            )
          );
      }

      return res
        .status(400)
        .json(baseResponse.errorResponseWithMessage("Invalid status provided"));
    } catch (error) {
      logger.error(`Error in approveOrDenyWithdrawal: ${error.message}`);
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();
      return res.status(500).json(baseResponse.errorResponse(error));
    }
  }
}

// Export the controller instance
module.exports = new WithDrawController();
