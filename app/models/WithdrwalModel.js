const mongoose = require("mongoose");

// Withdrawal Request Model
const WithdrawalRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amountRequested: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending",
    },
    approvalDate: {
      type: Date,
    },
    deductionAmount: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
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

const WithdrawalRequest = mongoose.model(
  "WithdrawalRequest",
  WithdrawalRequestSchema
);

module.exports = WithdrawalRequest;
