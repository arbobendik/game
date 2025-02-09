"use strict";

import express from "express"; // Import Express module.
import path from "path"; // Import Path module.
import { fileURLToPath } from "url"; // Import fileURLToPath from URL module.

// Determine file and directory paths in ES modules.
const __filename = fileURLToPath(import.meta.url); // Get current file name.
const __dirname = path.dirname(__filename); // Get current directory.

// Create Express app instance.
const app = express();

// Serve static files from the public directory.
app.use(express.static(path.join(__dirname, 'public')));

// Define the root route.
app.get("/", (_req, res) => {
  res.sendFile("loader.html", { root: path.join(__dirname, 'public') });
});

// Define the port on which the server will listen.
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000; // Use environment variable if defined, otherwise default to 3000.

// Start the server.
app.listen(PORT, () => {
  console.log("Server is running on port " + PORT + "."); // Log a message indicating that the server has started.
});
