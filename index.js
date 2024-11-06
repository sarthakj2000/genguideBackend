const express = require("express");
const cors = require("cors");

const connectDB = require("./src/config/db");
connectDB();

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("hello");
});
app.use("/api/auth", require("./src/routes/authRoutes"));

// Export the app for Vercel serverless function
module.exports = app;
