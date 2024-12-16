const mongoose = require("mongoose");
const PackageModel = require("../models/PackageModel");
const baseResponse = require("../../response/BaseResponse");
const { StatusCodes } = require("http-status-codes");
const logger = require("../../utils/logger");
const Joi = require("joi");

class PackageController {
  // Package Validation Schema
  packageSchema = Joi.object({
    productName: Joi.string().required(),
    productPrice: Joi.string().required(),
    directIncome: Joi.number().positive().precision(2).required(),
  });

  constructor() {
    this.createPackage = this.createPackage.bind(this);
    this.getAllPackages = this.getAllPackages.bind(this);
    this.getPackageById = this.getPackageById.bind(this);
    this.updatePackage = this.updatePackage.bind(this);
    this.deletePackageById = this.deletePackageById.bind(this);
  }

  // Create a New Package
  async createPackage(req, res) {
    logger.info("Received request to create a package.");

    const { error, value } = this.packageSchema.validate(req.body);
    if (error) {
      logger.warn(
        `Validation error during package creation: ${error.details[0].message}`
      );
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

    const { productName, productPrice, directIncome } = value;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existingPackage = await PackageModel.findOne({ productName });
      if (existingPackage) {
        logger.warn(`Package with name '${productName}' already exists.`);
        await session.abortTransaction();
        session.endSession();
        return res
          .status(409) // Conflict
          .send(
            baseResponse.errorResponseWithMessage(
              "A package with the same name already exists."
            )
          );
      }

      // Ensure direct income is stored precisely with 2 decimal places
      const directIncomeInRupees =
        Math.round(parseFloat(directIncome) * 100) / 100;

      logger.info("Creating a new package.");
      const newPackage = new PackageModel({
        productName,
        productPrice,
        directIncome: directIncomeInRupees,
      });

      // Save the package
      await newPackage.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      logger.info(`Package created successfully: ${newPackage._id}`);
      return res.status(201).send(
        baseResponse.successResponseWithMessage(
          "Package created successfully",
          {
            packageId: newPackage._id,
            productName: newPackage.productName,
            productPrice: newPackage.productPrice,
            directIncome: `₹${newPackage.directIncome.toFixed(2)}`,
          }
        )
      );
    } catch (error) {
      logger.error(`Error during package creation: ${error.message}`);
      await session.abortTransaction();
      session.endSession();

      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to create package",
            error
          )
        );
    }
  }

  // Get All Packages
  async getAllPackages(req, res) {
    logger.info("Received request to fetch all packages.");

    try {
      const packages = await PackageModel.find({});
      logger.info("Packages fetched successfully.");

      // Format the packages for response
      const formattedPackages = packages.map((pkg) => ({
        id: pkg._id,
        productName: pkg.productName,
        productPrice: pkg.productPrice,
        directIncome: `₹${pkg.directIncome.toFixed(2)}`,
      }));

      return res
        .status(200)
        .send(
          baseResponse.successResponseWithMessage(
            "Packages fetched successfully",
            formattedPackages
          )
        );
    } catch (error) {
      logger.error(`Error fetching packages: ${error.message}`);
      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to fetch packages",
            error
          )
        );
    }
  }

  // Get a Package by ID
  async getPackageById(req, res) {
    const { id } = req.params;
    logger.info(`Received request to fetch package with ID: ${id}`);

    try {
      const packageDetails = await PackageModel.findById(id);

      if (!packageDetails) {
        logger.warn(`Package not found with ID: ${id}`);
        return res
          .status(404)
          .send(
            baseResponse.errorResponseWithMessage(
              "Package not found with the provided ID"
            )
          );
      }

      logger.info(`Package fetched successfully: ${id}`);
      return res.status(200).send(
        baseResponse.successResponseWithMessage(
          "Package fetched successfully",
          {
            id: packageDetails._id,
            productName: packageDetails.productName,
            productPrice: packageDetails.productPrice,
            directIncome: `₹${packageDetails.directIncome.toFixed(2)}`,
          }
        )
      );
    } catch (error) {
      logger.error(`Error fetching package with ID ${id}: ${error.message}`);
      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to fetch package",
            error
          )
        );
    }
  }

  async updatePackage(req, res) {
    const { id } = req.params;
    logger.info(`Received request to update package with ID: ${id}`);

    const { error, value } = this.packageSchema.validate(req.body);
    if (error) {
      logger.warn(
        `Validation error during package update: ${error.details[0].message}`
      );
      return res
        .status(400)
        .send(baseResponse.errorResponseWithMessage(error.details[0].message));
    }

    const { productName, productPrice, directIncome } = value;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Ensure direct income is stored precisely with 2 decimal places
      const directIncomeInRupees =
        Math.round(parseFloat(directIncome) * 100) / 100;

      const updatedPackage = await PackageModel.findByIdAndUpdate(
        id,
        {
          productName,
          productPrice,
          directIncome: directIncomeInRupees,
        },
        { new: true, session }
      );

      if (!updatedPackage) {
        logger.warn(`Package not found with ID: ${id}`);
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .send(
            baseResponse.errorResponseWithMessage(
              "Package not found with the provided ID"
            )
          );
      }

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      logger.info(`Package updated successfully: ${id}`);
      return res.status(200).send(
        baseResponse.successResponseWithMessage(
          "Package updated successfully",
          {
            id: updatedPackage._id,
            productName: updatedPackage.productName,
            productPrice: updatedPackage.productPrice,
            directIncome: `₹${updatedPackage.directIncome.toFixed(2)}`,
          }
        )
      );
    } catch (error) {
      logger.error(`Error updating package with ID ${id}: ${error.message}`);
      await session.abortTransaction();
      session.endSession();

      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to update package",
            error
          )
        );
    }
  }

  // Delete a Package by ID
  async deletePackageById(req, res) {
    const { id } = req.params;
    logger.info(`Received request to delete package with ID: ${id}`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const deletedPackage = await PackageModel.findByIdAndDelete(id, {
        session,
      });

      if (!deletedPackage) {
        logger.warn(`Package not found for deletion with ID: ${id}`);
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .send(
            baseResponse.errorResponseWithMessage(
              "Package not found with the provided ID"
            )
          );
      }

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      logger.info(`Package deleted successfully: ${id}`);
      return res
        .status(200)
        .send(
          baseResponse.successResponseWithMessage(
            "Package deleted successfully",
            { packageId: id }
          )
        );
    } catch (error) {
      logger.error(`Error deleting package with ID ${id}: ${error.message}`);
      await session.abortTransaction();
      session.endSession();

      return res
        .status(500)
        .send(
          baseResponse.errorResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            "Failed to delete package",
            error
          )
        );
    }
  }
}

const packageController = new PackageController();
module.exports = packageController;
