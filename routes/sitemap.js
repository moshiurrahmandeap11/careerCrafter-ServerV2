const express = require("express");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const sitemapCollection = db.collection("sitemap");
  const jobsCollection = db.collection("jobs"); // Example: if you have jobs
  const usersCollection = db.collection("users"); // Example: if you have user profiles

  // Get sitemap data
  router.get("/", async (req, res) => {
    try {
      const sitemap = await sitemapCollection.findOne({});
      if (!sitemap) {
        return res.status(404).json({ message: "Sitemap not found" });
      }
      res.status(200).json(sitemap);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sitemap", error: error.message });
    }
  });

  // Generate sitemap
  router.post("/generate", async (req, res) => {
    try {
      const baseUrl = req.body.baseUrl || "https://careercrafter.com";
      
      // Static pages
      const staticPages = [
        { url: `${baseUrl}/`, priority: 1.0, changefreq: "daily" },
        { url: `${baseUrl}/about`, priority: 0.8, changefreq: "monthly" },
        { url: `${baseUrl}/contact`, priority: 0.8, changefreq: "monthly" },
        { url: `${baseUrl}/jobs`, priority: 0.9, changefreq: "daily" },
        { url: `${baseUrl}/companies`, priority: 0.7, changefreq: "weekly" },
      ];

      // Dynamic pages from database
      const jobs = await jobsCollection.find({}).toArray();
      const jobPages = jobs.map(job => ({
        url: `${baseUrl}/jobs/${job._id}`,
        priority: 0.7,
        changefreq: "weekly",
        lastmod: job.updatedAt || job.createdAt
      }));

      // Combine all URLs
      const allUrls = [...staticPages, ...jobPages];

      const sitemapData = {
        urls: allUrls,
        totalUrls: allUrls.length,
        generatedAt: new Date(),
        baseUrl
      };

      // Check if sitemap exists
      const existingSitemap = await sitemapCollection.findOne({});

      if (existingSitemap) {
        // Update existing sitemap
        const result = await sitemapCollection.updateOne(
          { _id: existingSitemap._id },
          { $set: sitemapData }
        );
        res.status(200).json({ 
          message: "Sitemap generated successfully", 
          totalUrls: allUrls.length,
          result 
        });
      } else {
        // Create new sitemap
        const result = await sitemapCollection.insertOne(sitemapData);
        res.status(201).json({ 
          message: "Sitemap created successfully", 
          totalUrls: allUrls.length,
          result 
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to generate sitemap", error: error.message });
    }
  });

  // Get sitemap XML format
  router.get("/xml", async (req, res) => {
    try {
      const sitemap = await sitemapCollection.findOne({});
      
      if (!sitemap || !sitemap.urls) {
        return res.status(404).json({ message: "Sitemap not found" });
      }

      // Generate XML
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      
      sitemap.urls.forEach(page => {
        xml += '  <url>\n';
        xml += `    <loc>${page.url}</loc>\n`;
        if (page.lastmod) {
          xml += `    <lastmod>${new Date(page.lastmod).toISOString().split('T')[0]}</lastmod>\n`;
        }
        xml += `    <changefreq>${page.changefreq || 'weekly'}</changefreq>\n`;
        xml += `    <priority>${page.priority || 0.5}</priority>\n`;
        xml += '  </url>\n';
      });
      
      xml += '</urlset>';

      res.setHeader('Content-Type', 'application/xml');
      res.status(200).send(xml);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate XML sitemap", error: error.message });
    }
  });

  // Delete sitemap
  router.delete("/", async (req, res) => {
    try {
      const result = await sitemapCollection.deleteMany({});
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "No sitemap found to delete" });
      }
      res.status(200).json({ message: "Sitemap deleted successfully", result });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete sitemap", error: error.message });
    }
  });

  return router;
};