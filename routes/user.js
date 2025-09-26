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

  // Create new user
  router.post("/", async (req, res) => {
    try {
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.status(201).json({ message: "User created successfully", result });
    } catch (error) {
      res.status(500).json({ message: "Failed to create user", error });
    }
  });

  // Update user by ID
  router.patch("/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const updatedUser = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
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
