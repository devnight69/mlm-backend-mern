const express = require("express");
const PackageController = require("../controllers/PackageController");

const router = express.Router();

// Route to create a new package
router.post("/create/package", PackageController.createPackage);

// Route to fetch all packages
router.get("/get/all", PackageController.getAllPackages);

// Route to fetch a package by ID
router.get("/get/:id", PackageController.getPackageById);

// Route to update a package by ID
router.put("/update/:id", PackageController.updatePackage);

// Route to delete a package by ID
router.delete("/delete/:id", PackageController.deletePackageById);

module.exports = router;
