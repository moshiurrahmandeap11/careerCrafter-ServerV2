const express = require("express");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const settingsCollection = db.collection("settings");

  // Get all settings
  router.get("/", async (req, res) => {
    try {
      const settings = await settingsCollection.findOne({});
      if (!settings) {
        return res.status(404).json({ message: "Settings not found" });
      }
      res.status(200).json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings", error: error.message });
    }
  });

  // Get general settings
  router.get("/general", async (req, res) => {
    try {
      const settings = await settingsCollection.findOne({});
      if (!settings || !settings.general) {
        return res.status(404).json({ message: "General settings not found" });
      }
      res.status(200).json(settings.general);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch general settings", error: error.message });
    }
  });

  // Get SEO settings
  router.get("/seo", async (req, res) => {
    try {
      const settings = await settingsCollection.findOne({});
      if (!settings || !settings.seo) {
        return res.status(404).json({ message: "SEO settings not found" });
      }
      res.status(200).json(settings.seo);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SEO settings", error: error.message });
    }
  });

  // Create or Update general settings
  router.post("/general", async (req, res) => {
    try {
      const { siteName, siteDescription, contactEmail, footerText } = req.body;

      // Validation
      if (!siteName && !siteDescription && !contactEmail && !footerText) {
        return res.status(400).json({ message: "At least one field is required" });
      }

      const generalData = {
        siteName: siteName || "",
        siteDescription: siteDescription || "",
        contactEmail: contactEmail || "",
        footerText: footerText || "",
        updatedAt: new Date()
      };

      // Check if settings exist
      const existingSettings = await settingsCollection.findOne({});

      if (existingSettings) {
        // Update existing general settings
        const result = await settingsCollection.updateOne(
          { _id: existingSettings._id },
          { $set: { general: generalData } }
        );
        res.status(200).json({ message: "General settings updated successfully", result });
      } else {
        // Create new settings with general data
        const newSettings = {
          general: generalData,
          createdAt: new Date()
        };
        const result = await settingsCollection.insertOne(newSettings);
        res.status(201).json({ message: "General settings created successfully", result });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to save general settings", error: error.message });
    }
  });

  // Create or Update SEO settings
  router.post("/seo", async (req, res) => {
    try {
      const { metaTitle, metaDescription, metaKeywords, ogImage } = req.body;

      // Validation
      if (!metaTitle && !metaDescription && !metaKeywords && !ogImage) {
        return res.status(400).json({ message: "At least one field is required" });
      }

      const seoData = {
        metaTitle: metaTitle || "",
        metaDescription: metaDescription || "",
        metaKeywords: metaKeywords || "",
        ogImage: ogImage || "",
        updatedAt: new Date()
      };

      // Check if settings exist
      const existingSettings = await settingsCollection.findOne({});

      if (existingSettings) {
        // Update existing SEO settings
        const result = await settingsCollection.updateOne(
          { _id: existingSettings._id },
          { $set: { seo: seoData } }
        );
        res.status(200).json({ message: "SEO settings updated successfully", result });
      } else {
        // Create new settings with SEO data
        const newSettings = {
          seo: seoData,
          createdAt: new Date()
        };
        const result = await settingsCollection.insertOne(newSettings);
        res.status(201).json({ message: "SEO settings created successfully", result });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to save SEO settings", error: error.message });
    }
  });

  // Update any specific setting field
  router.patch("/:category/:field", async (req, res) => {
    try {
      const { category, field } = req.params;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ message: "Value is required" });
      }

      if (!['general', 'seo'].includes(category)) {
        return res.status(400).json({ message: "Invalid category. Must be 'general' or 'seo'" });
      }

      const updatePath = `${category}.${field}`;
      const updateData = {
        [updatePath]: value,
        [`${category}.updatedAt`]: new Date()
      };

      const result = await settingsCollection.updateOne(
        {},
        { $set: updateData },
        { upsert: true }
      );

      res.status(200).json({ message: `${field} updated successfully`, result });
    } catch (error) {
      res.status(500).json({ message: "Failed to update setting", error: error.message });
    }
  });

  // Delete all settings
  router.delete("/", async (req, res) => {
    try {
      const result = await settingsCollection.deleteMany({});
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "No settings found to delete" });
      }
      res.status(200).json({ message: "Settings deleted successfully", result });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete settings", error: error.message });
    }
  });

  // Delete specific category settings
  router.delete("/:category", async (req, res) => {
    try {
      const { category } = req.params;

      if (!['general', 'seo'].includes(category)) {
        return res.status(400).json({ message: "Invalid category. Must be 'general' or 'seo'" });
      }

      const result = await settingsCollection.updateOne(
        {},
        { $unset: { [category]: "" } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "Settings not found" });
      }

      res.status(200).json({ message: `${category} settings deleted successfully`, result });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category settings", error: error.message });
    }
  });

  return router;
};