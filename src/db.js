const mongoose = require('mongoose');

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGO_URI || 'mongodb://localhost:27017/deprem_db';
  
  let connected = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!connected && attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`[DB] MongoDB'ye bağlanılıyor (Deneme ${attempts}/${maxAttempts}): ${mongoUri}`);
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000
      });
      connected = true;
      console.log('[DB] MongoDB bağlantısı başarıyla kuruldu.');
    } catch (err) {
      console.error(`[DB] Bağlantı hatası: ${err.message}`);
      if (attempts >= maxAttempts) {
        throw new Error('[DB] MongoDB bağlantısı kurulamadı, çıkılıyor.');
      }
      console.log('[DB] 3 saniye sonra tekrar denenecek...');
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}

module.exports = { connectDB };
