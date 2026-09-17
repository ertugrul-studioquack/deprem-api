const express = require('express');
const router = express.Router();
const {
  getEarthquakes,
  getNearbyEarthquakes,
  getCities,
  getStats,
  getEarthquakeById
} = require('../controllers/earthquakeController');

// Özel rotalar
router.get('/nearby', getNearbyEarthquakes);
router.get('/cities', getCities);
router.get('/stats', getStats);

// Genel liste ve filtreleme
router.get('/', getEarthquakes);

// Tekil kayıt
router.get('/:id', getEarthquakeById);

module.exports = router;
