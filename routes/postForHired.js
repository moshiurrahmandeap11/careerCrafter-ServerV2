const express = require("express");
const admin = require("firebase-admin");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const hirderPostCollections = db.collection("postForHired");

//   post in databasse (post for hired)

// Post Hire Request to Database
router.post('/added-hired-post', async (req, res) => {
  try {
    const newPost = {
      ...req.body,
      date: new Date(), // ✅ always store as Date object
    };

    const result = await hirderPostCollections.insertOne(newPost);
    res.send(result);
  } catch (error) {
    console.error("Error adding hired post:", error);
    res.status(500).send({ message: "Failed to add hire post" });
  }
});

// get all post 


router.get('/allpost', async (req, res) => {
  try {
    const { search, location, recent, type } = req.query;

    const query = {};

    // 🔍 Search by title or description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // 📍 Filter by location
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    // 💼 Filter by type (Full-time, Part-time, Remote, etc.)
    if (type) {
      query.type = type;
    }

    // ⏰ Filter by last 24 hours
    if (recent === 'true') {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      query.date = { $exists: true, $gte: last24Hours };
    }

    const posts = await hirderPostCollections
      .find(query)
      .sort({ date: -1 })
      .toArray();

    res.send(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).send({ message: 'Failed to fetch posts' });
  }
});









 

  return router;
};
