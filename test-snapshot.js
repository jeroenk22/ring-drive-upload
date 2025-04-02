import dotenv from "dotenv";
dotenv.config();

import handler from "./api/motion-snapshot.js";

const mockReq = {};
const mockRes = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    console.log(`📦 STATUS ${this.statusCode}:`, data);
  },
};

await handler(mockReq, mockRes);
