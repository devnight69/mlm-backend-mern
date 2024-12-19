const Joi = require("joi");
const {
  User,
  BankDetails,
  AddressDetails,
  ReferralTracking,
  Wallet,
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

  static async getUserReferreDetails(referralCode) {
    try {
      // Step 1: Check if the referralCode is valid (exists in the database)
      const referrer = await User.findOne({ referralCode });

      if (!referrer) {
        // If referralCode is not valid, return an error
        return BaseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "Referral code not found"
        );
      }

      // Step 2: Find all users who were referred by the given referralCode
      const referredUsers = await ReferralTracking.find({
        referrer: referrer._id,
      })
        .populate("referred", "name mobileNumber email userType status referralCode") // Populate referred user details
        .exec();

      // Step 3: Return the list of referred users
      const userDetails = referredUsers.map((record) => record.referred);
      return BaseResponse.successResponseWithMessage(
        "Referred users fetched successfully",
        userDetails
      );
    } catch (error) {
      // Catch any errors and send a response
      logger.error("Error fetching details", error);
      return BaseResponse.errorResponseWithMessage(
        "An error occurred while fetching referred users",
        error
      );
    }
  }

  // Get wallet details by userId
  static async getWalletDetailsByUserId(userId) {
    try {
      if (!userId) {
        return BaseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "UserId is required."
        );
      }

      const wallet = await Wallet.findOne({ user: userId }).populate(
        "user",
        "name email"
      ); // Populate user details if needed

      if (!wallet) {

          return BaseResponse.errorResponseWithData(
            StatusCodes.BAD_REQUEST,
            "Wallet not found for the given user."
          );
      }

      return BaseResponse.successResponseWithMessage(
        "Wallet details fetched successfully",
        wallet
      );

    } catch (error) {
      console.error("Error fetching wallet details:", error);
      return BaseResponse.errorResponseWithMessage(
        "An error occurred while fetching referred users",
        error
      );
    }
  }

}

module.exports = UpdateUserService;
