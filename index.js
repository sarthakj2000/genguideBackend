const express = require("express");
const app = express();

const connectDB = require("./src/config/db");
connectDB();
app.use(express.json());

app.use("/api/auth", require("./src/routes/authRoutes"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("server is running");
});
