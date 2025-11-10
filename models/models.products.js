const mongoose=require("mongoose")

const ProductSchema = new mongoose.Schema({
  
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required']
  },
  
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  originalPrice: {
    type: Number,
    default: null 
  },
  inStock: {
    type: Boolean,
    default: true
  },
    
    // ⭐ NEW FIELD: Available Sizes
    availableSizes: {
        type: [String], // Array of strings (e.g., ['S', 'M', 'L', 'XL'])
        required: [true, 'Available sizes are required for the product'],
        // You could add an enum here if sizes are standardized (e.g., ['S', 'M', 'L'])
    },
    // Optional: You might also want an inventory structure per size, but
    // keeping it simple with an array of available sizes for now.
    
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['men-clothing', 'women-clothing', 'other','kids-clothing','sports','home']
  },
  imageUrl: {
    type: String,
    required: [true, 'Product image URL is required']
  },
  
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  }
}, {
  timestamps: true 
});

const Product=mongoose.model("Product",ProductSchema)

module.exports=Product
