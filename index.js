const express = require('express')
const app = express()
const cors = require("cors");
require('dotenv').config();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.DB_URL;
const serviceAccount = require("./zentaskly-firebase-adminsdk-key.json");
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Welcome to Zentaskly')
})

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized" });
  }
};


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
            const db = client.db('Zentaskly_DB');
            const usersCollection = db.collection('users');
            const tasksCollection = db.collection('tasks');
            const submissionsCollection = db.collection('submissions');
            const paymentsCollection = db.collection('payments');

            const verifyRole = (requiredRole) => {
  return async (req, res, next) => {
    const email = req.decoded.email;

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    if (user.role !== requiredRole) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    next();
  };
};

const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;

  const user = await usersCollection.findOne({ email });

  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "Admin only route" });
  }

  next();
};

const verifyWorker = async (req, res, next) => {
  const email = req.decoded.email;

  const user = await usersCollection.findOne({ email });

  if (!user || user.role !== "worker") {
    return res.status(403).send({ message: "Worker only route" });
  }

  next();
};

const verifyBuyer = async (req, res, next) => {
  const email = req.decoded.email;

  const user = await usersCollection.findOne({ email });

  if (!user || user.role !== "buyer") {
    return res.status(403).send({ message: "Buyer only route" });
  }

  next();
};


    // user related API's

 app.post("/users", async (req, res) => {
  const user = req.body;

  const exists = await usersCollection.findOne({ email: user.email });
  if (exists) {
    return res.send({ message: "User already exists" });
  }

  const role = user.role ? user.role.toLowerCase() : "worker";

  const newUser = {
    name: user.name,
    email: user.email,
    image: user.image,
    role: role,                     
    coins: role === "worker" ? 10 : 50,
    createdAt: new Date(),
  };

  const result = await usersCollection.insertOne(newUser);
  res.send(result);
});


    app.get("/users/:email", verifyJWT, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const user = await usersCollection.findOne({
        email: req.params.email,
      });

      res.send(user);
    });
app.get("/users/me", verifyJWT, async (req, res) => {
  const email = req.decoded.email;

  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  res.send(user);
});

// buyer related API's

app.get("/buyer/home-stats/:email", verifyJWT, async (req, res) => {
  const email = req.params.email;

  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  try {
    const tasks = await tasksCollection
      .find({ buyerEmail: email })
      .toArray();

    const totalTasks = tasks.length;

    const pendingWorkers = tasks.reduce(
      (sum, task) => sum + (task.required_workers || 0),
      0
    );

    const payments = await paymentsCollection
      .find({ email })
      .toArray();

    const totalPaid = payments.reduce(
      (sum, payment) => sum + (payment.amount || 0),
      0
    );

    res.send({
      totalTasks,
      pendingWorkers,
      totalPaid,
    });
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Zentaskly is running on port: ${port}`);
});
