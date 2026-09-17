const mongoose = require('mongoose');

const earthquakeSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    eventDate: {
      type: Date,
      required: true,
      index: true
    },
    magnitude: {
      type: Number,
      default: 0
    },
    magnitudeType: {
      type: String,
      default: ''
    },
    depth: {
      type: Number,
      default: 0
    },
    location: {
      type: String,
      default: ''
    },
    latitude: {
      type: Number,
      default: 0
    },
    longitude: {
      type: Number,
      default: 0
    },
    eaeventId: {
      type: Number
    },
    raw: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Son depremleri tarihe göre sıralı getirmek için bileşik indeks
earthquakeSchema.index({ eventDate: -1 });

module.exports = mongoose.model('Earthquake', earthquakeSchema);
