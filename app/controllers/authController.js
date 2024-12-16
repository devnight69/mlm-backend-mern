const bcrypt = require("bcryptjs");
const { User } = require("../models/DataBaseModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const JwtTokenUtil = require("../../middleware/JwtTokenUtil");
const mongoose = require("mongoose");
const Joi = require('joi'); // Assuming Joi is used for validation

class AuthController {
  // User Registration Validation Schema
  registerSchema = Joi.object({
    name: Joi.string().required(),
    mobileNumber: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  });

  // Login Validation Schema
  loginSchema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
  });

  // Get User Name by Referral Code
  async getUserNameByReferralCode(req, res) {
    const { referralCode } = req.params;

    try {
      // Find user by referral code
      const user = await User.findOne({ referralCode });

      if (!user) {
        return res
          .status(404)
          .send(
            baseResponse.errorResponseWithMessage(
              "User not found with the provided referral code"
            )
          );
      }

      // Return user's name
      return res
        .status(200)
        .send(
          baseResponse.successResponseWithMessage("User fetched successfully", {
            name: user.name,
          })
        );
    } catch (error) {
      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to fetch user",
            error
          )
        );
    }
  }

  // Updated User Registration Method
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

    const { referralCode, pin, name, mobileNumber, email, password } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ 
        $or: [
          { mobileNumber: value.mobileNumber },
          { email: value.email }
        ]
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

      // Validate Referral Code
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send(baseResponse.errorResponseWithMessage("Invalid referral code"));
      }

      // Check Pin Validity
      const pinDetails = await PinManagement.findOne({
        pinCode: pin,
        assignedTo: referrer._id,
      });

      if (pinDetails && pinDetails.status === "used") {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send(baseResponse.errorResponseWithMessage("Pin is already used"));
      }

      if (!pinDetails) {
        // Proceed if pin is not found but not marked as used
        return res
          .status(400)
          .send(baseResponse.errorResponseWithMessage("Invalid pin"));
      }

      // Assign Referral Level Dynamically
      const referrerChildren = await ReferralTracking.find({
        referrer: referrer._id,
      });
      let referralParent = referrer;

      if (referrerChildren.length >= 5) {
        // Find referrer's child who has not referred 5 users
        const eligibleChild = await User.aggregate([
          {
            $lookup: {
              from: "referraltrackings",
              localField: "_id",
              foreignField: "referrer",
              as: "referralDetails",
            },
          },
          {
            $match: {
              _id: { $in: referrerChildren.map((child) => child.referred) },
              "referralDetails.5": { $exists: false },
            },
          },
          { $limit: 1 },
        ]);

        // If eligible child exists, assign them as the referral parent
        if (eligibleChild.length > 0) {
          referralParent = eligibleChild[0];
        }
      }

      logger.info("Hashing password.");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      logger.info("Creating new user.");
      const newUser = new User({
        name,
        mobileNumber,
        email,
        password: hashedPassword,
        referralCode: this.generateReferralCode(),
        status: 'active'
      });

      // Save the user
      await newUser.save({ session });

      // Commit transaction
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

      // Create token payload
      const plainTokenPayload = { 
        id: existingUser._id,
        name: existingUser.name,
        mobileNumber: existingUser.mobileNumber,
        email: existingUser.email,
      };

      const token = JwtTokenUtil.createToken(plainTokenPayload);

      // Prepare response data
      const responseData = {
        user: {
          id: existingUser._id,
          name: existingUser.name,
          mobileNumber: existingUser.mobileNumber,
          email: existingUser.email,
          status: existingUser.status,
          referralCode: existingUser.referralCode
        },
        token,
      };

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      // Return success response
      return res.status(200).send(
        baseResponse.successResponseWithMessage(
          "User Login successful",
          responseData
        )
      );
    } catch (error) {
      logger.error(`Error during user login: ${error.message}`);
      await session.abortTransaction();
      session.endSession();

      // Return error response
      return res.status(500).send(
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
      console.error('Password verification error:', error);
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
    
    return referralCode;
  }
}

module.exports = new AuthController();
