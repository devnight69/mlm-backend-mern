const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const Joi = require("joi");

// Models
const { User } = require("../models/DataBaseModel");

// Utilities
const BaseResponse = require("../../response/BaseResponse");
const JwtTokenUtil = require("../../middleware/JwtTokenUtil");

// User Request DTO Validation
const userRequestDto = Joi.object({
  name: Joi.string().required().max(100),
  mobileNumber: Joi.string()
    .required()
    .pattern(/^[0-9]{10}$/),
  email: Joi.string().email().required(),
  password: Joi.string().required().min(6).max(255),
  gender: Joi.string().valid("M", "F"),
  husbandName: Joi.string().optional(),
  fatherName: Joi.string().optional(),
  referralCode: Joi.string().optional(),
});

class UserService {
  // Generate Unique Referral Code
  generateReferralCode() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from(
      { length: 8 },
      () => characters[Math.floor(Math.random() * characters.length)]
    ).join("");
  }

  async createUser(userDto) {
    console.log("[UserService] Starting user creation process.");
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log("[UserService] Checking if user already exists.");
      const existingUser = await User.findOne(
        {
          $or: [
            { mobileNumber: userDto.mobileNumber },
            { email: userDto.email },
          ],
        },
        null,
        { session }
      );

      if (existingUser) {
        console.warn("[UserService] User already exists.");
        await session.abortTransaction();
        session.endSession();
        return BaseResponse.errorResponseWithData(
          StatusCodes.BAD_REQUEST,
          "User with this mobile number or email already exists."
        );
      }

      console.log("[UserService] Hashing password.");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userDto.password, salt);

      console.log("[UserService] Generating referral code.");
      const referralCode = this.generateReferralCode();

      console.log("[UserService] Creating new user.");
      const newUser = new User({
        ...userDto,
        password: hashedPassword,
        referralCode,
        status: "active",
      });

      await newUser.save({ session });

      console.log("[UserService] Preparing token payload.");
      const tokenPayload = {
        id: newUser._id,
        name: newUser.name,
        mobileNumber: newUser.mobileNumber,
        email: newUser.email,
        referralCode: newUser.referralCode,
      };

      console.log("[UserService] Generating token.");
      const token = JwtTokenUtil.createToken(tokenPayload);

      const responseData = {
        user: {
          id: newUser._id,
          name: newUser.name,
          mobileNumber: newUser.mobileNumber,
          email: newUser.email,
          referralCode: newUser.referralCode,
          status: newUser.status,
        },
        token,
      };

      await session.commitTransaction();
      session.endSession();

      console.log("[UserService] User created successfully.");
      return BaseResponse.successResponseWithMessage(
        "User created successfully",
        responseData
      );
    } catch (error) {
      console.error(
        `[UserService] Error during user creation: ${error.message}`
      );
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
    console.log("[UserService] Retrieving all users.");
    return await User.find(
      {},
      {
        password: 0,
        __v: 0,
      }
    );
  }

  async getUserById(userId) {
    console.log(`[UserService] Retrieving user by ID: ${userId}`);
    return await User.findById(userId, {
      password: 0,
      __v: 0,
    });
  }

  async updateUser(userId, userDto) {
    console.log(`[UserService] Updating user with ID: ${userId}`);

    if (userDto.password) {
      console.log("[UserService] Hashing updated password.");
      const salt = await bcrypt.genSalt(10);
      userDto.password = await bcrypt.hash(userDto.password, salt);
    }

    return await User.findByIdAndUpdate(userId, userDto, {
      new: true,
      fields: { password: 0, __v: 0 },
    });
  }

  async deleteUser(userId) {
    console.log(`[UserService] Deleting user with ID: ${userId}`);
    return await User.findByIdAndDelete(userId);
  }
}

class UserController {
  constructor() {
    this.userService = new UserService();
  }

  async createUser(req, res) {
    console.log("[UserController] Received request to create user.");

    try {
      const { error, value } = userRequestDto.validate(req.body);
      if (error) {
        console.warn(
          `[UserController] Validation error: ${error.details[0].message}`
        );
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: error.details[0].message,
        });
      }

      const result = await this.userService.createUser(value);
      const statusCode =
        result.status === "success"
          ? StatusCodes.CREATED
          : StatusCodes.BAD_REQUEST;

      console.log(`[UserController] User creation result: ${result.status}`);
      res.status(statusCode).json(result);
    } catch (err) {
      console.error(`[UserController] Internal server error: ${err.message}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Internal server error",
        error: err.message,
      });
    }
  }

  async getAllUsers(req, res) {
    console.log("[UserController] Received request to retrieve all users.");

    try {
      const users = await this.userService.getAllUsers();
      res.status(StatusCodes.OK).json(users);
    } catch (err) {
      console.error(`[UserController] Error retrieving users: ${err.message}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to retrieve users",
        error: err.message,
      });
    }
  }

  async getUserById(req, res) {
    console.log(
      `[UserController] Received request to retrieve user by ID: ${req.params.id}`
    );

    try {
      const user = await this.userService.getUserById(req.params.id);

      if (!user) {
        console.warn("[UserController] User not found.");
        return res.status(StatusCodes.NOT_FOUND).json({
          message: "User not found",
        });
      }

      res.status(StatusCodes.OK).json(user);
    } catch (err) {
      console.error(`[UserController] Error retrieving user: ${err.message}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to retrieve user",
        error: err.message,
      });
    }
  }

  async updateUser(req, res) {
    console.log(
      `[UserController] Received request to update user with ID: ${req.params.id}`
    );

    try {
      const { error, value } = userRequestDto.validate(req.body);
      if (error) {
        console.warn(
          `[UserController] Validation error: ${error.details[0].message}`
        );
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: error.details[0].message,
        });
      }

      const updatedUser = await this.userService.updateUser(
        req.params.id,
        value
      );

      if (!updatedUser) {
        console.warn("[UserController] User not found for update.");
        return res.status(StatusCodes.NOT_FOUND).json({
          message: "User not found",
        });
      }

      res.status(StatusCodes.OK).json({
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (err) {
      console.error(`[UserController] Error updating user: ${err.message}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to update user",
        error: err.message,
      });
    }
  }

  async deleteUser(req, res) {
    try {
      const deletedUser = await this.userService.deleteUser(req.params.id);

      if (!deletedUser) {
        return res.status(StatusCodes.NOT_FOUND).json({
          message: "User not found",
        });
      }

      res.status(StatusCodes.OK).json({
        message: "User deleted successfully",
      });
    } catch (err) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Failed to delete user",
        error: err.message,
      });
    }
  }

  // Fetch User Details by Mobile Number or Email
  async getUserDetails(req, res) {
    const { mobileNumber, email } = req.query;

    try {
      // Ensure at least one parameter is provided
      if (!mobileNumber && !email) {
        return res
          .status(400)
          .send(
            BaseResponse.errorResponseWithMessage(
              "Please provide a mobile number or email"
            )
          );
      }

      // Find the user based on mobile number or email
      const user = await User.findOne({
        $or: [{ mobileNumber }, { email }],
      });

      if (!user) {
        return res
          .status(404)
          .send(
            BaseResponse.errorResponseWithMessage(
              "User not found with the provided details"
            )
          );
      }

      // Return user details
      return res.status(200).send(
        BaseResponse.successResponseWithMessage(
          "User details fetched successfully",
          {
            name: user.name,
            mobileNumber: user.mobileNumber,
            email: user.email,
            referralCode: user.referralCode,
            userType: user.userType,
            status: user.status,
          }
        )
      );
    } catch (error) {
      return res
        .status(500)
        .send(
          BaseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to fetch user details",
            error
          )
        );
    }
  }
}

module.exports = new UserController();
