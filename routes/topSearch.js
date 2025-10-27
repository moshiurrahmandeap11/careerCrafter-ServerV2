const express = require("express");
const admin = require("firebase-admin");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  

const jobsCollection = db.collection("jobs");
const usersCollection = db.collection("users");



 // 🔍 Smart Search Route
  router.get("/search", async (req, res) => {
    try {
      const query = req.query.query;
      if (!query) {
        return res.status(400).json({ message: "Query text is required" });
      }

      const searchRegex = new RegExp(query, "i");

      // parallel search for users and jobs
      const [userResults, jobResults] = await Promise.all([
        usersCollection.find({ fullName: searchRegex }).toArray(),
        jobsCollection
          .find({
            $or: [{ title: searchRegex }, { company: searchRegex }],
          })
          .toArray(),
      ]);

      let type = "unknown";
      let results = [];

      if (userResults.length > 0) {
        type = "user";
        results = userResults;
      } else if (jobResults.length > 0) {
        type = "job";
        results = jobResults;
      }

      res.json({ type, results });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ message: "Server error" });
    }
  })











 

  return router;
};
