const bcrypt = require("bcryptjs");
const { User } = require("../models/DataBaseModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const JwtTokenUtil = require("../../middleware/JwtTokenUtil");
const mongoose = require("mongoose");
const Joi = require("joi"); // Assuming Joi is used for validation

class AuthController {
  // User Registration Validation Schema
  registerSchema = Joi.object({
    name: Joi.string().required(),
    mobileNumber: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    referralCode: Joi.string().required(),
    pin: Joi.string().required(),
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
    const { error, value } = this.registerSchema.validate(req.body);
    if (error) {
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
        $or: [{ mobileNumber }, { email }],
      });

      if (existingUser) {
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

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const newUser = new User({
        name,
        mobileNumber,
        email,
        password: hashedPassword,
        referralCode: this.generateReferralCode(),
        parentReferralCode: referralParent.referralCode,
        status: "active",
      });

      // Save the new user
      await newUser.save({ session });

      // Update Pin Status
      pinDetails.status = "used";
      pinDetails.assignedTo = newUser._id;
      await pinDetails.save({ session });

      // Save Referral Tracking
      const referralTracking = new ReferralTracking({
        referrer: referralParent._id,
        referred: newUser._id,
      });
      await referralTracking.save({ session });

      // Initialize Wallet for New User
      const wallet = new Wallet({ user: newUser._id });
      await wallet.save({ session });

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

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
      // Rollback transaction
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
    const { error, value } = this.loginSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find user by mobileNumber
      const existingUser = await User.findOne(
        { mobileNumber: value.username },
        null,
        { session }
      );

      if (!existingUser) {
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

      // Verify password using bcrypt
      const isPasswordValid = await this.verifyPassword(
        value.password,
        existingUser.password
      );

      if (!isPasswordValid) {
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

      // Generate JWT token
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
      // Rollback the transaction in case of an error
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
      // Compare input password with stored hashed password
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
