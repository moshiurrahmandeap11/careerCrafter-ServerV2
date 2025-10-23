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
    const newPost = req.body;
    
    const result = await hirderPostCollections.insertOne(newPost);
    res.send(result);
  } catch (error) {
    console.error("Error adding hired post:", error);
    res.status(500).send({ message: "Failed to add hire post" });
  }
});

 

  return router;
};
