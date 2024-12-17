const bcrypt = require("bcryptjs");
const {
  User,
  PinManagement,
  ReferralTracking,
  Wallet,
} = require("../models/DataBaseModel");
const PackageModel = require("../models/PackageModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const JwtTokenUtil = require("../../middleware/JwtTokenUtil");
const mongoose = require("mongoose");
const logger = require("../../utils/logger");
const Joi = require("joi"); // Assuming Joi is used for validation

class AuthController {
  // User Registration Validation Schema
  registerSchema = Joi.object({
    referralCode: Joi.string().required(),
    pin: Joi.string().required(),
    name: Joi.string().required(),
    mobileNumber: Joi.string()
      .pattern(/^[6-9]\d{9}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Invalid mobile number. It must be a 10-digit number starting with 6, 7, 8, or 9.",
        "any.required": "Mobile number is required.",
      }),
    email: Joi.string().email().optional().messages({
      "string.email": "Invalid email format.",
    }),
    password: Joi.string().min(6).required(),
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
      return res.status(200).send(
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

  async registerUser(req, res) {
    logger.info("Received request for user registration.");

    // Validate input schema
    const { error, value } = this.registerSchema.validate(req.body);
    if (error) {
      logger.warn(`Validation error: ${error.details[0].message}`);
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

    const { referralCode, pin, name, mobileNumber, email, password } = req.body;

    // Start a database session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check for existing user
      const existingUser = await User.findOne({
        $or: [{ mobileNumber: value.mobileNumber }, { email: value.email }],
      });
      if (existingUser) {
        logger.warn(
          "User already exists with provided mobile number or email."
        );
        throw new Error("User already exists with this mobile number or email");
      }

      // Validate referral code
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        throw new Error("Invalid referral code");
      }

      // Validate pin
      // const pinDetails = await PinManagement.findOne({
      //   pinCode: pin,
      //   assignedTo: referrer._id,
      // });

      const pinDetails = await PinManagement.findOne({
        pinCode: pin,
      });

      if (!pinDetails || pinDetails.status === "used") {
        throw new Error("Invalid or used pin");
      }

      // Hash the password at the start
      logger.info("Hashing password.");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Determine referral parent dynamically
      let referralParent = await this.getReferralParent(referrer);

      // Create the new user
      const newUser = new User({
        name,
        mobileNumber,
        email,
        password: hashedPassword,
        referralCode: this.generateReferralCode(),
        parentReferralCode: referralParent._id,
        status: "active",
      });

      // Save the new user and update referral tracking
      await newUser.save({ session });
      await ReferralTracking.create(
        [{ referrer: referralParent._id, referred: newUser._id }],
        { session }
      );

      // Update referrer wallet and rank
      await this.updateReferrerWallet(referralParent._id, pinDetails, session);

      await PinManagement.updateOne(
        { _id: pinDetails._id },
        { $set: { status: "used", updatedAt: new Date() } },
        { session } // Include session to ensure it's part of the transaction
      );

      // Commit transaction
      await session.commitTransaction();
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
      logger.error(`Error during registration: ${error.message}`);
      await session.abortTransaction();
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.message));
    } finally {
      session.endSession();
    }
  }

  // Helper Method: Determine referral parent
  async getReferralParent(referrer) {
    const referrerChildren = await ReferralTracking.find({
      referrer: referrer._id,
    });
    if (referrerChildren.length >= 5) {
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
            "referralDetails.5": { $exists: false }, // Users with fewer than 5 referrals
          },
        },
        { $limit: 1 },
      ]);

      if (eligibleChild.length > 0) {
        return eligibleChild[0];
      } else {
        return referrer; // Fallback explicitly stated
      }
    } else {
      return referrer; // Referrer has fewer than 5 children
    }
  }

  // Helper Method: Update Referrer Wallet and Rank
  async updateReferrerWallet(referrerId, pinDetails, session) {
    const bonusAmount = 10; // Define bonus amount
    // Fetch the package details using packageId from pinDetails
    const packageDetails = await PackageModel.findOne({
      _id: pinDetails.packageId,
    });

    // Use the package directIncome or fallback to the default bonusAmount
    const directIncome = packageDetails
      ? packageDetails.directIncome
      : bonusAmount;

    let wallet = await Wallet.findOne({ user: referrerId });

    if (!wallet) {
      wallet = new Wallet({
        user: referrerId,
        directReferralIncome: directIncome,
      });
      await wallet.save({ session });
    } else {
      await Wallet.findOneAndUpdate(
        { user: referrerId },
        {
          $inc: { directReferralIncome: directIncome },
          $set: { updatedAt: new Date() },
        },
        { session }
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
        userType: existingUser.userType,
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
          referralCode: existingUser.referralCode,
        },
        token,
      };

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      // Return success response
      return res
        .status(200)
        .send(
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
      console.error("Password verification error:", error);
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
