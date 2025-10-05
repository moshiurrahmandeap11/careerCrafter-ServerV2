const express = require("express");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const faviconCollection = db.collection("favicon");

  // Get current favicon
  router.get("/", async (req, res) => {
    try {
      const favicon = await faviconCollection.findOne({});
      if (!favicon) {
        return res.status(404).json({ message: "Favicon not found" });
      }
      res.status(200).json(favicon);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favicon", error: error.message });
    }
  });

  // Create or Update favicon
  router.post("/", async (req, res) => {
    try {
      const { imageUrl } = req.body;

      // Validation
      if (!imageUrl) {
        return res.status(400).json({ message: "Image URL is required" });
      }

      const faviconData = {
        imageUrl,
        updatedAt: new Date()
      };

      // Check if favicon exists
      const existingFavicon = await faviconCollection.findOne({});

      if (existingFavicon) {
        // Update existing favicon
        const result = await faviconCollection.updateOne(
          { _id: existingFavicon._id },
          { $set: faviconData }
        );
        res.status(200).json({ message: "Favicon updated successfully", result });
      } else {
        // Create new favicon
        faviconData.createdAt = new Date();
        const result = await faviconCollection.insertOne(faviconData);
        res.status(201).json({ message: "Favicon created successfully", result });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to save favicon", error: error.message });
    }
  });

  // Delete favicon
  router.delete("/", async (req, res) => {
    try {
      const result = await faviconCollection.deleteMany({});
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "No favicon found to delete" });
      }
      res.status(200).json({ message: "Favicon deleted successfully", result });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete favicon", error: error.message });
    }
  });

  return router;
};