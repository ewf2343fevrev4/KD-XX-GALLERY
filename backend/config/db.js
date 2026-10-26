const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('=== DEBUG INFO ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('MONGO_URI exists:', !!process.env.MONGO_URI);
    console.log('==================');
    
    console.log('Attempting to connect to MongoDB...');
    
    // Thử nhiều connection options khác nhau
    const connectionOptions = [
      // Option 1: Atlas với connection string từ .env
      {
        uri: process.env.MONGO_URI,
        name: 'Atlas (from .env)'
      },
      // Option 2: Atlas với connection string mới (format chuẩn)
      {
        uri: 'mongodb+srv://amiri-admin:191205@amiri-store.ap1nz7d.mongodb.net/amiri-store?retryWrites=true&w=majority&appName=amiri-ecommerce',
        name: 'Atlas (corrected format)'
      },
      // Option 3: Atlas với DNS resolution fallback
      {
        uri: 'mongodb+srv://amiri-admin:191205@amiri-store.ap1nz7d.mongodb.net/?retryWrites=true&w=majority',
        name: 'Atlas (no database specified)'
      }
    ];

    for (const option of connectionOptions) {
      if (!option.uri) {
        console.log(`❌ ${option.name}: URI is empty, skipping...`);
        continue;
      }

      try {
        console.log(`\nTrying ${option.name}...`);
        console.log(`URI: ${option.uri?.substring(0, 50)}...`);
        
        // Chỉ sử dụng các options được hỗ trợ
        const conn = await mongoose.connect(option.uri, {
          serverSelectionTimeoutMS: 15000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 15000,
          maxPoolSize: 10,
          minPoolSize: 1,
          maxIdleTimeMS: 30000
        });

        console.log(`✅ ${option.name} Connected Successfully!`);
        console.log(`Host: ${conn.connection.host}`);
        console.log(`Database: ${conn.connection.name}`);
        console.log(`Ready State: ${conn.connection.readyState}`);
        
        // Setup connection event listeners
        mongoose.connection.on('error', (err) => {
          console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
          console.log('MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
          console.log('MongoDB reconnected');
        });

        return conn; // Return successful connection
        
      } catch (error) {
        console.log(`❌ ${option.name} failed:`, error.message);
        
        // Properly disconnect before trying next option
        if (mongoose.connection.readyState !== 0) {
          try {
            await mongoose.disconnect();
            console.log('Mongoose disconnected');
          } catch (disconnectError) {
            console.log('Error disconnecting:', disconnectError.message);
          }
        }
        continue; // Try next option
      }
    }
    
    // If all options fail
    throw new Error('All connection attempts failed');
    
  } catch (error) {
    console.error('❌ All MongoDB connection attempts failed:', error.message);
    
    // Don't exit process, let the app run without DB
    console.log('🔄 Server will continue without database connection');
    console.log('📝 You can still test API endpoints that don\'t require DB');
    
    // Ensure mongoose is disconnected
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.log('Final disconnect error:', disconnectError.message);
      }
    }
    
    return null;
  }
};

module.exports = connectDB;