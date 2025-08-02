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
    const firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    }, uuidv4());

    console.log('Firebase Admin initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    if (process.env.NODE_ENV !== 'production') {
      console.error('Private key value:', process.env.FIREBASE_PRIVATE_KEY);
    }
    process.exit(1);
  }
};

// Initialize Firebase and get the app instance
const firebaseApp = initializeFirebase();

// Get Firestore instance from the initialized app
const db = firebaseApp.firestore();

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

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});

// API Endpoints

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Create Endpoint
app.post('/api/create', async (req, res) => {
  const { name, jsonData, slug } = req.body;

  if (!name || !jsonData || !slug) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!validateSlug(slug)) {
    return res.status(400).json({ error: 'Invalid slug format. Only lowercase letters, numbers, and hyphens are allowed.' });
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

    await docRef.set({
      name,
      jsonData: parsedJson,
      slug,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ 
      success: true,
      endpoint: `/api/${slug}`,
      message: 'API endpoint created successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get Endpoint
app.get('/api/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!validateSlug(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  try {
    const docRef = db.collection('api').doc(slug);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    res.json(doc.data().jsonData);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update Endpoint
app.put('/api/:slug', async (req, res) => {
  const { slug } = req.params;
  const { jsonData } = req.body;

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
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    await docRef.update({
      jsonData: parsedJson,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      success: true,
      message: 'Endpoint updated successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete Endpoint
app.delete('/api/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!validateSlug(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  try {
    const docRef = db.collection('api').doc(slug);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }

    await docRef.delete();

    res.json({ 
      success: true,
      message: 'Endpoint deleted successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// List All Endpoints
app.get('/api', async (req, res) => {
  try {
    const snapshot = await db.collection('api').get();
    const endpoints = [];
    
    snapshot.forEach(doc => {
      endpoints.push({
        slug: doc.id,
        name: doc.data().name,
        createdAt: doc.data().createdAt?.toDate()?.toISOString(),
        endpoint: `/api/${doc.id}`
      });
    });

    res.json({
      count: endpoints.length,
      endpoints
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'JSONSpark API Service',
    version: '1.0.0',
    endpoints: {
      healthCheck: '/health',
      apiDocumentation: 'Coming soon',
      availableEndpoints: [
        'GET /api/health',
        'POST /api/create',
        'GET /api/:slug',
        'PUT /api/:slug',
        'DELETE /api/:slug',
        'GET /api'
      ]
    }
  });
});

// Catch-all for undefined routes
app.all('*', (req, res) => {
  console.error(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/health',
      'POST /api/create',
      'GET /api/:slug',
      'PUT /api/:slug',
      'DELETE /api/:slug',
      'GET /api'
    ]
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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