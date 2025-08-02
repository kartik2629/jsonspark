require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

// Enhanced Firebase Initialization
const initializeFirebase = () => {
  try {
    // Verify required environment variables
    if (!process.env.FIREBASE_PROJECT_ID || 
        !process.env.FIREBASE_CLIENT_EMAIL || 
        !process.env.FIREBASE_PRIVATE_KEY || 
        !process.env.FIREBASE_DATABASE_URL) {
      throw new Error('Missing required Firebase environment variables');
    }

    // Process private key with proper formatting
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      .replace(/\\n/g, '\n')  // Convert escaped newlines to actual newlines
      .replace(/"/g, '')      // Remove any quotes
      .trim();                // Remove whitespace

    console.log('Initializing Firebase with:', {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKeyPresent: !!privateKey,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });

    // Initialize with unique app name to prevent conflicts
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    }, uuidv4());

    console.log('Firebase Admin initialized successfully');
    return app;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    // Don't log private key in production
    if (process.env.NODE_ENV !== 'production') {
      console.error('Private key value:', process.env.FIREBASE_PRIVATE_KEY);
    }
    process.exit(1);
  }
};

const firebaseApp = initializeFirebase();
const db = admin.firestore();

// Configure Firestore settings
db.settings({ 
  ignoreUndefinedProperties: true,
  timestampsInSnapshots: true
});

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://jsonspark.vercel.app'],
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

    const responseData = {
      result: "SUCCESS",
      data: parsedJson,
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
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// [Keep all other endpoints the same as in your original code]
// ... (include all your other endpoints exactly as they were)

// Enhanced Health Check
app.get('/health', async (req, res) => {
  try {
    // Test Firestore connection
    const testRef = db.collection('healthcheck').doc('test');
    await testRef.set({ timestamp: new Date().toISOString() });
    const doc = await testRef.get();
    
    res.json({
      status: 'OK',
      firebase: !!admin.apps.length,
      database: doc.exists,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error Handling
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Server Running AT - ${PORT}`);
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