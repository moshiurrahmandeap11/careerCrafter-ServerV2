const express = require("express");
const router = express.Router();
module.exports = (db) => {
  const usersCollection = db.collection("users");
  router.get("/usersEmail", async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }
      const usersEmail = await usersCollection
        .find({ email: { $ne: email } })
        .toArray();
      res.status(200).json(usersEmail);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  return router;
};








// createdAt
// : 
// "2025-09-26T20:29:03.312Z"
// creationDate
// : 
// "9/27/2025"
// email
// : 
// "moshiurrahmandeap@gmail.com"
// fullName
// : 
// "Moshiur Rahman"
// profileImage
// : 
// "https://i.ibb.co/FLz5frCK/bg.jpg"
// purpose
// : 
// "find_job"
// role
// : 
// "free user"
// sources
// : 
// ['Friend']
// tags
// : 
// (2) ['MERN Stack Developer', 'JavaScript Developer']
// _id
// : 
// "68d6f78f093505f4c171fe89"