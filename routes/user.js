const express = require("express");
const { ObjectId } = require("mongodb");

const router = express.Router();

module.exports = (db) => {
  const usersCollection = db.collection("users");

  // Get all users
  router.get("/", async (req, res) => {
    try {
      const users = await usersCollection.find().toArray();
      res.status(200).json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users", error });
    }
  });

  // Get single user by ID
  router.get("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user", error });
    }
  });

  // Get user by email
router.get("/email/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user by email", error });
  }
});



// Create new user
router.post("/", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const newUser = req.body;
    const result = await usersCollection.insertOne(newUser);
    res.status(201).json({ message: "User created successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to create user", error });
  }
});


  // Update user by email
router.patch("/email/:email", async (req, res) => {
  try {
    const email = req.params.email; 
    const updatedUser = req.body;

    const result = await usersCollection.updateOne(
      { email }, // email diye search
      { $set: updatedUser }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user", error });
  }
});


  // Delete user by ID
  router.delete("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(200).json({ message: "User deleted successfully", result });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user", error });
    }
  });

  return router;
};
