const express = require("express");
const PackageController = require("../controllers/PackageController");

const router = express.Router();

// Import the authMiddleware
const authMiddleware = require("../../middleware/authMiddleware");

// Route to create a new package
router.post("/create/package", PackageController.createPackage);

// Route to fetch all packages
router.get("/get/all", authMiddleware, PackageController.getAllPackages);

// Route to fetch a package by ID
router.get("/get/:id", authMiddleware, PackageController.getPackageById);

// Route to update a package by ID
router.put("/update/:id", authMiddleware, PackageController.updatePackage);

// Route to delete a package by ID
router.delete(
  "/delete/:id",
  authMiddleware,
  PackageController.deletePackageById
);

module.exports = router;
