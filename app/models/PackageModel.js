const mongoose = require("mongoose");

const PackageSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
  },
  productPrice: {
    type: String,
    required: true,
  },
  directIncome: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("PackageModel", PackageSchema);
