require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

// Initialize Firebase Admin
try {
  admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  process.exit(1);
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173','https://jsonspark.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Helper Functions
const validateJSON = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return null;
  }
};

const validateSlug = (slug) => {
  return /^[a-z0-9-]+$/.test(slug);
};

// API Endpoints
app.post('/create', async (req, res) => {
  const { name, jsonData, slug } = req.body;

  if (!name || !jsonData || !slug) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!validateSlug(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  const parsedJson = validateJSON(jsonData);
  if (!parsedJson) {
    return res.status(400).json({ error: 'Invalid JSON data' });
  }

  try {
    const docRef = db.collection('api').doc(slug);
    const doc = await docRef.get();
    
    if (doc.exists) {
      return res.status(409).json({ error: 'Slug already exists' });
    }

    // Create the response structure you want
    const responseData = {
      result: "SUCCESS",
      data: parsedJson, // Wrap the data in an array as per your example
      message: "Success"
    };

    await docRef.set({
      name,
      jsonData: responseData,
      slug,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ 
      success: true,
      endpoint: `/${slug}`,
      message: 'API Created'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/:slug', async (req, res) => {
  try {
    const docRef = db.collection('api').doc(req.params.slug);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    const data = doc.data();
    res.json(data.jsonData); // Return the exact structure you want
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/:slug', async (req, res) => {
  const { jsonData } = req.body;

  if (!jsonData) {
    return res.status(400).json({ error: 'JSON data is required' });
  }

  const parsedJson = validateJSON(jsonData);
  if (!parsedJson) {
    return res.status(400).json({ error: 'Invalid JSON data' });
  }

  try {
    const docRef = db.collection('api').doc(req.params.slug);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    // Update with the same response structure
    const responseData = {
      result: "SUCCESS",
      data: [parsedJson],
      message: "Success"
    };

    await docRef.update({
      jsonData: responseData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'API Updated' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/:slug', async (req, res) => {
  try {
    const docRef = db.collection('api').doc(req.params.slug);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    await docRef.delete();
    res.json({ success: true, message: 'API Deleted' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('api')
      .orderBy('createdAt', 'desc')
      .get();

    const endpoints = [];
    snapshot.forEach(doc => {
      endpoints.push({
        slug: doc.data().slug,
        name: doc.data().name,
        createdAt: doc.data().createdAt?.toDate()
      });
    });

    res.json({ endpoints });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error Handling
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Server Running AT -  ${PORT}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
