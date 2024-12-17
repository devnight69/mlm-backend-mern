const Joi = require("joi");
const {
  User,
  BankDetails,
  AddressDetails,
} = require("../models/DataBaseModel");
const BaseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const logger = require("../../utils/logger"); // Assuming a logger service is implemented

class UpdateUserService {
  // Joi Validation Schemas
  static userUpdateSchema = Joi.object({
    name: Joi.string().max(100),
    email: Joi.string().email().max(100),
    gender: Joi.string().valid("M", "F"),
    husbandName: Joi.string().max(100),
    fatherName: Joi.string().max(100),
    address: Joi.object({
      addressLine1: Joi.string().max(255),
      addressLine2: Joi.string().max(255),
      city: Joi.string().max(100),
      state: Joi.string().max(100),
      pincode: Joi.string().max(20),
      country: Joi.string().max(100),
    }),
  });

  static bankDetailsUpdateSchema = Joi.object({
    accountNumber: Joi.string().max(50),
    accountHolderName: Joi.string().max(100),
    bankName: Joi.string().max(100),
    branchName: Joi.string().max(100),
    ifscCode: Joi.string().max(20),
  });

  // Update User Details Method
  static async updateUserDetails(userId, body) {
    const { error, value } = this.userUpdateSchema.validate(body);

    if (error) {
      logger.error("Validation error", error);
      return BaseResponse.errorResponseWithData(
        StatusCodes.BAD_REQUEST,
        error.details
      );
    }

    try {
      const { address, ...userFields } = value;

      // Update User Fields
      const updatedUser = await User.findByIdAndUpdate(userId, userFields, {
        new: true,
        runValidators: true,
      });

      if (!updatedUser) {
        logger.warn(`User not found with ID: ${userId}`);
        return BaseResponse.errorResponseWithMessage("User not found");
      }

      // Update Address if provided
      if (address) {
        await AddressDetails.findOneAndUpdate(
          { user: userId },
          { ...address, user: userId },
          { new: true, upsert: true } // Create if not exists
        );
      }

      logger.info(`User updated successfully for ID: ${userId}`);
      return BaseResponse.successResponseWithMessage(
        "User updated successfully"
      );
    } catch (error) {
      logger.error("Error updating user", error);
      return BaseResponse.errorResponse(error);
    }
  }

  // Update Bank Details Method
  static async updateBankDetails(userId, body) {
    const { error, value } = this.bankDetailsUpdateSchema.validate(body);

    if (error) {
      logger.error("Validation error", error);
      return BaseResponse.errorResponseWithData(
        StatusCodes.BAD_REQUEST,
        error.details
      );
    }

    try {
      const bankDetails = await BankDetails.findOneAndUpdate(
        { user: userId },
        value,
        { new: true, runValidators: true, upsert: true } // Create if not exists
      );

      logger.info(`Bank details updated successfully for user ID: ${userId}`);
      return BaseResponse.successResponseWithMessage(
        "Bank details updated successfully",
        bankDetails
      );
    } catch (error) {
      logger.error("Error updating bank details", error);
      return BaseResponse.errorResponse(error);
    }
  }

  // Get User and Bank Details Method
  static async getUserAndBankDetails(userId) {
    try {
      const userDetails = await User.findById(userId);
      const bankDetails = await BankDetails.findOne({ user: userId });
      const addressDetails = await AddressDetails.findOne({ user: userId });

      if (!userDetails) {
        logger.warn(`User not found with ID: ${userId}`);
        return BaseResponse.errorResponseWithMessage("User not found");
      }

      logger.info(`Fetched details successfully for user ID: ${userId}`);
      return BaseResponse.successResponseWithMessage(
        "User and Bank Details fetched successfully",
        {
          userDetails,
          bankDetails: bankDetails || {},
          addressDetails: addressDetails || {},
        }
      );
    } catch (error) {
      logger.error("Error fetching details", error);
      return BaseResponse.errorResponse(error);
    }
  }
}

module.exports = UpdateUserService;
