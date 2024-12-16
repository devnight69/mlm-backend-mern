const bcrypt = require('bcryptjs');
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
    password: Joi.string().required()
  });

  // User Registration Method
  async registerUser(req, res) {
    const { error, value } = this.registerSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send(
          baseResponse.errorResponseWithData(
            StatusCodes.BAD_REQUEST,
            "User already exists with this mobile number or email"
          )
        );
      }

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(value.password, salt);

      // Create new user
      const newUser = new User({
        name: value.name,
        mobileNumber: value.mobileNumber,
        email: value.email,
        password: hashedPassword,
        referralCode: this.generateReferralCode(),
        status: 'active'
      });

      // Save the user
      await newUser.save({ session });

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      return res.status(201).send(
        baseResponse.successResponseWithMessage(
          "User registered successfully",
          { 
            userId: newUser._id, 
            name: newUser.name, 
            mobileNumber: newUser.mobileNumber 
          }
        )
      );
    } catch (error) {
      // Rollback transaction
      await session.abortTransaction();
      session.endSession();

      return res.status(500).send(
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
        return res.status(400).send(
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
        return res.status(401).send(
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
        email: existingUser.email
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
      // Rollback the transaction in case of an error
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
      // Compare input password with stored hashed password
      return await bcrypt.compare(inputPassword, hashedPassword);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  // Generate Unique Referral Code
  generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let referralCode = '';
    
    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      referralCode += characters[randomIndex];
    }
    
    return referralCode;
  }
}

module.exports = new AuthController();