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

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.email = decoded.email;
    next();
  } catch {
    res.status(401).send({ message: "Invalid Token" });
  }
};


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
            const db = client.db('Zentaskly_DB');
            const userCollections = db.collection('users');

    // user related API's

    app.post("/users", verifyFirebaseToken, async (req, res) => {
  const { name, email, image, role } = req.body;

  const existingUser = await userCollections.findOne({ email });
  if (existingUser) {
    return res.send({ message: "User already exists" });
  }

  const coin = role === "Worker" ? 10 : 50;

  const userData = {
    name,
    email,
    image,
    role,
    coin,
    createdAt: new Date(),
  };

  await userCollections.insertOne(userData);
  res.send({ message: "User created" });
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
