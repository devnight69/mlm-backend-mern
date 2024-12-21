const Joi = require("joi");
const {
  User,
  PinManagement,
  PinTransferHistory,
} = require("../models/DataBaseModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const logger = require("../../utils/logger");
const PackageModel = require("../models/PackageModel");

class PinController {
  constructor() {
    // Bind methods to the current instance (this) to preserve the context
    this.generatePinAndSave = this.generatePinAndSave.bind(this);
    this.getAllPinsByUser = this.getAllPinsByUser.bind(this);
    this.transferPin = this.transferPin.bind(this);
  }

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
  async generatePinAndSave(req, res) {
    try {
      logger.info("Received request for pin creation.");
      const { error, value } = this.pinDTO.validate(req.body);
      if (error) {
        logger.warn(
          `Validation error during pin creation: ${error.details[0].message}`
        );
        return res
          .status(400)
          .send(
            baseResponse.errorResponseWithMessage(error.details[0].message)
          );
      }

      const { userId, packageId } = req.body;

      console.log("userId PackegeId ", userId, packageId);

      // Step 1: Find user by userId
      const user = await User.findById(userId);

      if (!user) {
        logger.error(`User not found with userId: ${userId}`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User Not Found"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
      }

      // Step 2: Check if the user is an admin
      if (user.userType !== "Admin") {
        logger.error(`User with userId: ${userId} is not an admin`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User is not an admin"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
      }

      // Step 3: Check if the packageId is valid
      const packageDetails = await PackageModel.findById(packageId);
      if (!packageDetails) {
        logger.error(`Package not found with packageId: ${packageId}`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "Invalid Package ID"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
      }

      // Step 4: Generate a new PIN
      const pin = this.generatePIN();

      // Step 5: Create a new PinManagement document
      const pinManagement = new PinManagement({
        pinCode: pin,
        generatedBy: userId,
        packageId: packageId,
        assignedTo: null, // You can assign it later if needed
        status: "available", // Default status is 'available'
        validityDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // Set validity date to 35 days from now
      });

      // Save the PinManagement document
      await pinManagement.save();

      let baseDate =
        user.validTill && user.validTill > new Date()
          ? user.validTill
          : new Date();
      const newValidTill = new Date(
        baseDate.getTime() + 35 * 24 * 60 * 60 * 1000
      );
      user.validTill = newValidTill;
      await user.save();

      logger.info(
        `Admin's validTill updated to ${newValidTill} for userId: ${userId}`
      );

      logger.info(`PIN generated and saved successfully for userId: ${userId}`);
      return res.status(StatusCodes.OK).json({
        message: "PIN generated and saved successfully",
      });
    } catch (error) {
      logger.error(`Error occurred while generating PIN: ${error.message}`);
      const errorResponse = baseResponse.errorResponseWithData(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Something Went Wrong"
      );
      logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
  }

  // Get all pins for a user
  async getAllPinsByUser(req, res) {
    const { userId } = req.params;

    // Validate userId
    const { error } = this.getUserPinsDTO.validate({ userId });
    if (error) {
      logger.error(
        `Validation failed for userId: ${userId} - ${error.details[0].message}`
      );
      const errorResponse = baseResponse.errorResponseWithData(
        StatusCodes.BAD_REQUEST,
        error.details[0].message
      );
      logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
      return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
    }

    try {
      // Step 1: Fetch all pins where userId matches generatedBy or assignedTo
      const pins = await PinManagement.find({
        $or: [{ generatedBy: userId }, { assignedTo: userId }],
      });

      // Step 2: Check if no pins are found
      if (pins.length === 0) {
        logger.info(`No pins found for userId: ${userId}`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.NOT_FOUND,
          "No pins found for this user"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.NOT_FOUND).json(errorResponse);
      }

      // Step 3: Return the pins to the user
      logger.info(`Pins fetched successfully for userId: ${userId}`);
      return res.status(StatusCodes.OK).json({
        message: "Pins fetched successfully",
        data: { pins },
      });
    } catch (error) {
      logger.error(
        `Error occurred while fetching pins for userId: ${userId} - ${error.message}`
      );
      const errorResponse = baseResponse.errorResponseWithData(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "An error occurred while fetching the pins"
      );
      logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
  }

  async transferPin(req, res) {
    const { userId, pin } = req.body;

    // Validate input
    if (!userId || !pin) {
      logger.error("userId and pin are required for transfer");
      const errorResponse = baseResponse.errorResponseWithData(
        StatusCodes.BAD_REQUEST,
        "userId and pin are required"
      );
      logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
      return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
    }

    try {
      // Step 1: Check if the pin exists and is not used or transferred
      const pinRecord = await PinManagement.findOne({ pinCode: pin });
      if (!pinRecord) {
        logger.error(`Pin not found: ${pin}`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.NOT_FOUND,
          "Pin not found"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.NOT_FOUND).json(errorResponse);
      }

      if (pinRecord.status === "used" || pinRecord.status === "transferred") {
        logger.error(`Pin is already used or transferred: ${pin}`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "Pin is already used or transferred"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
      }

      // Step 2: Check if the user exists
      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User not found with userId: ${userId}`);
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.NOT_FOUND,
          "User not found"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.NOT_FOUND).json(errorResponse);
      }

      // Step 3: Check if the user is valid to receive the pin
      if (user.userType !== "User") {
        logger.error(
          `User with userId: ${userId} is not eligible to receive pin`
        );
        const errorResponse = baseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User is not eligible to receive pin"
        );
        logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
        return res.status(StatusCodes.BAD_REQUEST).json(errorResponse);
      }

      // Step 4: Update the PinManagement document
      pinRecord.assignedTo = userId;
      pinRecord.status = "transferred";
      await pinRecord.save();

      // Step 5: Log the transfer in PinTransferHistory
      const transferHistory = new PinTransferHistory({
        pin: pinRecord._id,
        fromUser: pinRecord.generatedBy,
        toUser: userId,
        transferDate: new Date(),
      });
      await transferHistory.save();

      logger.info(
        `Pin transferred successfully from ${pinRecord.generatedBy} to ${userId}`
      );

      const baseDate = user.validTill || new Date();
      const newValidTill = new Date(
        baseDate.getTime() + 35 * 24 * 60 * 60 * 1000
      );
      user.validTill = newValidTill;
      await user.save();

      logger.info(
        `User's validTill updated to ${newValidTill} for userId: ${userId}`
      );

      // Step 6: Return success response
      return res.status(StatusCodes.OK).json({
        message: "Pin transferred successfully",
        data: {
          pin: pinRecord._id,
          fromUser: pinRecord.generatedBy,
          toUser: userId,
        },
      });
    } catch (error) {
      logger.error(`Error occurred during pin transfer: ${error.message}`);
      const errorResponse = baseResponse.errorResponseWithData(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "An error occurred while transferring the pin"
      );
      logger.error(`Sending response: ${JSON.stringify(errorResponse)}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
  }
}

module.exports = new PinController();
