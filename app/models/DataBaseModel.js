const mongoose = require("mongoose");

// Users Model
const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      maxlength: 15,
    },
    email: {
      type: String,
      maxlength: 100,
    },
    password: {
      type: String,
      required: true,
      maxlength: 255,
    },
    referralCode: {
      type: String,
      unique: true,
    },
    parentReferralCode: {
      type: String,
    },
    gender: {
      type: String,
      enum: ["M", "F"],
      default: null,
    },
    husbandName: {
      type: String,
      maxlength: 100,
    },
    fatherName: {
      type: String,
      maxlength: 100,
    },
    profilePhoto: {
      type: String,
      maxlength: 255,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    userType: {
      type: String,
      enum: ["Admin", "User"],
      default: "User", // Default to 'User'
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Referral Tracking Model
const ReferralTrackingSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referred: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Pin Management Model
const PinManagementSchema = new mongoose.Schema(
  {
    pinCode: {
      type: String,
      required: true,
      unique: true,
      maxlength: 50,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["available", "used", "transferred"],
      default: "available",
    },
    validityDate: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Bank Details Model
const BankDetailsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    accountNumber: {
      type: String,
      required: true,
      maxlength: 50,
    },
    accountHolderName: {
      type: String,
      required: true,
      maxlength: 100,
    },
    bankName: {
      type: String,
      maxlength: 100,
    },
    branchName: {
      type: String,
      maxlength: 100,
    },
    ifscCode: {
      type: String,
      maxlength: 20,
    },
  },
  {
    timestamps: true,
  }
);

// Address Details Model
const AddressDetailsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    addressLine1: {
      type: String,
      maxlength: 255,
    },
    addressLine2: {
      type: String,
      maxlength: 255,
    },
    city: {
      type: String,
      maxlength: 100,
    },
    state: {
      type: String,
      maxlength: 100,
    },
    pincode: {
      type: String,
      maxlength: 20,
    },
    country: {
      type: String,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  }
);

// Pin Transfer History Model
const PinTransferHistorySchema = new mongoose.Schema(
  {
    pin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PinManagement",
      required: true,
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    transferDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Wallet Model
const WalletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    directReferralIncome: {
      type: Number,
      default: 0,
    },
    indirectReferralIncome: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Create Models
const User = mongoose.model("User", UserSchema);
const ReferralTracking = mongoose.model(
  "ReferralTracking",
  ReferralTrackingSchema
);
const PinManagement = mongoose.model("PinManagement", PinManagementSchema);
const BankDetails = mongoose.model("BankDetails", BankDetailsSchema);
const AddressDetails = mongoose.model("AddressDetails", AddressDetailsSchema);
const PinTransferHistory = mongoose.model(
  "PinTransferHistory",
  PinTransferHistorySchema
);
const Wallet = mongoose.model("Wallet", WalletSchema);

module.exports = {
  User,
  ReferralTracking,
  PinManagement,
  BankDetails,
  AddressDetails,
  PinTransferHistory,
  Wallet,
};
