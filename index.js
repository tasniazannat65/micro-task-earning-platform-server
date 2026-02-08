const express = require('express')
const app = express()
const cors = require("cors");
require('dotenv').config();
const admin = require("firebase-admin");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET);
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
    return res.status(403).send({ message: "Forbidden" });
  }

  try {
    const tasks = await tasksCollection
      .find({ buyerEmail: email })
      .toArray();

    const totalTasks = tasks.length;

    const pendingWorkers = tasks.reduce(
      (sum, task) => sum + Number(task.required_workers || 0),
      0
    );

    const payments = await paymentsCollection
      .find({ email, status: "success" })
      .toArray();

    const totalPaid = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    res.send({ totalTasks, pendingWorkers, totalPaid });
  } catch {
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/buyer/pending-submissions/:email", verifyJWT, async (req, res) => {
  const email = req.params.email;

  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const result = await submissionsCollection
    .find({ buyerEmail: email, status: "pending" })
    .toArray();

  res.send(result);
});

app.patch("/buyer/submission/approve/:id", verifyJWT, async (req, res) => {
  const id = req.params.id;

  const submission = await submissionsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!submission || submission.status !== "pending") {
    return res.send({ success: false });
  }

  await submissionsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved" } }
  );

  await usersCollection.updateOne(
    { email: submission.workerEmail },
    { $inc: { coins: submission.payable_amount } }
  );

  res.send({ success: true });
});

app.patch("/buyer/submission/reject/:id", verifyJWT, async (req, res) => {
  const id = req.params.id;

  const submission = await submissionsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!submission || submission.status !== "pending") {
    return res.send({ success: false });
  }

  await submissionsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected" } }
  );

  await tasksCollection.updateOne(
    { _id: new ObjectId(submission.taskId) },
    { $inc: { required_workers: 1 } }
  );

  res.send({ success: true });
});



app.post("/tasks", verifyJWT, verifyBuyer, async (req, res) => {
  const task = req.body;
  const buyerEmail = req.decoded.email;

  const buyer = await usersCollection.findOne({ email: buyerEmail });

  if (!buyer) {
    return res.status(404).send({ message: "Buyer not found" });
  }

  const requiredWorkers = Number(task.required_workers);
  const payableAmount = Number(task.payable_amount);

  const totalPayable = requiredWorkers * payableAmount;

  if (buyer.coins < totalPayable) {
    return res.status(400).send({
      message: "Not available Coin. Purchase Coin",
    });
  }

  const newTask = {
    buyerEmail,
    buyerName: buyer.name,
    task_title: task.task_title,
    task_detail: task.task_detail,
    required_workers: requiredWorkers,
    payable_amount: payableAmount,
    completion_date: new Date(task.completion_date),
    submission_info: task.submission_info,
    task_image_url: task.task_image_url,
    status: "active",
    createdAt: new Date(),
  };

  await tasksCollection.insertOne(newTask);

  await usersCollection.updateOne(
    { email: buyerEmail },
    { $inc: { coins: -totalPayable } }
  );

  res.send({
    success: true,
    message: "Task added successfully",
  });
});

app.get("/buyer/tasks/:email", verifyJWT, verifyBuyer, async (req, res) => {
  const email = req.params.email;

  const tasks = await tasksCollection
    .find({ buyerEmail: email })
    .sort({ completion_date: -1 })
    .toArray();

  res.send(tasks);
});
app.patch("/buyer/tasks/:id", verifyJWT, verifyBuyer, async (req, res) => {
  const { id } = req.params;
  const { task_title, task_detail, submission_info } = req.body;

  const result = await tasksCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        task_title,
        task_detail,
        submission_info,
      },
    }
  );

  res.send({ success: true, result });
});
app.delete("/buyer/tasks/:id", verifyJWT, verifyBuyer, async (req, res) => {
  const { id } = req.params;
  const email = req.decoded.email;

  const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
  if (!task) {
    return res.status(404).send({ message: "Task not found" });
  }

  const refundAmount = task.required_workers * task.payable_amount;

  await tasksCollection.deleteOne({ _id: new ObjectId(id) });

  await usersCollection.updateOne(
    { email },
    { $inc: { coins: refundAmount } }
  );

  res.send({
    success: true,
    refunded: refundAmount,
  });
});

// payments related API's

app.post("/create-checkout-session", verifyJWT, async (req, res) => {
  const { coins, amount } = req.body;
  const email = req.decoded.email;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amount * 100,
          product_data: {
            name: `${coins} Coins`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      email,
      coins: coins.toString(),
      amount: amount.toString(),
    },
    success_url: `${process.env.SITE_DOMAIN}/dashboard/buyer/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/buyer/purchase-coin`,
  });

  res.send({ url: session.url });
});



app.post("/payments/confirm", verifyJWT, async (req, res) => {
  const { sessionId } = req.body;
  const email = req.decoded.email;

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });

  if (session.payment_status !== "paid") {
    return res.status(400).send({ message: "Payment not completed" });
  }

  const paymentIntentId = session.payment_intent.id;

  const alreadyPaid = await paymentsCollection.findOne({ paymentIntentId });

  if (alreadyPaid) {
    return res.status(409).send({ message: "Payment already confirmed" });
  }

  const paymentData = {
    email,
    coins: Number(session.metadata.coins),
    amount: Number(session.metadata.amount),
    paymentIntentId,
    paymentMethod: "stripe",
    status: "success",
    createdAt: new Date(),
  };

  await paymentsCollection.insertOne(paymentData);

  await usersCollection.updateOne(
    { email },
    { $inc: { coins: paymentData.coins } }
  );

  res.send({ success: true });
});

app.get(
  "/payments/history",
  verifyJWT,
  verifyBuyer,
  async (req, res) => {
    try {
      const email = req.decoded.email;

      const payments = await paymentsCollection
        .find({ email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(payments);
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Failed to load payment history" });
    }
  }
);













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
