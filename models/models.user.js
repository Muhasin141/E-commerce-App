const mongoose = require('mongoose');

// Assuming you create a separate Order model file (e.g., Order.js)
// that exports mongoose.model('Order', OrderSchema);

const AddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  street:   { type: String, required: true },
  city:     { type: String, required: true },
  state:    { type: String, required: true },
  zipCode:  { type: String, required: true },
  phone:    { type: String },

  
  isDefault: {
    type: Boolean,
    default: false
  }
});


const CartItemSchema = new mongoose.Schema({
 product: {
  type: mongoose.Schema.ObjectId, 
  ref: 'Product',
  required: true
 },
 quantity: {
  type: Number,
  required: true,
  default: 1,
  min: 1
 },
 // ⭐ NEW: Field to store the selected size string
 size: {
  type: String,
  trim: true,
  // This is optional since not all products require a size
 }
});


const UserSchema = new mongoose.Schema({

 name: {
  type: String,
  required: [true, 'Name is required'],
 },
 email: {
  type: String,
  required: [true, 'Email is required'],
  unique: true,
  match: [/.+@.+\..+/, 'Please enter a valid email address']
 },
 password: {
  type: String,
  required: [true, 'Password is required'],
  select: false 
 },

 addresses: [AddressSchema], 
 cart: [CartItemSchema],  
 wishlist: [{    
  type: mongoose.Schema.ObjectId,
  ref: 'Product'
 }],
  
  // --- NEW: Order History Array ---
 orderHistory: [{   
  type: mongoose.Schema.ObjectId,
  ref: 'Order' // References the separate Order model
 }]
  // ----------------------------------

}, {
 timestamps: true
});


module.exports = mongoose.model('User', UserSchema);
