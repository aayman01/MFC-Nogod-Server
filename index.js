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
        balance: accountType === "user" ? 40 : 0,
      };
      await usersCollection.insertOne(newUser);
      res.status(201).json({ message: "success" });
    });

    app.post("/login", async (req, res) => {
      const { identifier, pin } = req.body;

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

      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(403).json({ 
          message: "Your account has been blocked. Please contact support." 
        });
      }

      const validPin = await bcrypt.compare(pin, user.pin);
      if (!validPin) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user._id, role: user.accountType },
        process.env.JWT_SECRET
      );
      res.json({ token, user, message: "success" });
    });

    app.get("/token", authenticateToken, (req, res) => {
      res.json(req.user);
    });

    app.get("/user/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Validate if id is a valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(id) });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json(user);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching user", error: error.message });
      }
    });

    // Fetch all agents
    app.get("/agents", async (req, res) => {
      try {
        const agents = await usersCollection
          .find({ accountType: { $in: ["agent", "pending"] } })
          .toArray();
        res.status(200).json(agents);
      } catch (error) {
        res.status(500).json({ message: "Error fetching agents", error });
      }
    });

    // Get a single agent and their transactions
    app.get("/agents/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const agent = await usersCollection.findOne({ _id: id });
        if (!agent) return res.status(404).json({ message: "Agent not found" });

        // Fetch last 100 transactions for the agent
        const transactions = await transactionsCollection
          .find({ userId: id })
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray();

        res.status(200).json({ agent, transactions });
      } catch (error) {
        res.status(500).json({ message: "Error fetching agent data", error });
      }
    });

    // Approve an agent (Change accountType from 'pending' → 'agent')
    app.patch("/agents/:id/approve", async (req, res) => {
      try {
        const { id } = req.params;

        // First check if the agent exists and is pending
        const agent = await usersCollection.findOne({
          _id: new ObjectId(id),
          accountType: "pending"
        });

        if (!agent) {
          return res.status(404).json({ message: "Agent not found or already approved" });
        }

        // Update the agent's status and add initial balance
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { 
            $set: { 
              accountType: "agent",
              balance: 100000 // Adding 100000 taka initial balance
            } 
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(500).json({ message: "Error updating agent" });
        }

        res.status(200).json({ 
          message: "Agent approved successfully and initial balance of 100000 taka added" 
        });
      } catch (error) {
        res.status(500).json({ message: "Error approving agent", error: error.message });
      }
    });

    // Block/Unblock an agent
    app.patch("/agents/:id/block", async (req, res) => {
      try {
        const { id } = req.params;

        // Validate if id is a valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const agent = await usersCollection.findOne({
          _id: new ObjectId(id),
          accountType: "agent",
        });
        
        if (!agent) {
          return res.status(404).json({ message: "Agent not found" });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isBlocked: !agent.isBlocked } }
        );

        res.status(200).json({
          message: `Agent ${!agent.isBlocked ? "blocked" : "unblocked"}`,
        });
      } catch (error) {
        res.status(500).json({ 
          message: "Error blocking/unblocking agent", 
          error: error.message 
        });
      }
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
