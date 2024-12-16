const bcrypt = require("bcryptjs");
const { User } = require("../models/DataBaseModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const JwtTokenUtil = require("../../middleware/JwtTokenUtil");
const mongoose = require("mongoose");
const Joi = require("joi");
const logger = require("../../utils/logger"); // Import the logger

class AuthController {
  // User Registration Validation Schema
  registerSchema = Joi.object({
    name: Joi.string().required(),
    mobileNumber: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  });

  // Login Validation Schema
  loginSchema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
  });

  // User Registration Method
  async registerUser(req, res) {
    logger.info("Received request for user registration.");
    const { error, value } = this.registerSchema.validate(req.body);
    if (error) {
      logger.warn(
        `Validation error during registration: ${error.details[0].message}`
      );
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      logger.info("Checking if user already exists.");
      const existingUser = await User.findOne({
        $or: [{ mobileNumber: value.mobileNumber }, { email: value.email }],
      });

      if (existingUser) {
        logger.warn(
          "User already exists with provided mobile number or email."
        );
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send(
            baseResponse.errorResponseWithData(
              StatusCodes.BAD_REQUEST,
              "User already exists with this mobile number or email"
            )
          );
      }

      logger.info("Hashing password.");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(value.password, salt);

      logger.info("Creating new user.");
      const newUser = new User({
        name: value.name,
        mobileNumber: value.mobileNumber,
        email: value.email,
        password: hashedPassword,
        referralCode: this.generateReferralCode(),
        status: "active",
      });

      await newUser.save({ session });
      await session.commitTransaction();
      session.endSession();

      logger.info(`User registered successfully: ${newUser._id}`);
      return res.status(201).send(
        baseResponse.successResponseWithMessage(
          "User registered successfully",
          {
            userId: newUser._id,
            name: newUser.name,
            mobileNumber: newUser.mobileNumber,
          }
        )
      );
    } catch (error) {
      logger.error(`Error during user registration: ${error.message}`);
      await session.abortTransaction();
      session.endSession();

      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Registration failed",
            error
          )
        );
    }
  }

  // Login Method
  async loginUser(req, res) {
    logger.info("Received request for user login.");
    const { error, value } = this.loginSchema.validate(req.body);
    if (error) {
      logger.warn(`Validation error during login: ${error.details[0].message}`);
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      logger.info("Finding user by mobile number.");
      const existingUser = await User.findOne(
        { mobileNumber: value.username },
        null,
        { session }
      );

      if (!existingUser) {
        logger.warn("User not found for the provided mobile number.");
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send(
            baseResponse.errorResponseWithData(
              StatusCodes.BAD_REQUEST,
              "User Not Found with this mobile number."
            )
          );
      }

      logger.info("Verifying user password.");
      const isPasswordValid = await this.verifyPassword(
        value.password,
        existingUser.password
      );

      if (!isPasswordValid) {
        logger.warn("Invalid credentials provided during login.");
        await session.abortTransaction();
        session.endSession();
        return res
          .status(401)
          .send(
            baseResponse.errorResponseWithData(
              StatusCodes.UNAUTHORIZED,
              "Invalid credentials"
            )
          );
      }

      logger.info("Generating JWT token.");
      const plainTokenPayload = {
        id: existingUser._id,
        name: existingUser.name,
        mobileNumber: existingUser.mobileNumber,
        email: existingUser.email,
      };

      const token = JwtTokenUtil.createToken(plainTokenPayload);

      logger.info(`User login successful: ${existingUser._id}`);
      await session.commitTransaction();
      session.endSession();

      return res.status(200).send(
        baseResponse.successResponseWithMessage("User Login successful", {
          user: {
            id: existingUser._id,
            name: existingUser.name,
            mobileNumber: existingUser.mobileNumber,
            email: existingUser.email,
            status: existingUser.status,
            referralCode: existingUser.referralCode,
          },
          token,
        })
      );
    } catch (error) {
      logger.error(`Error during user login: ${error.message}`);
      await session.abortTransaction();
      session.endSession();

      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Login failed",
            error
          )
        );
    }
  }

  // Password Verification Method
  async verifyPassword(inputPassword, hashedPassword) {
    try {
      return await bcrypt.compare(inputPassword, hashedPassword);
    } catch (error) {
      logger.error(`Password verification error: ${error.message}`);
      return false;
    }
  }

  // Generate Unique Referral Code
  generateReferralCode() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let referralCode = "";

    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      referralCode += characters[randomIndex];
    }

    logger.info(`Generated referral code: ${referralCode}`);
    return referralCode;
  }
}

module.exports = new AuthController();
