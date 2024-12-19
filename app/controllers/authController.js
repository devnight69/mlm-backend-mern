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

    const { referralCode, pin, name, mobileNumber, email, password } = value;

    // Start a database session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check for existing user
      if (await User.exists({ $or: [{ mobileNumber }, { email }] })) {
        throw new Error("User already exists with this mobile number or email");
      }

      // Validate referral code
      const referrer = await User.findOne({ referralCode });
      if (!referrer) throw new Error("Invalid referral code");

      let pinDetails;

      const query = { pinCode: pin };
      if (referrer.userType !== "Admin") {
        query.assignedTo = referrer._id;
      }

      pinDetails = await PinManagement.findOne(query);

      // Validate pin
      if (!pinDetails || pinDetails.status === "used") {
        throw new Error("Invalid or used pin");
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(
        password,
        await bcrypt.genSalt(10)
      );

      // Determine referral parent
      const referralParent = await this.getReferralParent(referrer);

      // Create the new user
      const newUser = new User({
        name,
        mobileNumber,
        email,
        password: hashedPassword,
        referralCode: mobileNumber,
        parentReferralCode: referralParent._id,
        status: "active",
      });

      // Save user and referral tracking
      await newUser.save({ session });
      await ReferralTracking.create(
        [{ referrer: referralParent._id, referred: newUser._id }],
        { session }
      );

      // Update referral levels and wallet
      await this.updateReferralLevelsAndWallet(
        referralParent,
        referrer,
        pinDetails,
        session
      );

      // Update pin status
      await PinManagement.updateOne(
        { _id: pinDetails._id },
        { $set: { status: "used", updatedAt: new Date() } },
        { session }
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

  /**
   * Helper function to update referral levels and wallets.
   */
  async updateReferralLevelsAndWallet(
    referralParent,
    referrer,
    pinDetails,
    session
  ) {
    // Recalculate levels
    const updatedLevelParent = await this.calculateUserLevel(
      referralParent._id
    );
    const updatedLevelReferrer = await this.calculateReferreUserLevel(
      referrer._id
    );

    // Update referral parent's level and rank
    await User.findByIdAndUpdate(
      referralParent._id,
      { $set: { level: updatedLevelParent, rank: updatedLevelParent } },
      { session }
    );

    logger.info(
      `Updated referral parent level: ${referralParent._id} to Level ${updatedLevelParent}`
    );

    // Update referrer's level and rank
    await User.findByIdAndUpdate(
      referrer._id,
      { $set: { level: updatedLevelReferrer, rank: updatedLevelReferrer } },
      { session }
    );

    logger.info(
      `Updated referrer level: ${referrer._id} to Level ${updatedLevelReferrer}`
    );

    // Update wallet and other metrics
    await this.updateReferrerWallet(
      referralParent._id,
      referrer,
      pinDetails,
      updatedLevelReferrer,
      updatedLevelParent,
      session
    );
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

  async updateReferrerWallet(
    referrerId,
    referral,
    pinDetails,
    updatedLevelReferral,
    updatedLevel,
    session
  ) {
    const packageDetails = await PackageModel.findOne({
      _id: pinDetails.packageId,
    });
    let income = 0;
    let indirectIncome = 0;

    const levelIncomeMap = {
      60: {
        1: 4,
        2: 3,
        3: 2,
        4: 1,
        5: 1,
        6: 1,
        7: 1,
        8: 0.5,
        9: 0.3,
        default: 0.2,
      },
      200: {
        1: 10,
        2: 6,
        3: 4,
        4: 1.5,
        5: 1.5,
        6: 1.5,
        7: 1.5,
        8: 1,
        9: 0.6,
        default: 0.4,
      },
      1300: {
        1: 64,
        2: 48,
        3: 34,
        4: 20,
        5: 20,
        6: 20,
        7: 20,
        8: 10,
        9: 8,
        default: 2,
      },
    };

    const productPrice = Number(packageDetails.productPrice);

    const packageIncome = levelIncomeMap[productPrice] || {};
    income =
      (packageIncome[updatedLevel] || packageIncome.default) +
      packageDetails.directIncome;

    if (referrerId !== referral._id) {
      indirectIncome =
        updatedLevel === updatedLevelReferral
          ? packageIncome[updatedLevelReferral] || packageIncome.default
          : 0;
    }

    const updateWallet = async (userId, incomeField, amount) => {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        const newWallet = new Wallet({ user: userId, [incomeField]: amount });
        await newWallet.save({ session });
      } else {
        await Wallet.findOneAndUpdate(
          { user: userId },
          {
            $inc: { [incomeField]: amount },
            $set: { updatedAt: new Date() },
          },
          { session }
        );
      }
    };

    if (referrerId === referral._id) {
      await updateWallet(referrerId, "directReferralIncome", income);
    } else {
      await updateWallet(
        referral._id,
        "indirectReferralIncome",
        indirectIncome
      );
    }
  }

  // calculate user level function
  async calculateUserLevel(userId) {
    // Fetch direct and indirect referrals in parallel for better performance
    const [directReferrals, indirectReferrals] = await Promise.all([
      ReferralTracking.countDocuments({ referrer: userId }),
      ReferralTracking.countDocuments({
        referrer: { $ne: userId },
        referred: userId,
      }),
    ]);

    console.log(`${directReferrals} directReferrals`);
    console.log(`${indirectReferrals} indirectReferrals`);

    const totalCount = directReferrals + indirectReferrals;
    console.log(`${totalCount} totalCount`);

    // Determine the level based on the thresholds
    if (totalCount >= 9765625) return 10;
    if (totalCount >= 1953125) return 9;
    if (totalCount >= 390625) return 8;
    if (totalCount >= 78125) return 7;
    if (totalCount >= 15625) return 6;
    if (totalCount >= 3125) return 5;
    if (totalCount >= 625) return 4;
    if (totalCount >= 125) return 3;
    if (totalCount >= 25) return 2;

    return 1; // Default level
  }

  // calculate user referre level
  async calculateReferreUserLevel(userId) {
    // Fetch direct and indirect referrals in parallel for better performance
    const [directReferrals, indirectReferrals] = await Promise.all([
      ReferralTracking.countDocuments({ referrer: userId }),
      ReferralTracking.countDocuments({
        referrer: { $ne: userId },
        referred: userId,
      }),
    ]);

    console.log(`${directReferrals} directReferrals`);
    console.log(`${indirectReferrals} indirectReferrals`);

    const totalCount = directReferrals + indirectReferrals;
    console.log(`${totalCount} totalCount`);

    // Determine the level based on the thresholds
    if (totalCount >= 9765625) return 10;
    if (totalCount >= 1953125) return 9;
    if (totalCount >= 390625) return 8;
    if (totalCount >= 78125) return 7;
    if (totalCount >= 15625) return 6;
    if (totalCount >= 3125) return 5;
    if (totalCount >= 625) return 4;
    if (totalCount >= 125) return 3;
    if (totalCount >= 25) return 2;

    return 1; // Default level
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
