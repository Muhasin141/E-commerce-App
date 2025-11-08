const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose"); // Added for convenience in seeding logic


const PORT = 4000;

const DEMO_USER_ID = "6903c199a74f687293cca302"; 


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


initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(` Server started on port ${PORT}`);
        console.log(`Backend API running at http://localhost:${PORT}`);
    });
});

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

        // 2. Clear and Seed Demo User
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
            wishlist: [],
            orderHistory:[]
        });
        console.log("Demo User created successfully.");

    } catch (error) {
        console.error("Error seeding the data:", error);
    } finally {
           console.log("--- Data Seeding Complete ---");
    }
}


// Existing Product Routes...
app.get("/api/products", async (req, res) => {
    try {
        const { category, rating, sort, q } = req.query;
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
        if (q) {
            query.name = { $regex: new RegExp(q, 'i') };
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


// Existing Cart Routes...
// GET /api/cart - View Cart
app.get("/api/cart", attachUserId, async (req, res) => {
    try {
        // Use populate to retrieve full product details inside the cart array
        const user = await User.findById(req.userId).populate("cart.product");
        
        // IMPORTANT: Ensure user is found before accessing properties
        if (!user) return res.status(404).json({ message: "User not found." });
        
        res.status(200).json({ cart: user.cart });
    } catch (error) {
        console.error("Error fetching cart:", error.message);
        res.status(500).json({ message: "Failed to fetch cart.", error: error.message });
    }
});

// POST /api/cart - Add Item to Cart (or increment quantity)
app.post("/api/cart", attachUserId, async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ message: "Product ID is required for cart operation." });
        }

        let user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ message: "User not found in the database." });
        }
        
        const cartItemIndex = user.cart.findIndex(
            item => item.product.toString() === productId
        );

        if (cartItemIndex > -1) {
            // Item exists: Increase quantity
            user.cart[cartItemIndex].quantity += 1;
        } else {
            // Item doesn't exist: Add new item.
            user.cart.push({ product: productId, quantity: 1 });
        }

        await user.save();
        
        // Repopulate to ensure product details are embedded in the response
        user = await user.populate("cart.product"); 
        
        res.status(200).json({ cart: user.cart });
        
    } catch (error) {
        console.error("Error in POST /api/cart:", error.message); 
        res.status(500).json({ message: "Failed to add/update item in cart.", error: error.message });
    }
});

// POST /api/cart/quantity - Increase/Decrease Quantity
app.post("/api/cart/quantity", attachUserId, async (req, res) => {
    try {
        // Your frontend sends actions as 'increment' or 'decrement' (lowercase) after .toLowerCase()
        const { productId, action } = req.body; 
        let user = await User.findById(req.userId);
        
        if (!user) return res.status(404).json({ message: "User not found." });

        const cartItem = user.cart.find(item => item.product.toString() === productId);
        if (!cartItem) return res.status(404).json({ message: "Item not found in cart." });

        if (action === 'increment') {
            cartItem.quantity += 1;
        } else if (action === 'decrement') {
            if (cartItem.quantity > 1) {
                cartItem.quantity -= 1;
            } else {
                // If quantity is 1, remove the item entirely
                user.cart = user.cart.filter(item => item.product.toString() !== productId);
            }
        } else {
            return res.status(400).json({ message: "Invalid action provided." });
        }
        
        await user.save();
        
        // If the item was removed, populate will work fine on the remaining items
        user = await user.populate("cart.product"); 
        res.status(200).json({ cart: user.cart });

    } catch (error) {
        console.error("Error in POST /api/cart/quantity:", error.message);
        res.status(500).json({ message: "Failed to update cart quantity.", error: error.message });
    }
});


// DELETE /api/cart/:productId - Remove Item from Cart
app.delete("/api/cart/:productId", attachUserId, async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.userId);
        
        if (!user) return res.status(404).json({ message: "User not found." });
        
        user.cart = user.cart.filter(item => item.product.toString() !== productId);
        await user.save();
        
        const updatedUser = await user.populate("cart.product");
        res.status(200).json({ cart: updatedUser.cart });

    } catch (error) {
        console.error("Error in DELETE /api/cart/:productId:", error.message);
        res.status(500).json({ message: "Failed to remove item from cart.", error: error.message });
    }
});

// ## 4. Wishlist Management

// GET /api/wishlist - View Wishlist
app.get("/api/wishlist", attachUserId, async (req, res) => {
    try {
        // Correct population: Populates the array of Product IDs with full Product documents.
        const user = await User.findById(req.userId).populate("wishlist");
        
        // Ensure the frontend receives the populated array (array of Product documents)
        res.status(200).json({ wishlist: user.wishlist });
    } catch (error) {
        // Added console logging for server-side debugging
        console.error("Error fetching wishlist:", error);
        res.status(500).json({ message: "Failed to fetch wishlist.", error: error.message });
    }
});

// POST /api/wishlist - Add Item to Wishlist
app.post("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const { productId } = req.body;
        // NOTE: It is best practice to validate productId here before querying
        
        let user = await User.findById(req.userId);
        
        // Ensure user exists before proceeding (addresses "User not found")
        if (!user) {
             return res.status(404).json({ message: "User not found." });
        }
        
        // Mongoose automatically handles comparison between ObjectId and String
        if (!user.wishlist.includes(productId)) {
            user.wishlist.push(productId);
            await user.save();
        }
        
        // IMPORTANT: Re-fetch or populate the user *after* saving to get the latest data
        // Populate the wishlist before sending the response
        user = await user.populate("wishlist");
        res.status(200).json({ wishlist: user.wishlist });

    } catch (error) {
        console.error("Error adding to wishlist:", error);
        res.status(500).json({ message: "Failed to add to wishlist.", error: error.message });
    }
});

// DELETE /api/wishlist/:productId - Remove Item from Wishlist
app.delete("/api/wishlist/:productId", attachUserId, async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.userId);
        
        if (!user) {
             return res.status(404).json({ message: "User not found." });
        }
        
        // Mongoose pull operator removes all instances of productId from the array
        user.wishlist.pull(productId); 
        await user.save();
        
        // Populate the user before sending the response
        const updatedUser = await user.populate("wishlist");
        res.status(200).json({ wishlist: updatedUser.wishlist });

    } catch (error) {
        console.error("Error removing from wishlist:", error);
        res.status(500).json({ message: "Failed to remove item from wishlist.", error: error.message });
    }
});


// Existing User Profile Routes...
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


// ## 6. Order History ----------------------------------------------------
// -----------------------------------------------------------------------

// ⭐ ADDED: GET /api/user/order/:orderId - Fetch a Single Order Detail
app.get("/api/user/order/:orderId", attachUserId, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId; 

        // Find the order by its _id AND ensure the 'user' field matches the authenticated userId.
        const order = await Order.findOne({ 
            _id: orderId, 
            user: userId 
        })
        .populate({
            path: 'items.product', 
            select: 'name price images' // Populate with necessary product details
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found or access denied." });
        }

        res.status(200).json({ order });
    } catch (error) {
        console.error("Error fetching single order:", error);
        res.status(500).json({ message: "Failed to fetch order details.", error: error.message });
    }
});


// Existing Route: GET /api/user/orders - Fetch Order History
app.get("/api/user/orders", attachUserId, async (req, res) => {
    try {
        // Find all orders associated with the user ID, sorted by newest first
        const orders = await Order.find({ user: req.userId })
            .sort({ createdAt: -1 })
            .populate({
                path: 'items.product', 
                select: 'name' // Populate for brief summary
            });
        
        res.status(200).json({ orders });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch order history.", error: error.message });
    }
});

// -----------------------------------------------------------------------


// ## 7. Checkout (Order Placement)

// POST /api/checkout
app.post("/api/checkout", attachUserId, async (req, res) => {
    try {
        const { selectedAddressId, totalAmount } = req.body;
        
        // 1. Fetch User and Populate Cart (to get product details for the order snapshot)
        const user = await User.findById(req.userId).populate("cart.product");

        if (!user || user.cart.length === 0) {
            return res.status(400).json({ message: "Cart is empty. Cannot place order." });
        }

        // 2. Validate and retrieve the shipping address
        const deliveryAddress = user.addresses.id(selectedAddressId);
        if (!deliveryAddress) {
            // Sends the specific error message back to the frontend
            return res.status(400).json({ message: "Invalid delivery address selected." });
        }
        
        // 3. Prepare the items for the Order snapshot
        const orderItems = user.cart.map(item => ({
            product: item.product._id,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price, // Captures price at time of purchase
        }));

        // 4. Create the New Order Document
        const newOrder = new Order({
            user: req.userId,
            items: orderItems, // Correctly uses 'items' field from OrderSchema
            shippingAddress: deliveryAddress.toObject(), // Correctly uses 'shippingAddress'
            totalAmount: totalAmount,
            orderStatus: 'Processing' // Uses default enum value
        });

        const savedOrder = await newOrder.save();
        
        // 5. Update User: Clear Cart AND Add Order ID to History
        user.cart = [];
        user.orderHistory.push(savedOrder._id); // Add order to history
        await user.save();

        // 6. Send Success Response
        res.status(201).json({ 
            message: "Order Placed Successfully. Your cart has been cleared.",
            orderId: savedOrder._id
        });

    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({ message: "Failed to place order. Please check server logs.", error: error.message });
    }
});


// --- Start Server ---
