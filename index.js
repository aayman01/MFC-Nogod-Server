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

    function authenticateToken(req, res, next) {
      const token = req.header("Authorization")?.split(" ")[1];
      if (!token) return res.status(401).json({ message: "Access denied" });
      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = user;
        next();
      });
    }

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


    app.post("/login", async (req, res) => {
      const { identifier, pin } = req.body; // Single identifier field
      // console.log(identifier,pin)

      let user;
      let isEmail = false; 

      // Regular expressions to check if it's an email or a mobile number
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; 
      const mobileRegex = /^[0-9]{11}$/; 

      if (emailRegex.test(identifier)) {
        isEmail = true;
        user = await usersCollection.findOne({ email: identifier });
      } else if (mobileRegex.test(identifier)) {
        user = await usersCollection.findOne({ mobile: identifier });
      } else {
        return res
          .status(400)
          .json({ message: "Invalid email or phone number format" });
      }

      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      const validPin = await bcrypt.compare(pin, user.pin);
      if (!validPin) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user._id, role: user.accountType },
        process.env.JWT_SECRET
      );
      res.json({ token, user ,message: "success" });
    });


    app.get("/user", authenticateToken, (req, res) => {
      res.json(req.user); 
    });

    app.get("/user/:id",async(req, res) => {
      // const id = req.params.id;
      console.log(id)
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      // console.log(user)
      res.json(user);
    })



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