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
   
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['men-clothing', 'women-clothing', 'other']
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