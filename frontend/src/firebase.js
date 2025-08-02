import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyBufUFI0ToVPmdwuvZlLEraQiTPkz9NAGc",
  authDomain: "jsonspark.firebaseapp.com",
  projectId: "jsonspark",
  storageBucket: "jsonspark.firebasestorage.app",
  messagingSenderId: "296614836258",
  appId: "1:296614836258:web:8862d4293d4054f4c4727b",
  measurementId: "G-S20TE7JCBH"
};

const app = initializeApp(firebaseConfig);

export default app;