const express = require("express");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const logoCollection = db.collection("logo");

  // Get current logo
  router.get("/", async (req, res) => {
    try {
      const logo = await logoCollection.findOne({});
      if (!logo) {
        return res.status(404).json({ message: "Logo not found" });
      }
      res.status(200).json(logo);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch logo", error: error.message });
    }
  });

  // Create or Update logo
  router.post("/", async (req, res) => {
    try {
      const { type, text, imageUrl } = req.body;

      // Validation
      if (!type || !['text', 'image', 'image-text'].includes(type)) {
        return res.status(400).json({ message: "Invalid logo type. Must be 'text', 'image', or 'image-text'" });
      }

      if (type === 'text' && !text) {
        return res.status(400).json({ message: "Text is required for text logo" });
      }

      if (type === 'image' && !imageUrl) {
        return res.status(400).json({ message: "Image URL is required for image logo" });
      }

      if (type === 'image-text' && (!text || !imageUrl)) {
        return res.status(400).json({ message: "Both text and image URL are required for image-text logo" });
      }

      const logoData = {
        type,
        text: text || null,
        imageUrl: imageUrl || null,
        updatedAt: new Date()
      };

      // Check if logo exists
      const existingLogo = await logoCollection.findOne({});

      if (existingLogo) {
        // Update existing logo
        const result = await logoCollection.updateOne(
          { _id: existingLogo._id },
          { $set: logoData }
        );
        res.status(200).json({ message: "Logo updated successfully", result });
      } else {
        // Create new logo
        logoData.createdAt = new Date();
        const result = await logoCollection.insertOne(logoData);
        res.status(201).json({ message: "Logo created successfully", result });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to save logo", error: error.message });
    }
  });

  // Delete logo
  router.delete("/", async (req, res) => {
    try {
      const result = await logoCollection.deleteMany({});
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "No logo found to delete" });
      }
      res.status(200).json({ message: "Logo deleted successfully", result });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete logo", error: error.message });
    }
  });

  return router;
};