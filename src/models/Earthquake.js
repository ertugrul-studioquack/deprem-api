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
      default: 0,
      index: true
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
      default: '',
      index: true
    },
    latitude: {
      type: Number,
      default: 0
    },
    longitude: {
      type: Number,
      default: 0
    },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
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

// İndeksler
earthquakeSchema.index({ eventDate: -1 });
earthquakeSchema.index({ geo: '2dsphere' });

module.exports = mongoose.model('Earthquake', earthquakeSchema);
