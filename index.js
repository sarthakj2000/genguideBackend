const express = require("express");
const app = express();
const connectDB = require("./src/config/db");
connectDB();
const port = 5000;
app.use(express.json());
app.use("/api/auth", require("./src/routes/authRoutes"));
app.listen(port, () => {
  console.log("server is running");
});
