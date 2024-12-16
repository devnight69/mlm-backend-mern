const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const Joi = require('joi');

// Models
const { User } = require("../models/DataBaseModel");

// Utilities
const BaseResponse = require("../../response/BaseResponse");
const JwtTokenUtil = require("../../middleware/JwtTokenUtil");

// User Request DTO Validation
const userRequestDto = Joi.object({
  name: Joi.string().required().max(100),
  mobileNumber: Joi.string().required().pattern(/^[0-9]{10}$/),
  email: Joi.string().email().required(),
  password: Joi.string().required().min(6).max(255),
  gender: Joi.string().valid('M', 'F'),
  husbandName: Joi.string().optional(),
  fatherName: Joi.string().optional(),
  referralCode: Joi.string().optional()
});

class UserService {
  // Generate Unique Referral Code
  generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(
      { length: 8 }, 
      () => characters[Math.floor(Math.random() * characters.length)]
    ).join('');
  }

  async createUser(userDto) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check if user exists
      const existingUser = await User.findOne({
        $or: [
          { mobileNumber: userDto.mobileNumber },
          { email: userDto.email }
        ]
      }, null, { session });

      if (existingUser) {
        await session.abortTransaction();
        session.endSession();
        return BaseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User with this mobile number or email already exists."
        );
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userDto.password, salt);

      // Generate referral code
      const referralCode = this.generateReferralCode();

      // Create new user
      const newUser = new User({
        ...userDto,
        password: hashedPassword,
        referralCode,
        status: 'active'
      });

      await newUser.save({ session });

      // Prepare token payload
      const tokenPayload = {
        id: newUser._id,
        name: newUser.name,
        mobileNumber: newUser.mobileNumber,
        email: newUser.email,
        referralCode: newUser.referralCode
      };

      // Generate token
      const token = JwtTokenUtil.createToken(tokenPayload);

      // Prepare response data
      const responseData = {
        user: {
          id: newUser._id,
          name: newUser.name,
          mobileNumber: newUser.mobileNumber,
          email: newUser.email,
          referralCode: newUser.referralCode,
          status: newUser.status
        },
        token,
      };

      await session.commitTransaction();
      session.endSession();

      return BaseResponse.successResponseWithMessage(
        "User created successfully",
        responseData
      );
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      return BaseResponse.errorResponse(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "User creation failed",
        error
      );
    }
  }

  async getAllUsers() {
    return await User.find({}, {
      password: 0,
      __v: 0
    });
  }

  async getUserById(userId) {
    return await User.findById(userId, {
      password: 0,
      __v: 0
    });
  }

  async updateUser(userId, userDto) {
    // If updating password, hash it
    if (userDto.password) {
      const salt = await bcrypt.genSalt(10);
      userDto.password = await bcrypt.hash(userDto.password, salt);
    }

    return await User.findByIdAndUpdate(
      userId, 
      userDto, 
      { 
        new: true,
        fields: { password: 0, __v: 0 }
      }
    );
  }

  async deleteUser(userId) {
    return await User.findByIdAndDelete(userId);
  }
}

class UserController {
  constructor() {
    this.userService = new UserService();
  }

  async createUser(req, res) {
    try {
      // Validate request body
      const { error, value } = userRequestDto.validate(req.body);
      if (error) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: error.details[0].message
        });
      }

      // Create user
      const result = await this.userService.createUser(value);
      
      // Determine status code based on response
      const statusCode = result.status === 'success' 
        ? StatusCodes.CREATED 
        : StatusCodes.BAD_REQUEST;

      res.status(statusCode).json(result);
    } catch (err) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Internal server error',
        error: err.message
      });
    }
  }

  async getAllUsers(req, res) {
    try {
      const users = await this.userService.getAllUsers();
      res.status(StatusCodes.OK).json(users);
    } catch (err) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to retrieve users',
        error: err.message
      });
    }
  }

  async getUserById(req, res) {
    try {
      const user = await this.userService.getUserById(req.params.id);
      
      if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json({
          message: 'User not found'
        });
      }

      res.status(StatusCodes.OK).json(user);
    } catch (err) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to retrieve user',
        error: err.message
      });
    }
  }

  async updateUser(req, res) {
    try {
      // Validate request body
      const { error, value } = userRequestDto.validate(req.body);
      if (error) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: error.details[0].message
        });
      }

      // Update user
      const updatedUser = await this.userService.updateUser(req.params.id, value);
      
      if (!updatedUser) {
        return res.status(StatusCodes.NOT_FOUND).json({
          message: 'User not found'
        });
      }

      res.status(StatusCodes.OK).json({
        message: 'User updated successfully',
        user: updatedUser
      });
    } catch (err) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to update user',
        error: err.message
      });
    }
  }

  async deleteUser(req, res) {
    try {
      const deletedUser = await this.userService.deleteUser(req.params.id);
      
      if (!deletedUser) {
        return res.status(StatusCodes.NOT_FOUND).json({
          message: 'User not found'
        });
      }

      res.status(StatusCodes.OK).json({
        message: 'User deleted successfully'
      });
    } catch (err) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to delete user',
        error: err.message
      });
    }
  }
}

module.exports = new UserController();