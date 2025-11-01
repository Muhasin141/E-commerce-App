const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose"); // Added for convenience in seeding logic


const PORT = 4000;

const DEMO_USER_ID = "60c72b2f91a4a4001550a256"; 


const { initializeDatabase } = require("./db/db.connect");
const Product = require("./models/models.products");
const User = require("./models/models.user");
const Order = require("./models/models.order"); 


const corsOptions = {
    origin: "*",
    credentials: true,
    optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json()); // Body parser for application/json


const attachUserId = (req, res, next) => {
    
    req.userId = DEMO_USER_ID; 
    next();
};


initializeDatabase();


async function seedData() {
    try {
        console.log("--- Starting Data Seeding ---");
        
        // 1. Clear and Seed Products
        await Product.deleteMany({}); 
        const jsonData = fs.readFileSync("products.json", "utf-8");
        const productsData = JSON.parse(jsonData);
        for (const productData of productsData) {
            // Ensure data types match the model (especially Price and Rating numbers)
            const newProduct = new Product(productData);
            await newProduct.save(); 
        }
        console.log(`Product Data seeded successfully (${productsData.length} items).`);

        
        await User.deleteMany({}); 
        await User.create({
            _id: DEMO_USER_ID,
            name: "Demo User",
            email: "demo@example.com",
            password: "testpassword", // Must satisfy your schema requirement
            addresses: [{
                // Using Mongoose ObjectId for sub-documents
                _id: new mongoose.Types.ObjectId(), 
                fullName: "Demo Home",
                street: "123 Main Street",
                city: "Reactville",
                state: "CA",
                zipCode: "90210",
                phone: "5551234567"
            }],
            cart: [], 
            wishlist: []
        });
        console.log("Demo User created successfully.");

    } catch (error) {
        console.error("Error seeding the data:", error);
    } finally {
         console.log("--- Data Seeding Complete ---");
    }
}





app.get("/api/products", async (req, res) => {
    try {
        const { category, rating, sort, search } = req.query;
        let query = {};
        let sortOptions = {};

        // Filtering by Category (Supports multiple categories via comma-separated list)
        if (category) {
            query.category = { $in: category.split(',') };
        }

        // Filtering by Rating (Minimum rating)
        if (rating) {
            query.rating = { $gte: Number(rating) };
        }
        
        // Search Filter (by product name, case-insensitive)
        if (search) {
            query.name = { $regex: new RegExp(search, 'i') };
        }

        // Sorting by Price
        if (sort === 'priceLowToHigh') {
            sortOptions = { price: 1 };
        } else if (sort === 'priceHighToLow') {
            sortOptions = { price: -1 };
        }

        const products = await Product.find(query).sort(sortOptions);
        res.status(200).json({ products });
        
    } catch (error) {
        res.status(500).json({ message: "Error fetching products.", error: error.message });
    }
});


app.get("/api/products/:productId", async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId);
        if (!product) return res.status(404).json({ message: "Product not found" });
        res.status(200).json({ product });
    } catch (error) {
        // Handle invalid MongoDB ID format
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: "Invalid product ID format." });
        }
        res.status(500).json({ message: "Error fetching product details.", error: error.message });
    }
});



app.get("/api/cart", attachUserId, async (req, res) => {
    try {
        // Use populate to retrieve full product details inside the cart array
        const user = await User.findById(req.userId).populate("cart.product");
        if (!user) return res.status(404).json({ message: "User not found." });
        res.status(200).json({ cart: user.cart });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch cart.", error: error.message });
    }
});


app.post("/api/cart", attachUserId, async (req, res) => {
    try {
        const { productId } = req.body;
        let user = await User.findById(req.userId);
        
        const cartItemIndex = user.cart.findIndex(
            // Use .toString() to compare Mongoose ObjectId with string
            item => item.product.toString() === productId
        );

        if (cartItemIndex > -1) {
            // Item exists: Increase quantity
            user.cart[cartItemIndex].quantity += 1;
        } else {
            // Item doesn't exist: Add new item
            user.cart.push({ product: productId, quantity: 1 });
        }

        await user.save();
        user = await user.populate("cart.product"); // Repopulate to send fresh data
        res.status(200).json({ cart: user.cart });
    } catch (error) {
        res.status(500).json({ message: "Failed to add/update item in cart.", error: error.message });
    }
});

// POST /api/cart/quantity - Increase/Decrease Quantity
app.post("/api/cart/quantity", attachUserId, async (req, res) => {
    try {
        const { productId, action } = req.body; // action: 'increment' or 'decrement'
        let user = await User.findById(req.userId);
        
        const cartItem = user.cart.find(item => item.product.toString() === productId);
        if (!cartItem) return res.status(404).json({ message: "Item not found in cart." });

        if (action === 'increment') {
            cartItem.quantity += 1;
        } else if (action === 'decrement' && cartItem.quantity > 1) {
            cartItem.quantity -= 1;
        } else if (action === 'decrement' && cartItem.quantity === 1) {
            // Remove item if decrementing from 1
            user.cart = user.cart.filter(item => item.product.toString() !== productId);
        } else {
            return res.status(400).json({ message: "Invalid action or minimum quantity reached." });
        }
        
        await user.save();
        user = await user.populate("cart.product");
        res.status(200).json({ cart: user.cart });

    } catch (error) {
        res.status(500).json({ message: "Failed to update cart quantity.", error: error.message });
    }
});

// DELETE /api/cart/:productId - Remove Item from Cart
app.delete("/api/cart/:productId", attachUserId, async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.userId);
        
        user.cart = user.cart.filter(item => item.product.toString() !== productId);
        await user.save();
        
        const updatedUser = await user.populate("cart.product");
        res.status(200).json({ cart: updatedUser.cart });

    } catch (error) {
        res.status(500).json({ message: "Failed to remove item from cart.", error: error.message });
    }
});


// ## 4. Wishlist Management

// GET /api/wishlist - View Wishlist
app.get("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const user = await User.findById(req.userId).populate("wishlist");
        res.status(200).json({ wishlist: user.wishlist });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch wishlist.", error: error.message });
    }
});

// POST /api/wishlist - Add Item to Wishlist
app.post("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const { productId } = req.body;
        let user = await User.findById(req.userId);
        
        if (!user.wishlist.includes(productId)) {
            user.wishlist.push(productId);
            await user.save();
        }
        
        user = await user.populate("wishlist");
        res.status(200).json({ wishlist: user.wishlist });

    } catch (error) {
        res.status(500).json({ message: "Failed to add to wishlist.", error: error.message });
    }
});

// DELETE /api/wishlist/:productId - Remove Item from Wishlist
app.delete("/api/wishlist/:productId", attachUserId, async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.userId);
        
        // Mongoose pull operator removes all instances of productId from the array
        user.wishlist.pull(productId); 
        await user.save();
        
        const updatedUser = await user.populate("wishlist");
        res.status(200).json({ wishlist: updatedUser.wishlist });

    } catch (error) {
        res.status(500).json({ message: "Failed to remove item from wishlist.", error: error.message });
    }
});




// GET /api/user/profile - Fetch User Details (including addresses)
app.get("/api/user/profile", attachUserId, async (req, res) => {
    try {
        // Select('-password') excludes the password field
        const user = await User.findById(req.userId).select('-password'); 
        if (!user) return res.status(404).json({ message: "User not found." });

        res.status(200).json({ 
            name: user.name, 
            email: user.email, 
            addresses: user.addresses,
            message: "User profile fetched."
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch user profile.", error: error.message });
    }
});

// POST /api/address - Add New Address
app.post("/api/address", attachUserId, async (req, res) => {
    try {
        const newAddress = req.body;
        const user = await User.findById(req.userId);
        
        user.addresses.push(newAddress);
        await user.save();
        res.status(201).json({ addresses: user.addresses });

    } catch (error) {
        res.status(500).json({ message: "Failed to add new address.", error: error.message });
    }
});

// PUT /api/address/:addressId - Update Address
app.put("/api/address/:addressId", attachUserId, async (req, res) => {
    try {
        const { addressId } = req.params;
        const updates = req.body;
        const user = await User.findById(req.userId);
        
        // Find the specific address sub-document by its ID
        const addressToUpdate = user.addresses.id(addressId);
        
        if (!addressToUpdate) return res.status(404).json({ message: "Address not found." });

        // Apply updates to the sub-document fields
        Object.keys(updates).forEach(key => {
            addressToUpdate[key] = updates[key];
        });

        await user.save();
        res.status(200).json({ addresses: user.addresses });

    } catch (error) {
        res.status(500).json({ message: "Failed to update address.", error: error.message });
    }
});

// DELETE /api/address/:addressId - Delete Address
app.delete("/api/address/:addressId", attachUserId, async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.userId);
        
        // Remove the sub-document by its ID
        user.addresses.id(addressId).deleteOne();

        await user.save();
        res.status(200).json({ addresses: user.addresses });

    } catch (error) {
        res.status(500).json({ message: "Failed to delete address.", error: error.message });
    }
});


// ## 6. Order History

// GET /api/user/orders - Fetch Order History
app.get("/api/user/orders", attachUserId, async (req, res) => {
    try {
        // Find all orders associated with the user ID, sorted by newest first
        const orders = await Order.find({ user: req.userId }).sort({ createdAt: -1 });
        
        res.status(200).json({ orders });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch order history.", error: error.message });
    }
});


// ## 7. Checkout (Order Placement)

// POST /api/checkout
app.post("/api/checkout", attachUserId, async (req, res) => {
    try {
        const { selectedAddressId, totalAmount } = req.body;
        const user = await User.findById(req.userId).populate("cart.product");

        if (user.cart.length === 0) {
            return res.status(400).json({ message: "Cart is empty. Cannot place order." });
        }

        const deliveryAddress = user.addresses.id(selectedAddressId);
        if (!deliveryAddress) {
            return res.status(400).json({ message: "Invalid delivery address selected." });
        }
        
        // Create Order Document (Snapshot of current cart and address)
        const newOrder = new Order({
            user: req.userId,
            // Map cart items to plain objects for the order snapshot
            products: user.cart.map(item => item.toObject()), 
            deliveryAddress: deliveryAddress.toObject(),
            totalAmount: totalAmount,
            status: 'Placed'
        });

        await newOrder.save();
        
        // Clear the Cart after successful order
        user.cart = [];
        await user.save();

        res.status(201).json({ 
            message: "Order Placed Successfully.",
            orderId: newOrder._id
        });

    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ message: "Failed to place order.", error: error.message });
    }
});



app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`Backend API running at http://localhost:${PORT}/api`);
});
