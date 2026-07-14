import mongoose from "mongoose";

const mongoDBUrl =
  process.env.MONGODB_URL || "mongodb://localhost:27017/flexchat";

const connesctionConfig = {
  maxPoolSize: 50,
  minPoolSize: 10,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
};

const connectToMongoDB = async () => {
  try {
    await mongoose.connect(mongoDBUrl, connesctionConfig);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Exit the process with an error code
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost. Attempting to reconnect...");
  connectToMongoDB();
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected successfully.");
});
mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error);
});

export default connectToMongoDB;
