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
app.use(express.json());


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
    
    await Product.deleteMany({}); 
    const jsonData = fs.readFileSync("products.json", "utf-8");
    const productsData = JSON.parse(jsonData);
    await Product.insertMany(productsData);
    console.log(`Product Data seeded successfully (${productsData.length} items).`);

    /*     
        await User.deleteMany({ _id: DEMO_USER_ID }); 
        await User.create({
            _id: DEMO_USER_ID,
            name: "Demo User",
            email: "demo@example.com",
            password: "testpassword", 
            addresses: [{
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


app.get("/api/products", async (req, res) => {
  try {
    const { category, rating, sort, q } = req.query;
    let query = {};
    let sortOptions = {};

    if (category) {
      query.category = { $in: category.split(',') };
    }

    if (rating) {
      query.rating = { $gte: Number(rating) };
    }
    
    if (q) {
      query.name = { $regex: new RegExp(q, 'i') };
    }

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
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: "Invalid product ID format." });
    }
    res.status(500).json({ message: "Error fetching product details.", error: error.message });
  }
});


app.get("/api/cart", attachUserId, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate("cart.product");
    
    if (!user) return res.status(404).json({ message: "User not found." });
    
    res.status(200).json({ cart: user.cart });
  } catch (error) {
    console.error("Error fetching cart:", error.message);
    res.status(500).json({ message: "Failed to fetch cart.", error: error.message });
  }
});


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


app.get("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const user = await User.findById(req.userId).populate("wishlist");
        if (!user) return res.status(404).json({ message: "User not found." });

        res.status(200).json({ wishlist: user.wishlist });
    } catch (error) {
        console.error("Error fetching wishlist:", error.message);
        res.status(500).json({ message: "Failed to fetch wishlist.", error: error.message });
    }
});


app.post("/api/wishlist", attachUserId, async (req, res) => {
    try {
        const { productId } = req.body;
        const user = await User.findById(req.userId);
        
        if (!user) return res.status(404).json({ message: "User not found." });

        if (!user.wishlist.includes(productId)) {
            user.wishlist.push(productId);
            await user.save();
        }

        const updatedUser = await user.populate("wishlist");
        res.status(200).json({ wishlist: updatedUser.wishlist });
    } catch (error) {
        res.status(500).json({ message: "Failed to update wishlist.", error: error.message });
    }
});


app.delete("/api/wishlist/:productId", attachUserId, async (req, res) => {
    try {
        const { productId } = req.params;
        const user = await User.findById(req.userId);

        if (!user) return res.status(404).json({ message: "User not found." });

        user.wishlist = user.wishlist.filter(item => item.toString() !== productId);
        await user.save();

        const updatedUser = await user.populate("wishlist");
        res.status(200).json({ wishlist: updatedUser.wishlist });
    } catch (error) {
        res.status(500).json({ message: "Failed to update wishlist.", error: error.message });
    }
});


app.get("/api/user/profile", attachUserId, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password -__v")
      .populate("wishlist") 
      .populate("orderHistory"); 

    if (!user) {
      return res.status(404).json({ message: "User not found. Check DEMO_USER_ID or seeding." });
    }
    
    res.status(200).json(user); 

  } catch (error) {
    console.error("Error fetching user profile:", error.message);
    res.status(500).json({ message: "Failed to fetch user profile.", error: error.message });
  }
});


app.get("/api/user/orders", attachUserId, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate('items.product', 'name price imageUrl');

    if (!orders) {
      return res.status(200).json({ orders: [] });
    }

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


app.post("/api/checkout", attachUserId, async (req, res) => {
  try {
    const { selectedAddressId, totalAmount } = req.body;
    
    const user = await User.findById(req.userId).populate("cart.product");

    if (!user || user.cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty. Cannot place order." });
    }

    const deliveryAddress = user.addresses.id(selectedAddressId);
    if (!deliveryAddress) {
      return res.status(400).json({ message: "Invalid delivery address selected." });
    }
    
    const orderItems = user.cart.map(item => ({
      product: item.product._id,
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price, 
      size: item.size || null, 
    }));

    const newOrder = new Order({
      user: req.userId,
      items: orderItems, 
      shippingAddress: deliveryAddress.toObject(), 
      totalAmount: totalAmount,
      orderStatus: 'Processing' 
    });

    const savedOrder = await newOrder.save();
    
    user.cart = [];
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
