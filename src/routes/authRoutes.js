const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const axios = require("axios");
require("dotenv").config();
const { body, validationResult } = require("express-validator");

const router = express.Router();

// Assuming you've already required necessary modules

router.post(
  "/register",
  [
    body("name").not().isEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("guardians_email")
      .isEmail()
      .withMessage("Valid guardian's email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("confirm_password").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
    body("mobile")
      .isMobilePhone()
      .withMessage("Valid mobile number is required"), // New validation for mobile
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, guardians_email, password, mobile } = req.body;
    try {
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ msg: "User already exists this email" });
      }
      let mobileDup = await User.findOne({ mobile });
      if (mobileDup) {
        return res
          .status(400)
          .json({ msg: "User already exists this mobile number" });
      }

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user and save it to the database
      user = new User({
        name,
        email,
        guardians_email,
        password: hashedPassword,
        mobile, // Save mobile number
      });

      await user.save(); // Save the user in the database

      // Create JWT token
      const payload = { user: { id: user.id } };
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.status(201).json({ token });
    } catch (error) {
      console.error(error.message);
      res.status(500).send("Server error");
    }
  }
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").not().isEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ msg: "Invalid credentials" });
      }

      // Compare password with hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: "Invalid credentials" });
      }

      // Create JWT token
      const payload = { user: { id: user.id } };
      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.status(200).json({ token });
    } catch (error) {
      console.error(error.message);
      res.status(500).send("Server error");
    }
  }
);

router.post("/send-otp", async (req, res) => {
  const {
    mobileNumber,
    countryCode = "91",
    flowType = "SMS",
    otpLength = 4,
  } = req.body;

  // Validate the mobile number and other parameters
  if (!mobileNumber) {
    return res.status(400).json({ error: "Mobile number is required" });
  }
  if (!countryCode) {
    return res.status(400).json({ error: "Country code is required" });
  }

  try {
    // Check if the mobile number exists in the database
    const user = await User.findOne({ mobile: mobileNumber });
    if (!user) {
      return res.status(400).json({ error: "Mobile number not registered" });
    }

    // Send POST request to the message central API
    let token = await generateToken();
    console.log("token", token);
    const response = await axios.post(
      `https://cpaas.messagecentral.com/verification/v3/send`,
      null,
      {
        headers: {
          authToken: token.token.token,
        },
        params: {
          countryCode,
          flowType, // 'SMS' or 'WHATSAPP'
          mobileNumber,
          otpLength, // Default is 4, can be between 4 and 8
        },
      }
    );

    // Handle success
    if (response.data) {
      return res.status(200).json({
        message: "OTP sent successfully",
        data: { data: response.data.data, token: token.token.token },
      });
    } else {
      return res
        .status(500)
        .json({ error: "Failed to send OTP", details: response });
    }
  } catch (error) {
    // Handle errors
    return res
      .status(500)
      .json({ error: "Error sending OTP", details: error.message });
  }
});

router.get("/validate-otp", async (req, res) => {
  const { verificationId, code, langId = "en", token } = req.query; // Getting the parameters from query string

  // Validate required parameters
  if (!verificationId) {
    return res.status(400).json({ error: "Verification ID is required" });
  }
  if (!code) {
    return res.status(400).json({ error: "OTP code is required" });
  }

  try {
    // Send GET request to the message-central API to validate the OTP
    const response = await axios.get(
      `https://cpaas.messagecentral.com/verification/v3/validateOtp`,
      {
        headers: {
          authToken: token,
        },
        params: {
          verificationId,
          code,
          langId, // Default is English ('en')
        },
      }
    );

    // Handle success
    if (response.data) {
      return res
        .status(200)
        .json({ message: "OTP validated successfully", data: response.data });
    } else {
      return res
        .status(500)
        .json({ error: "Failed to validate OTP", details: response });
    }
  } catch (error) {
    // Handle errors
    return res
      .status(500)
      .json({ error: "Error validating OTP", details: error.message });
  }
});

const generateToken = async (country = 91, email = "", scope = "NEW") => {
  // Check if process.env.CUSTOMER_ID and key are available
  if (!process.env.CUSTOMER_ID || !process.env.OTP_KEY) {
    throw new Error("Customer ID and encrypted key are required");
  }

  try {
    // Send GET request to generate token
    const response = await axios.get(
      `https://cpaas.messagecentral.com/auth/v1/authentication/token`,
      {
        headers: {
          accept: "*/*",
        },
        params: {
          customerId: process.env.CUSTOMER_ID,
          key: process.env.OTP_KEY,
          scope,
          country,
          email,
        },
      }
    );

    // Handle success response
    if (response.data) {
      return {
        message: "Token generated successfully",
        token: response.data,
      };
    } else {
      throw new Error("Failed to generate token");
    }
  } catch (error) {
    // Handle errors
    throw new Error(`Error generating token: ${error.message}`);
  }
};

module.exports = router;
