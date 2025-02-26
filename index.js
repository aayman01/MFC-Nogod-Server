const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xrbh57q.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("MFS");
    const usersCollection = db.collection("users");
    const transactionsCollection = db.collection("transactions");
    const adminCollection = db.collection("admin");

    // Register User or Agent
    app.post("/register", async (req, res) => {
      const { name, mobile, email, pin, accountType, nid } = req.body;
      const hashedPin = await bcrypt.hash(pin, 10);
      const userExists = await usersCollection.findOne({
        $or: [{ mobile }, { email }, { nid }],
      });

      if (userExists)
        return res.status(400).json({ message: "User already exists" });

      const newUser = {
        name,
        mobile,
        email,
        pin: hashedPin,
        accountType,
        nid,
        balance: accountType === "agent" ? 100000 : 40,
      };
      await usersCollection.insertOne(newUser);
      res.status(201).json({ message: "success" });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Nogod is running...");
});

app.listen(port, () => {
  console.log(`my port is running on ${port}`);
});