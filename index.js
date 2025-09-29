// ===============================
// Career Crafter Backend Server
// ===============================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

const uri = `mongodb+srv://${user}:${pass}@mdb.26vlivz.mongodb.net/?retryWrites=true&w=majority&appName=MDB`;


// import routes
const userRoutes = require("./routes/user")



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected To MongoDB");

    const db = client.db("careerCrafter")

    // routes
    app.use("/v1/users", userRoutes(db))
    
  

  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
  }
}

run().catch(console.dir);



app.get("/", (req, res) => {
    res.send("Career Crafter running now")
})

app.listen(port, () => {
    console.log(`career Crafter running on port ${port}`);
})
