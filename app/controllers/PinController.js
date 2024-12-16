const Joi = require("joi");
const { User, PinManagementSchema } = require("../models/DataBaseModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const logger = require("../../utils/logger");

class PinController {
  // Login Validation Schema
  pinDTO = Joi.object({
    userId: Joi.string().required(),
    packageId: Joi.string().required(),
  });

  // Validation schema for userId
  getUserPinsDTO = Joi.object({
    userId: Joi.string().required(),
  });

  // Function to generate a random PIN of 10 characters (numbers and letters)
  generatePIN() {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let pin = "";
    for (let i = 0; i < 10; i++) {
      pin += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return pin;
  }

  // Function to generate PIN for admin and save it in the PinManagement model
  async generatePinAndSave(pinDTO) {
    try {
      const { userId, packageId } = pinDTO;

      // Step 1: Find user by userId
      const user = await User.findById(userId);

      if (!user) {
        logger.error(`User not found with userId: ${userId}`);
        return baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User Not Found"
        );
      }

      // Step 2: Check if the user is an admin
      if (user.userType !== "Admin") {
        logger.error(`User with userId: ${userId} is not an admin`);
        return baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User is not an admin"
        );
      }

      // Step 3: Generate a new PIN
      const pin = this.generatePIN();

      // Step 4: Create a new PinManagement document
      const pinManagement = new PinManagementSchema({
        pinCode: pin,
        generatedBy: user.userId,
        packageId: packageId,
        assignedTo: null, // You can assign it later if needed
        status: "available", // Default status is 'available'
        validityDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // Set validity date to 35 days from now
      });

      // Save the PinManagement document
      await pinManagement.save();
      logger.info(`PIN generated and saved successfully for userId: ${userId}`);
      return baseResponse.successResponse(
        "PIN generated and saved successfully"
      );
    } catch (error) {
      logger.error(`Error occurred while generating PIN: ${error.message}`);
      return baseResponse.errorResponseWithData(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Something Went Wrong"
      );
    }
  }

  // Endpoint to generate PIN and return it
  async generatePin(req, res) {
    const { userId, packageId } = req.body;

    // Validate the request body using Joi
    const { error } = this.pinDTO.validate(req.body);
    if (error) {
      logger.error(
        `Validation failed for userId: ${userId} - ${error.details[0].message}`
      );
      return res.status(400).json({ error: error.details[0].message });
    }

    // Call generatePinAndSave with the validated DTO
    const result = await this.generatePinAndSave({ userId, packageId });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    } else {
      logger.info(`PIN generated successfully for userId: ${userId}`);
      return res.status(200).json({
        pin: result.pin,
        message: result.message,
      });
    }
  }

  // get all pin for a user
  async getAllPinsByUser(req, res) {
    const { userId } = req.params;

    // Validate userId
    const { error } = this.getUserPinsDTO.validate({ userId });
    if (error) {
      logger.error(
        `Validation failed for userId: ${userId} - ${error.details[0].message}`
      );
      return baseResponse.errorResponseWithData(
        StatusCodes.BAD_REQUEST,
        error.details[0].message
      );
    }

    try {
      // Step 1: Fetch all pins where userId matches generatedBy or assignedTo
      const pins = await PinManagementSchema.find({
        $or: [{ generatedBy: userId }, { assignedTo: userId }],
      });

      // Step 2: Check if no pins are found
      if (pins.length === 0) {
        logger.info(`No pins found for userId: ${userId}`);
        return baseResponse.errorResponseWithData(
          StatusCodes.NOT_FOUND,
          "No pins found for this user"
        );
      }

      // Step 3: Return the pins to the user
      logger.info(`Pins fetched successfully for userId: ${userId}`);
      return baseResponse.successResponseWithData("Pins fetched successfully", {
        pins,
      });
    } catch (error) {
      logger.error(
        `Error occurred while fetching pins for userId: ${userId} - ${error.message}`
      );
      return baseResponse.errorResponseWithData(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "An error occurred while fetching the pins"
      );
    }
  }

  async transferPin(req, res) {
    const { userId, pin } = req.body;

    // Validate input
    if (!userId || !pin) {
      logger.error("userId and pin are required for transfer");
      return baseResponse.errorResponseWithData(
        StatusCodes.BAD_REQUEST,
        "userId and pin are required"
      );
    }

    try {
      // Step 1: Check if the pin exists and is not used or transferred
      const pinRecord = await PinManagementSchema.findOne({ pinCode: pin });
      if (!pinRecord) {
        logger.error(`Pin not found: ${pin}`);
        return baseResponse.errorResponseWithData(
          StatusCodes.NOT_FOUND,
          "Pin not found"
        );
      }

      if (pinRecord.status === "used" || pinRecord.status === "transferred") {
        logger.error(`Pin is already used or transferred: ${pin}`);
        return baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "Pin is already used or transferred"
        );
      }

      // Step 2: Check if the user exists
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User not found with userId: ${userId}`);
        return baseResponse.errorResponseWithData(
          StatusCodes.NOT_FOUND,
          "User not found"
        );
      }

      // Step 3: Check if the user is valid to receive the pin
      if (user.userType !== "User") {
        logger.error(
          `User with userId: ${userId} is not eligible to receive pin`
        );
        return baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User is not eligible to receive pin"
        );
      }

      // Step 4: Update the PinManagement document
      pinRecord.assignedTo = userId;
      pinRecord.status = "transferred";
      await pinRecord.save();

      // Step 5: Log the transfer in PinTransferHistory
      const transferHistory = new PinTransferHistorySchema({
        pin: pinRecord._id,
        fromUser: pinRecord.generatedBy,
        toUser: userId,
        transferDate: new Date(),
      });
      await transferHistory.save();

      logger.info(
        `Pin transferred successfully from ${pinRecord.generatedBy} to ${userId}`
      );

      // Step 6: Return success response
      return baseResponse.successResponseWithData(
        "Pin transferred successfully",
        {
          pin: pinRecord._id,
          fromUser: pinRecord.generatedBy,
          toUser: userId,
        }
      );
    } catch (error) {
      logger.error(`Error occurred during pin transfer: ${error.message}`);
      return baseResponse.errorResponseWithData(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "An error occurred while transferring the pin"
      );
    }
  }
}

module.exports = new PinController();
