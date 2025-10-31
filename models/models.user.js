const mongoose = require('mongoose');



const AddressSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    phone: { type: String, required: true }
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
    }]
}, {
    timestamps: true
});




module.exports = mongoose.model('User', UserSchema);