const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose"); 


const PORT = 4000;

// IMPORTANT: This ID is used to simulate a logged-in user in a frontend-only context.
const DEMO_USER_ID = "6903c199a74f687293cca302"; 


// Import Mongoose Models and DB Connection
const { initializeDatabase } = require("./db/db.connect");
const Product = require("./models/models.products");
const User = require("./models/models.user");
const Order = require("./models/models.order"); 


// --- MIDDLEWARE SETUP ---
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());


// Middleware to attach the Demo User ID to every request
const attachUserId = (req, res, next) => {
  // In a real app, this would come from a JWT/session
  req.userId = DEMO_USER_ID; 
  next();
};


// --- INITIALIZATION & DATA SEEDING ---

// Function to seed product and user data (uncomment User creation for first run)
async function seedData() {
  try {
    console.log("--- Starting Data Seeding ---");
    
    await Product.deleteMany({}); 
    const jsonData = fs.readFileSync("products.json", "utf-8");
    const productsData = JSON.parse(jsonData);
    await Product.insertMany(productsData);
    console.log(`Product Data seeded successfully (${productsData.length} items).`);

    // --- Uncomment this block to ensure the Demo User exists ---
    /* 
        await User.deleteMany({ _id: DEMO_USER_ID }); 
        await User.create({
            _id: DEMO_USER_ID,
            name: "Demo User",
            email: "demo@example.com",
            password: "testpassword", 
            addresses: [{
                // Using Mongoose ObjectId for subdocument _id
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
    */
  } catch (error) {
    console.error("Error seeding the data:", error);
  } finally {
    console.log("--- Data Seeding Complete ---");
  }
}


initializeDatabase().then(() => {
  // seedData(); // Call this once to populate your DB when starting the server
  app.listen(PORT, () => {
    console.log(` Server started on port ${PORT}`);
    console.log(`Backend API running at http://localhost:${PORT}`);
  });
});


// --- 1. PRODUCT ROUTES ---

// GET /api/products: Product Listing with Filters, Sort, and Search
app.get("/api/products", async (req, res) => {
  try {
    const { category, rating, sort, q } = req.query;
    let query = {};
    let sortOptions = {};

    // Filter by Category (multiple categories separated by comma)
    if (category) {
      query.category = { $in: category.split(',') };
    }

    // Filter by Rating (minimum rating)
    if (rating) {
      query.rating = { $gte: Number(rating) };
    }
    
    // Search by product name (case-insensitive regex)
    if (q) {
      query.name = { $regex: new RegExp(q, 'i') };
    }

    // Sort by Price
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

// GET /api/products/:productId: Single Product Details
app.get("/api/products/:productId", async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(200).json({ product });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: "Invalid product ID format." });
    }
    res.status(500).json({ message: "Error fetching product details.", error: error.message });
  }
});


// --- 2. CART MANAGEMENT ROUTES ---

// GET /api/cart: Get user cart
app.get("/api/cart", attachUserId, async (req, res) => {
  try {
    // Populate the actual product data inside the cart items
    const user = await User.findById(req.userId).populate("cart.product");
    
    if (!user) return res.status(404).json({ message: "User not found." });
    
    res.status(200).json({ cart: user.cart });
  } catch (error) {
    console.error("Error fetching cart:", error.message);
    res.status(500).json({ message: "Failed to fetch cart.", error: error.message });
  }
});

// POST /api/cart: Add item to cart or increment quantity
app.post("/api/cart", attachUserId, async (req, res) => {
  try {
    const { productId, size = null } = req.body; 

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required for cart operation." });
    }

    let user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found in the database." });
    }
    
    // Find item based on product ID AND size (variant)
    const cartItemIndex = user.cart.findIndex(
      item => item.product.toString() === productId && item.size === size
    );

    if (cartItemIndex > -1) {
      user.cart[cartItemIndex].quantity += 1;
    } else {
      user.cart.push({ product: productId, quantity: 1, size }); 
    }

    await user.save();
    
    user = await user.populate("cart.product"); 
    
    res.status(200).json({ cart: user.cart });
    
  } catch (error) {
    console.error("Error in POST /api/cart:", error.message); 
    res.status(500).json({ message: "Failed to add/update item in cart.", error: error.message });
  }
});

// POST /api/cart/quantity: Increment or Decrement quantity
app.post("/api/cart/quantity", attachUserId, async (req, res) => {
  try {
    const { productId, action, size = null } = req.body; 
    let user = await User.findById(req.userId);
    
    if (!user) return res.status(404).json({ message: "User not found." });

    const cartItem = user.cart.find(
      item => item.product.toString() === productId && item.size === size
    );
    
    if (!cartItem) return res.status(404).json({ message: "Item not found in cart." });

    if (action === 'increment') {
      cartItem.quantity += 1;
    } else if (action === 'decrement') {
      if (cartItem.quantity > 1) {
        cartItem.quantity -= 1;
      } else {
        // Remove item if quantity drops to zero
        user.cart = user.cart.filter(
          item => !(item.product.toString() === productId && item.size === size)
        );
      }
    } else {
      return res.status(400).json({ message: "Invalid action provided." });
    }
    
    await user.save();
    
    user = await user.populate("cart.product"); 
    res.status(200).json({ cart: user.cart });

  } catch (error) {
    console.error("Error in POST /api/cart/quantity:", error.message);
    res.status(500).json({ message: "Failed to update cart quantity.", error: error.message });
  }
});

// DELETE /api/cart/:productId: Remove a product entirely from the cart
// NOTE: This endpoint assumes removal by product ID, ignoring size for simplicity.
// DELETE /api/cart/:productId: Remove a specific product variant from the cart
app.delete("/api/cart/:productId", attachUserId, async (req, res) => {
    try {
        const { productId } = req.params;
        const { size } = req.query; // <<< Capture size from query parameter
        const user = await User.findById(req.userId);
        
        if (!user) return res.status(404).json({ message: "User not found." });
        
        // --- MODIFIED FILTER LOGIC ---
        // Only remove the cart entry that matches BOTH product ID and size
        user.cart = user.cart.filter(item => 
            !(item.product.toString() === productId && (item.size || null) === (size || null)) 
        );
        // ------------------------------
        
        await user.save();
        
        const updatedUser = await user.populate("cart.product");
        res.status(200).json({ cart: updatedUser.cart, message: "Item removed from cart." }); // Added message for alert
        
    } catch (error) {
        console.error("Error in DELETE /api/cart/:productId:", error.message);
        res.status(500).json({ message: "Failed to remove item from cart.", error: error.message });
    }
});

// DELETE /api/cart/clear: Clear entire cart using updateOne
app.delete("/api/cart/clear", attachUserId, async (req, res) => {
    try {
        // Use updateOne to find the user by ID and set the cart field to an empty array
        const result = await User.updateOne(
            { _id: req.userId },       // 1. Filter: Find the user document using the request ID
            { $set: { cart: [] } }     // 2. Update: Set the 'cart' field to an empty array
        );

        // Check if the user was found and updated (matchedCount > 0)
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        
        // Return the empty array, which is crucial for the frontend state update
        res.status(200).json({
            message: "Cart successfully cleared.",
            cart: [] 
        });
    } catch (error) {
        console.error("Error clearing cart:", error.message);
        res.status(500).json({ message: "Failed to clear cart.", error: error.message });
    }
});

// GET /api/wishlist: Get user wishlist
app.get("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const user = await User.findById(req.userId).populate("wishlist.product");
        
        if (!user) return res.status(404).json({ message: "User not found." });

        res.status(200).json({ wishlist: user.wishlist });
    } catch (error) {
        console.error("Error fetching wishlist:", error.message);
        res.status(500).json({ message: "Failed to fetch wishlist.", error: error.message });
    }
});

// POST /api/wishlist: Add or Remove item from wishlist
app.post("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const { productId, size = null, action } = req.body; 

        if (!productId || !action) {
            return res.status(400).json({ message: "Product ID and action are required." });
        }
        
        let user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        const wishlistIndex = user.wishlist.findIndex(
            item => item.product.toString() === productId && item.size === size
        );

        if (action === 'ADD') {
            if (wishlistIndex === -1) {
                user.wishlist.push({ product: productId, size: size });
            }
        } else if (action === 'REMOVE') {
            if (wishlistIndex > -1) {
                user.wishlist.splice(wishlistIndex, 1);
            }
        } else {
            return res.status(400).json({ message: "Invalid wishlist action provided." });
        }

        await user.save();
        
        const updatedUser = await user.populate("wishlist.product");
        res.status(200).json({ wishlist: updatedUser.wishlist });
    } catch (error) {
        console.error("Error in POST /api/wishlist:", error.message);
        res.status(500).json({ message: "Failed to update wishlist.", error: error.message });
    }
});

// DELETE /api/wishlist/clear: Clear entire wishlist
app.delete("/api/wishlist/clear", attachUserId, async (req, res) => {
    try {
        let user = await User.findById(req.userId);

        if (!user) return res.status(404).json({ message: "User not found." });

        user.wishlist = [];
        await user.save();

        res.status(200).json({ 
            message: "Wishlist successfully cleared.",
            wishlist: []
        });
    } catch (error) {
        console.error("Error clearing wishlist:", error.message);
        res.status(500).json({ message: "Failed to clear wishlist.", error: error.message });
    }
});


// --- 4. USER PROFILE & ORDER HISTORY ROUTES ---

// GET /api/user/profile: Get user profile details
app.get("/api/user/profile", attachUserId, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password -__v") // Exclude password and version key
      .populate("wishlist") // Populate to get full product data if needed
      .populate("orderHistory"); // Populate to get full order data if needed

    if (!user) {
      return res.status(404).json({ message: "User not found. Check DEMO_USER_ID or seeding." });
    }
    
    // Returns user object including addresses subdocument
    res.status(200).json(user); 

  } catch (error) {
    console.error("Error fetching user profile:", error.message);
    res.status(500).json({ message: "Failed to fetch user profile.", error: error.message });
  }
});

// PUT /api/user/profile: Update user profile details
app.put("/api/user/profile", attachUserId, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const userId = req.userId;

    const user = await User.findByIdAndUpdate(
      userId,
      { name, email, phone },
      { new: true, runValidators: true } // Return the updated doc & run schema validations
    ).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ 
      message: "Profile updated successfully.", 
      user: user 
    });
  } catch (error) {
    console.error("Error updating profile:", error.message);
    // Handle validation errors (e.g., duplicate email)
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already in use." });
    }
    res.status(500).json({ message: "Failed to update user profile.", error: error.message });
  }
});

// GET /api/user/orders: Get all user orders (Order History)
app.get("/api/user/orders", attachUserId, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate('items.product', 'name price imageUrl'); // Populate minimal product details

    res.status(200).json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error.message);
    res.status(500).json({ message: "Failed to fetch order history.", error: error.message });
  }
});

app.get("/api/user/order/:orderId", attachUserId, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;

        // 1. Fetch the order, ensuring it belongs to the logged-in user
        const order = await Order.findOne({ 
            _id: orderId, 
            user: userId 
        })
        .populate({
            path: 'items.product', // CRITICAL: Populate product details
            select: 'name price imageUrl' // Only send necessary fields for the frontend
        });

        // 2. Handle 404 Not Found
        if (!order) {
            return res.status(404).json({ message: 'Order not found or access denied.' });
        }

        // 3. Success: Send the populated order data
        res.status(200).json({ 
            order 
        });

    } catch (error) {
        console.error("Error fetching specific order details:", error);
        if (error.kind === 'ObjectId') {
            return res.status(404).json({ message: "Invalid order ID format." });
        }
        // Ensure server errors also return JSON
        res.status(500).json({ message: 'Internal Server Error while fetching order details.', error: error.message });
    }
});

// --- 5. ADDRESS MANAGEMENT ROUTES (CRUD) ---

// GET /api/user/addresses: Get all addresses for the user
app.get("/api/user/addresses", attachUserId, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("addresses");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ addresses: user.addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error.message);
    res.status(500).json({ message: "Failed to fetch addresses.", error: error.message });
  }
});

// POST /api/user/addresses: Add a new address
// POST /api/user/addresses: Add a new address
app.post("/api/user/addresses", attachUserId, async (req, res) => {
  try {
    const newAddress = req.body;
    let user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // 💡 FIX 1: Enforce single default address logic
    if (newAddress.isDefault) {
        user.addresses.forEach(addr => {
            addr.isDefault = false; // Unset existing defaults
        });
    }

    // This pushes the new address data to the array
    user.addresses.push(newAddress);
    
    await user.save(); 

    const addedAddress = user.addresses[user.addresses.length - 1];

    res.status(201).json({ 
      message: "Address added successfully.",
      address: addedAddress 
    });
  } catch (error) {
    console.error("Error adding address:", error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: "Address data validation failed.", 
        details: errors
      });
    }

    res.status(500).json({ message: "Failed to add address.", error: error.message });
  }
});

// PUT /api/user/addresses/:addressId: Update an existing address
// PUT /api/user/addresses/:addressId: Update an existing address
app.put("/api/user/addresses/:addressId", attachUserId, async (req, res) => {
  try {
    const { addressId } = req.params;
    const updatedAddressData = req.body; // Contains the new data, potentially { isDefault: true }
    let user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const addressToUpdate = user.addresses.id(addressId);

    if (!addressToUpdate) {
      return res.status(404).json({ message: "Address not found." });
    }
    
    // 💡 FIX 2: Check for 'isDefault' update and unset others
    if (updatedAddressData.isDefault === true) {
        user.addresses.forEach(addr => {
            // Unset default for all addresses *except* the one we are currently updating
            if (addr._id.toString() !== addressId) {
                addr.isDefault = false;
            }
        });
    }

    Object.assign(addressToUpdate, updatedAddressData);
    await user.save(); // Validation runs here

    res.status(200).json({ 
      message: "Address updated successfully.", 
      address: addressToUpdate 
    });

  } catch (error) {
    console.error("Error updating address:", error.message);
    
    // 💡 FIX 3: Add Validation Error check for PUT route
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: "Address data validation failed during update.", 
        details: errors
      });
    }

    res.status(500).json({ message: "Failed to update address.", error: error.message });
  }
});
// DELETE /api/user/addresses/:addressId: Remove an address
// DELETE /api/user/addresses/:addressId: Remove an address
app.delete("/api/user/addresses/:addressId", attachUserId, async (req, res) => {
  try {
    const { addressId } = req.params;
    let user = await User.findById(req.userId);
    // ... (User Not Found check)

    const addressToRemove = user.addresses.id(addressId);
    // ... (Address Not Found check)
    
    // 💡 OPTIONAL FIX: Handle deletion of the default address
    const wasDefault = addressToRemove.isDefault;

    addressToRemove.deleteOne(); 

    if (wasDefault && user.addresses.length > 0) {
        // Set the first remaining address as the new default
        user.addresses[0].isDefault = true;
    }

    await user.save();

    res.status(200).json({ message: "Address removed successfully." });

  } catch (error) {
    console.error("Error deleting address:", error.message);
    res.status(500).json({ message: "Failed to delete address.", error: error.message });
  }
});

// --- 6. CHECKOUT ROUTE ---

// POST /api/checkout: Process the order
app.post("/api/checkout", attachUserId, async (req, res) => {
  try {
    const { selectedAddressId, totalAmount } = req.body;
    
    const user = await User.findById(req.userId).populate("cart.product");

    if (!user || user.cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty. Cannot place order." });
    }

    // Find the selected address from the user's addresses subdocument
    const deliveryAddress = user.addresses.id(selectedAddressId);
    if (!deliveryAddress) {
      return res.status(400).json({ message: "Invalid delivery address selected." });
    }
    
    // Map cart items to order items, ensuring necessary data is captured (price/size)
    const orderItems = user.cart.map(item => ({
      product: item.product._id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price, // Capture current price at time of order
      size: item.size || null, 
    }));

    const newOrder = new Order({
      user: req.userId,
      items: orderItems, 
      shippingAddress: deliveryAddress.toObject(), // Save a snapshot of the address
      totalAmount: totalAmount,
      orderStatus: 'Processing' 
    });

    const savedOrder = await newOrder.save();
    
    // 1. Clear the user's cart
    user.cart = [];
    // 2. Add the new order to the user's order history
    user.orderHistory.push(savedOrder._id); 
    await user.save();

    res.status(201).json({ 
      message: "Order Placed Successfully. Your cart has been cleared.",
      orderId: savedOrder._id
    });

  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: "Failed to place order. Please check server logs.", error: error.message });
  }
});

