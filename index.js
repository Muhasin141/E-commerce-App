const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose"); 


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

  // 2. Clear and Seed Demo User (left commented as in original code)
  // await User.deleteMany({}); 
  // await User.create({
  //  _id: DEMO_USER_ID,
  //  name: "Demo User",
  //  email: "demo@example.com",
  //  password: "testpassword", 
  //  addresses: [{
  //   // Using Mongoose ObjectId for sub-documents
  //   _id: new mongoose.Types.ObjectId(), 
  //   fullName: "Demo Home",
  //   street: "123 Main Street",
  //   city: "Reactville",
  //   state: "CA",
  //   zipCode: "90210",
  //   phone: "5551234567"
  //  }],
  //  cart: [], 
  //  wishlist: [],
  //  orderHistory:[]
  // });
  // console.log("Demo User created successfully.");

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
  // ⭐ MODIFIED: Extract size from request body. Default to null if not provided.
  const { productId, size = null } = req.body; 

  if (!productId) {
   return res.status(400).json({ message: "Product ID is required for cart operation." });
  }

  let user = await User.findById(req.userId);

  if (!user) {
   return res.status(404).json({ message: "User not found in the database." });
  }
  
  // ⭐ CHANGE: Find cart item by both product ID AND size
  const cartItemIndex = user.cart.findIndex(
   item => item.product.toString() === productId && item.size === size
  );

  if (cartItemIndex > -1) {
   // Item exists (with the same size): Increase quantity
   user.cart[cartItemIndex].quantity += 1;
  } else {
   // Item doesn't exist (or exists with a different size): Add new item.
   // ⭐ NEW: Include the selected size when adding a new item
   user.cart.push({ product: productId, quantity: 1, size }); 
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
  // ⭐ MODIFIED: Extract size from request body. Default to null if not provided.
  const { productId, action, size = null } = req.body; 
  let user = await User.findById(req.userId);
  
  if (!user) return res.status(404).json({ message: "User not found." });

  // ⭐ CHANGE: Find the exact cart item using both product ID and size
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
    // If quantity is 1, remove the item entirely
    // ⭐ CHANGE: Filter items based on both product ID and size
    user.cart = user.cart.filter(
     item => !(item.product.toString() === productId && item.size === size)
    );
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
// NOTE: This route is sub-optimal for size support as it only uses productId. 
// For production, you would ideally create a new route like DELETE /api/cart/item 
// and send productId and size in the request body to delete a specific size instance.
app.delete("/api/cart/:productId", attachUserId, async (req, res) => {
 try {
  // NOTE: This route currently removes ALL items of a single product ID, regardless of size. 
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

// ... Wishlist Routes (No changes needed) ...

// GET /api/user/order/:orderId - Fetch a Single Order Detail
app.get("/api/user/order/:orderId", attachUserId, async (req, res) => {
 try {
  const { orderId } = req.params;
  const userId = req.userId; 

  const order = await Order.findOne({ 
   _id: orderId, 
   user: userId 
  })
  .populate({
   path: 'items.product', 
   select: 'name price imageUrl'
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
      select: 'name' 
    });
  
  res.status(200).json({ orders });
 } catch (error) {
  res.status(500).json({ message: "Failed to fetch order history.", error: error.message });
 }
});


// ## 7. Checkout (Order Placement)
app.post("/api/checkout", attachUserId, async (req, res) => {
  try {
    const { selectedAddressId, totalAmount } = req.body;
    
    // 1. Fetch User and Populate Cart
    const user = await User.findById(req.userId).populate("cart.product");

    if (!user || user.cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty. Cannot place order." });
    }

    // 2. Validate and retrieve the shipping address
    const deliveryAddress = user.addresses.id(selectedAddressId);
    if (!deliveryAddress) {
      return res.status(400).json({ message: "Invalid delivery address selected." });
    }
    
    // 3. Prepare the items for the Order snapshot
    const orderItems = user.cart.map(item => ({
      product: item.product._id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price, 
      // ⭐ CRITICAL: Copy the selected size from the cart item
      size: item.size || null, 
    }));

    // 4. Create the New Order Document
    const newOrder = new Order({
      user: req.userId,
      items: orderItems, 
      shippingAddress: deliveryAddress.toObject(), 
      totalAmount: totalAmount,
      orderStatus: 'Processing' 
    });

    const savedOrder = await newOrder.save();
    
    // 5. Update User: Clear Cart AND Add Order ID to History
    user.cart = [];
    user.orderHistory.push(savedOrder._id); 
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