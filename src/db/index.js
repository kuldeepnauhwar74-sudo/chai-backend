import mongoose from "mongoose";
import dns from "node:dns";
import { DB_NAME } from "../constant.js";

// Ensure reliable DNS resolution for MongoDB Atlas SRV connection strings on Windows
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(
            `${process.env.MONGODB_URI}/${DB_NAME}`
        );
        console.log(`\n MongoDB connected !! DB HOST: ${
            connectionInstance.connection.host
        }`);
    } catch (error) {
        console.log("MONGODB connection error ", error);
        process.exit(1);
    }
};

export default connectDB;
