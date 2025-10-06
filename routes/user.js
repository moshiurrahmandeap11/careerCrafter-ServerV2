const express = require("express");
const admin = require("firebase-admin");
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


// Delete user by ID (Mongo + Firebase)
  router.delete("/:id", async (req, res) => {
    try {
      const id = req.params.id;

      // find the user in MongoDB first
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Delete from MongoDB
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

      // Firebase Auth delete (if exists)
      if (user.email) {
        try {
          const firebaseUser = await admin.auth().getUserByEmail(user.email);
          if (firebaseUser) {
            await admin.auth().deleteUser(firebaseUser.uid);
            console.log(`✅ Firebase user deleted: ${user.email}`);
          }
        } catch (firebaseError) {
          console.warn(`⚠️ Firebase deletion failed or user not found: ${user.email}`);
        }
      }

      res.status(200).json({ message: "User deleted from MongoDB & Firebase", result });
    } catch (error) {
      console.error("Delete failed:", error);
      res.status(500).json({ message: "Failed to delete user", error: error.message });
    }
  });

  return router;
};
  

